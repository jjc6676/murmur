// Hidden capture window: microphone for dictation; microphone + system loopback for meetings.
// Audio is resampled to 16 kHz mono by the AudioContext and pushed to main as PCM16 chunks.
import { api, onEvent } from '../lib/api';
import workletUrl from './pcm-worklet.js?url';

const SAMPLE_RATE = 16000;

interface Tap {
  stream: MediaStream;
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

async function tapStream(stream: MediaStream, signal: AbortSignal, onChunk: (buf: ArrayBuffer, level: number) => void): Promise<Tap> {
  let ctx: AudioContext | undefined;
  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    stream.getTracks().forEach((track) => track.stop());
    if (ctx) void ctx.close();
  }
  signal.addEventListener('abort', stop, { once: true });
  try {
    signal.throwIfAborted();
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => { throw new Error('AudioContextRecovery'); });
    }
    await ctx.audioWorklet.addModule(workletUrl).catch(() => { throw new Error('AudioWorkletLoadError'); });
    signal.throwIfAborted();
    if (!stream.getAudioTracks().some((t) => t.readyState === 'live')) throw new Error('MicDisconnected');
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
    let flushed: (() => void) | undefined;
    node.port.onmessage = (e: MessageEvent<Float32Array | string>) => {
      if (e.data === 'flushed') flushed?.();
      if (stopped || typeof e.data === 'string') return;
      const { buf, rms } = toPcm16(e.data);
      onChunk(buf, Math.min(1, rms * 4));
    };
    src.connect(node);
    return {
      stream, stop,
      flush() {
        const { promise, resolve } = Promise.withResolvers<void>();
        flushed = resolve;
        node.port.postMessage('flush');
        const timer = setTimeout(resolve, 300);
        return promise.finally(() => clearTimeout(timer));
      },
    };
  } catch (error) {
    stop();
    throw error;
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

function micError(error: unknown): string {
  if (error instanceof Error && /^(AudioWorkletLoadError|AudioContextRecovery|MicDisconnected)$/.test(error.message)) return error.message;
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'MicNotFound';
  if (name === 'NotReadableError') return 'MicNotReadable';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'MicrophonePermissionRevoked';
  if (name === 'AbortError' || name === 'TimeoutError') return 'MicAccessTimeout';
  return `MicAccessError:${error instanceof Error ? error.message : String(error)}`;
}

async function openMic(deviceId: string): Promise<MediaStream> {
  const constraints: MediaTrackConstraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId && deviceId !== 'default') constraints.deviceId = { exact: deviceId };
  const request = navigator.mediaDevices.getUserMedia({ audio: constraints });
  const { promise: timeout, reject } = Promise.withResolvers<never>();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    reject(new DOMException('Timed out opening microphone', 'TimeoutError'));
  }, 8000);
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (timedOut) void request.then((stream) => stream.getTracks().forEach((track) => track.stop()), () => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function openSystemAudio(): Promise<MediaStream> {
  const s = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  s.getVideoTracks().forEach((t) => t.stop());
  if (!s.getAudioTracks().length) throw new Error('System audio is not available');
  return new MediaStream(s.getAudioTracks());
}

// ------------------------------------------------------------------ dictation
interface DictationCapture {
  id: string;
  opening: AbortController;
  tap?: Tap;
}
let dictation: DictationCapture | null = null;

async function startDictation(id: string, deviceId: string): Promise<void> {
  if (dictation?.id === id) return;
  if (dictation) void stopDictation(dictation.id);
  const owner: DictationCapture = { id, opening: new AbortController() };
  dictation = owner;
  const fail = (error: string) => {
    if (dictation !== owner) return;
    dictation = null;
    owner.opening.abort();
    owner.tap?.stop();
    void api.dictation.captureEnded(id, error);
  };
  try {
    const stream = await openMic(deviceId);
    const tap = await tapStream(stream, owner.opening.signal, (buf, level) => void api.dictation.pushAudio(id, buf, level));
    if (dictation !== owner) {
      tap.stop();
      return;
    }
    owner.tap = tap;
    stream.getAudioTracks()[0].addEventListener('ended', () => fail('MicDisconnected'), { once: true });
    void api.dictation.captureOpened(id);
    void listDevices(true);
  } catch (error) {
    fail(micError(error));
  }
}

async function stopDictation(id: string): Promise<void> {
  const owner = dictation;
  if (!owner || owner.id !== id) return;
  dictation = null;
  owner.opening.abort();
  try {
    await owner.tap?.flush();
  } finally {
    owner.tap?.stop();
    void api.dictation.captureEnded(id, null);
  }
}

// ------------------------------------------------------------------ meeting
interface MeetingCapture {
  id: string;
  opening: AbortController;
  mic?: Tap;
  system?: Tap;
  systemOpening: boolean;
  paused: boolean;
}
let meeting: MeetingCapture | null = null;

async function openMeetingInput(m: MeetingCapture, source: 'mic' | 'system', stream: Promise<MediaStream>): Promise<void> {
  try {
    const tap = await tapStream(await stream, m.opening.signal, (buf, level) => {
      if (meeting === m && !m.paused) void api.recorder.pushAudio(source, buf, level);
    });
    if (meeting !== m) {
      tap.stop();
      return;
    }
    m[source] = tap;
    if (source === 'system') {
      tap.stream.getAudioTracks()[0].addEventListener('ended', () => {
        if (meeting !== m || m.system !== tap) return;
        m.system = undefined;
        tap.stop();
        void api.recorder.systemAudioStatus(m.id, false, 'dropped');
      }, { once: true });
      void api.recorder.systemAudioStatus(m.id, true);
    }
  } catch (error) {
    if (meeting !== m) return;
    if (source === 'system') void api.recorder.systemAudioStatus(m.id, false, 'unavailable');
    console.error(`meeting ${source} failed`, error);
  } finally {
    if (source === 'system') m.systemOpening = false;
  }
}

function retryMeetingSystemAudio(id: string): void {
  const m = meeting;
  if (!m || m.id !== id || m.system || m.systemOpening) return;
  m.systemOpening = true;
  void openMeetingInput(m, 'system', openSystemAudio());
}

/**
 * getDisplayMedia (system loopback) needs transient user activation, so main invokes this through
 * executeJavaScript(..., userGesture=true) and the call is issued synchronously before any await.
 */
function startMeeting(deviceId: string, id: string): void {
  if (meeting) return;
  meeting = { id, opening: new AbortController(), systemOpening: false, paused: false };
  retryMeetingSystemAudio(id);
  void openMeetingInput(meeting, 'mic', openMic(deviceId));
}

declare global {
  interface Window {
    murmurStartMeeting(deviceId: string, meetingId: string): void;
    murmurRetryMeetingSystemAudio(meetingId: string): void;
  }
}
window.murmurStartMeeting = startMeeting;
window.murmurRetryMeetingSystemAudio = retryMeetingSystemAudio;

async function stopMeeting(): Promise<void> {
  const m = meeting;
  meeting = null;
  if (!m) return;
  m.opening.abort();
  try {
    await Promise.all([m.mic?.flush(), m.system?.flush()]);
  } finally {
    m.mic?.stop();
    m.system?.stop();
  }
}

onEvent('capture:command', (cmd) => {
  if (cmd.kind === 'dictation') {
    if (cmd.action === 'start') void startDictation(cmd.sessionId, cmd.deviceId);
    else void stopDictation(cmd.sessionId);
    return;
  }
  if (cmd.action === 'stop') void stopMeeting();
  else if (meeting && (cmd.action === 'pause' || cmd.action === 'resume')) meeting.paused = cmd.action === 'pause';
});

// Chromium withholds labels before permission. Never open a stream just to populate settings.
async function listDevices(micIsOpen = false): Promise<void> {
  try {
    if (!micIsOpen) {
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permission.state !== 'granted') return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications');
    if (inputs.some((d) => !d.label)) return;
    window.murmur.send('capture:devices', inputs.map((d) => ({ deviceId: d.deviceId, label: d.label })));
  } catch {
    // Device enumeration is optional; capture errors are reported by the session itself.
  }
}
navigator.mediaDevices.addEventListener('devicechange', () => void listDevices());
void listDevices();

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
