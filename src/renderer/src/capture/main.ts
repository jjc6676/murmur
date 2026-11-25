// Hidden capture window: microphone for dictation; microphone + system loopback for meetings.
// Audio is resampled to 16 kHz mono by the AudioContext and pushed to main as PCM16 chunks.
import { api, onEvent } from '../lib/api';
import workletUrl from './pcm-worklet.js?url';

const SAMPLE_RATE = 16000;

interface Tap {
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
  flush(): Promise<void>;
  stop(): void;
}

function toPcm16(f: Float32Array): { buf: ArrayBuffer; rms: number } {
  const out = new Int16Array(f.length);
  let sum = 0;
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    sum += s * s;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return { buf: out.buffer, rms: Math.sqrt(sum / Math.max(1, f.length)) };
}

async function tapStream(stream: MediaStream, onChunk: (buf: ArrayBuffer, level: number) => void): Promise<Tap> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await ctx.audioWorklet.addModule(workletUrl);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
  let paused = false;
  let flushed: (() => void) | null = null;
  node.port.onmessage = (e: MessageEvent<Float32Array | string>) => {
    if (e.data === 'flushed') {
      flushed?.();
      return;
    }
    if (paused || typeof e.data === 'string') return;
    const { buf, rms } = toPcm16(e.data);
    onChunk(buf, Math.min(1, rms * 4));
  };
  src.connect(node);
  return {
    stream,
    ctx,
    node,
    flush() {
      const { promise, resolve } = Promise.withResolvers<void>();
      flushed = resolve;
      node.port.postMessage('flush');
      setTimeout(resolve, 300);
      return promise;
    },
    stop() {
      paused = true;
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

async function openMic(deviceId: string): Promise<MediaStream> {
  const constraints: MediaTrackConstraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId && deviceId !== 'default') constraints.deviceId = { exact: deviceId };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    // selected device vanished -> fall back to system default
    if (deviceId && deviceId !== 'default') return navigator.mediaDevices.getUserMedia({ audio: { ...constraints, deviceId: undefined } });
    throw e;
  }
}

async function openSystemAudio(): Promise<MediaStream> {
  const s = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  s.getVideoTracks().forEach((t) => t.stop());
  if (!s.getAudioTracks().length) throw new Error('System audio is not available');
  return new MediaStream(s.getAudioTracks());
}

// ------------------------------------------------------------------ dictation
let dictation: Tap | null = null;
let dictationStarting: Promise<void> | null = null;

async function startDictation(deviceId: string): Promise<void> {
  if (dictation || dictationStarting) return;
  dictationStarting = (async () => {
    try {
      const stream = await openMic(deviceId);
      dictation = await tapStream(stream, (buf, level) => void api.dictation.pushAudio(buf, level));
    } catch (e) {
      dictation = null;
      void api.dictation.captureEnded(e instanceof Error ? e.message : String(e));
    } finally {
      dictationStarting = null;
    }
  })();
  return dictationStarting;
}

async function stopDictation(): Promise<void> {
  if (dictationStarting) await dictationStarting;
  const tap = dictation;
  dictation = null;
  if (!tap) return;
  await tap.flush();
  tap.stop();
  await api.dictation.captureEnded(null);
}

// ------------------------------------------------------------------ meeting
let meeting: { mic: Tap | null; system: Tap | null; paused: boolean } | null = null;

async function startMeeting(deviceId: string): Promise<void> {
  if (meeting) return;
  meeting = { mic: null, system: null, paused: false };
  const m = meeting;
  const push = (source: 'mic' | 'system') => (buf: ArrayBuffer, level: number) => {
    if (!m.paused) void api.recorder.pushAudio(source, buf, level);
  };
  try {
    m.mic = await tapStream(await openMic(deviceId), push('mic'));
  } catch (e) {
    console.error('meeting mic failed', e);
  }
  try {
    m.system = await tapStream(await openSystemAudio(), push('system'));
  } catch (e) {
    console.error('meeting system audio failed', e);
  }
}

async function stopMeeting(): Promise<void> {
  const m = meeting;
  meeting = null;
  if (!m) return;
  await Promise.all([m.mic?.flush(), m.system?.flush()]);
  m.mic?.stop();
  m.system?.stop();
}

onEvent('capture:command', (cmd) => {
  if (cmd.kind === 'dictation') {
    if (cmd.action === 'start') void startDictation(cmd.deviceId);
    else if (cmd.action === 'stop') void stopDictation();
    return;
  }
  if (cmd.action === 'start') void startMeeting(cmd.deviceId);
  else if (cmd.action === 'stop') void stopMeeting();
  else if (meeting) meeting.paused = cmd.action === 'pause';
});

// Device list for settings (labels require a granted permission, which Electron grants automatically).
async function listDevices(): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications');
  window.murmur.send('capture:devices', inputs.map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' })));
}
navigator.mediaDevices.addEventListener('devicechange', () => void listDevices());
void navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((s) => s.getTracks().forEach((t) => t.stop()))
  .catch(() => undefined)
  .finally(() => void listDevices());

// ------------------------------------------------------------------ sounds (synthesized; capture window is always alive)
const TONES: Record<string, { f: number[]; d: number; type: OscillatorType; gain: number }> = {
  start: { f: [660, 990], d: 0.09, type: 'sine', gain: 0.12 },
  stop: { f: [880, 587], d: 0.09, type: 'sine', gain: 0.1 },
  paste: { f: [1320], d: 0.05, type: 'triangle', gain: 0.06 },
  notification: { f: [784, 1047], d: 0.12, type: 'sine', gain: 0.09 },
  achievement: { f: [523, 659, 784, 1047], d: 0.11, type: 'triangle', gain: 0.1 },
};
let soundCtx: AudioContext | null = null;
onEvent('sound:play', ({ name }) => {
  const t = TONES[name];
  if (!t) return;
  soundCtx ??= new AudioContext();
  const ctx = soundCtx;
  let at = ctx.currentTime + 0.01;
  for (const f of t.f) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = t.type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(t.gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + t.d);
    osc.connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + t.d + 0.02);
    at += t.d * 0.8;
  }
});
