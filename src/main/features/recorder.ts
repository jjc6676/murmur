import { writeFileSync } from 'node:fs';
import type { RecorderState, TranscriptSegment } from '@shared/types';
import { getCtx } from '../context';
import { newId, nowIso } from '../db';
import { broadcast, handle } from '../ipc';
import { findWindows, getForegroundApp } from '../native/win32';
import { paths } from '../paths';
import { showToast } from '../toasts';
import { ensureCapture, ensureHub, ensureRecorder, setContentProtectionForMeeting } from '../windows';
import { mixPcm16, pcm16ToWav, speechSeconds } from '../audio/wav';
import { generateMeetingSummary } from '../meetings/summary';
import { getMeeting, updateSearchable } from '../meetings/store';

const TRANSCRIBE_INTERVAL_MS = 10_000;
const BYTES_PER_SECOND = 16_000 * 2;

interface SourceAudio {
  chunks: Buffer[];
  bytes: number;
  transcribedBytes: number;
}

interface RecordingSession {
  meetingId: string;
  startedAt: number;
  sources: Record<'mic' | 'system', SourceAudio>;
  segments: TranscriptSegment[];
  transcribeTimer: NodeJS.Timeout;
  elapsedTimer: NodeJS.Timeout;
  warningTimer: NodeJS.Timeout | null;
  maximumTimer: NodeJS.Timeout;
  flush: Promise<void>;
  stopping: boolean;
}

let state: RecorderState = { phase: 'idle', meetingId: null, startedAt: null, elapsedSec: 0, micLevel: 0, systemLevel: 0, liveSegments: [], error: null };
let session: RecordingSession | null = null;
let detectedCall = false;
let detectionTimer: NodeJS.Timeout | null = null;

function setState(patch: Partial<RecorderState>): void {
  state = { ...state, ...patch };
  broadcast('recorder:state', state);
}

function sourceBuffer(source: SourceAudio): Buffer {
  return Buffer.concat(source.chunks, source.bytes);
}

async function translate(text: string): Promise<string | undefined> {
  const language = getCtx().settings.get().notetaker.translationLanguage;
  if (!language) return undefined;
  try {
    return await getCtx().llm({ system: `Translate the text to ${language}. Return only the translation.`, input: text });
  } catch {
    return undefined;
  }
}

async function flushSource(current: RecordingSession, sourceName: 'mic' | 'system'): Promise<void> {
  const source = current.sources[sourceName];
  const end = source.bytes;
  if (end <= source.transcribedBytes) return;
  const start = source.transcribedBytes;
  source.transcribedBytes = end;
  const pcm = sourceBuffer(source).subarray(start, end);
  if (speechSeconds(pcm) < 0.15) return;
  const settings = getCtx().settings.get();
  await getCtx().asr.start(settings.asr.model, settings.asr.threads);
  const result = await getCtx().asr.transcribe(pcm16ToWav(pcm), { language: settings.autoDetectLanguage ? 'auto' : (settings.languages[0] ?? 'en') });
  const speaker = sourceName === 'mic' ? 'you' : 'others';
  const speakerName = sourceName === 'mic' ? 'You' : 'Others';
  for (const part of result.segments.length ? result.segments : [{ start: 0, end: pcm.length / BYTES_PER_SECOND, text: result.text }]) {
    const text = part.text.trim();
    if (!text) continue;
    const segment: TranscriptSegment = {
      id: newId(),
      speaker,
      speakerName,
      start: start / BYTES_PER_SECOND + part.start,
      end: start / BYTES_PER_SECOND + part.end,
      text,
      edited: false,
      translatedText: await translate(text),
    };
    current.segments.push(segment);
    current.segments.sort((a, b) => a.start - b.start);
    broadcast('recorder:segment', segment);
  }
  getCtx().db.update('meetings', current.meetingId, { transcript: JSON.stringify(current.segments), language: result.language });
  updateSearchable(current.meetingId);
  if (session === current) setState({ liveSegments: [...current.segments] });
}

function queueFlush(current: RecordingSession): Promise<void> {
  current.flush = current.flush.then(async () => {
    await flushSource(current, 'mic');
    await flushSource(current, 'system');
  }).catch((error: unknown) => {
    setState({ error: error instanceof Error ? error.message : String(error) });
  });
  return current.flush;
}

export async function startRecording(opts: { title?: string; calendarEventId?: string } = {}): Promise<RecorderState> {
  if (session) return state;
  const settings = getCtx().settings.get();
  const meetingId = newId();
  const createdAt = nowIso();
  getCtx().db.insert('meetings', {
    id: meetingId,
    title: opts.title?.trim() || 'Untitled meeting',
    createdAt,
    endedAt: null,
    durationSec: 0,
    app: opts.calendarEventId ? 'calendar' : 'manual',
    myNotes: '',
    transcript: '[]',
    summary: null,
    summaryStatus: 'none',
    importSource: null,
    isDeleted: 0,
    language: 'en',
    audioPath: null,
    searchable: opts.title?.trim() || 'Untitled meeting',
  });
  const maxMs = settings.notetaker.maxRecordingMin * 60_000;
  const current: RecordingSession = {
    meetingId,
    startedAt: Date.now(),
    sources: {
      mic: { chunks: [], bytes: 0, transcribedBytes: 0 },
      system: { chunks: [], bytes: 0, transcribedBytes: 0 },
    },
    segments: [],
    transcribeTimer: setInterval(() => void queueFlush(current), TRANSCRIBE_INTERVAL_MS),
    elapsedTimer: setInterval(() => {
      if (session === current && state.phase === 'recording') setState({ elapsedSec: Math.floor((Date.now() - current.startedAt) / 1000) });
    }, 1000),
    warningTimer: maxMs > 60_000 ? setTimeout(() => showToast({ key: 'MeetingDurationWarning', title: 'One minute left', body: 'Murmur will stop at your recording limit.', tone: 'warning', target: 'bar' }), maxMs - 60_000) : null,
    maximumTimer: setTimeout(() => void stopRecording(), maxMs),
    flush: Promise.resolve(),
    stopping: false,
  };
  session = current;
  setContentProtectionForMeeting(settings.notetaker.hideInScreenCapture);
  setState({ phase: 'recording', meetingId, startedAt: current.startedAt, elapsedSec: 0, micLevel: 0, systemLevel: 0, liveSegments: [], error: null });
  ensureCapture().webContents.send('evt:capture:command', { kind: 'meeting', action: 'start', deviceId: settings.micDeviceId });
  if (settings.notetaker.notepadView !== 'hidden') ensureRecorder();
  broadcast('meetings:changed', { id: meetingId });
  return state;
}

function clearSessionTimers(current: RecordingSession): void {
  clearInterval(current.transcribeTimer);
  clearInterval(current.elapsedTimer);
  clearTimeout(current.warningTimer ?? undefined);
  clearTimeout(current.maximumTimer);
}

function addSummaryTodos(meetingId: string): void {
  const meeting = getMeeting(meetingId);
  if (!meeting?.summary) return;
  const existing = new Set(getCtx().db.all<{ title: string }>('SELECT title FROM todos WHERE meetingId = ? AND isDeleted = 0', meetingId).map((row) => row.title));
  let order = Date.now();
  for (const item of meeting.summary.actionItems) {
    if (!item.text.trim() || existing.has(item.text.trim())) continue;
    getCtx().db.insert('todos', { id: newId(), meetingId, title: item.text.trim(), status: 'open', isArchived: 0, isDeleted: 0, sortOrder: order++, createdAt: nowIso(), modifiedAt: nowIso() });
  }
  broadcast('todos:changed', null);
}

export async function stopRecording(): Promise<RecorderState> {
  const current = session;
  if (!current || current.stopping) return state;
  current.stopping = true;
  clearSessionTimers(current);
  ensureCapture().webContents.send('evt:capture:command', { kind: 'meeting', action: 'stop', deviceId: '' });
  setState({ phase: 'finalizing', micLevel: 0, systemLevel: 0 });
  await queueFlush(current);
  const mic = sourceBuffer(current.sources.mic);
  const system = sourceBuffer(current.sources.system);
  const audioPath = `${paths.audioDir}/${current.meetingId}.wav`;
  if (getCtx().settings.get().storeAudio && (mic.length || system.length)) writeFileSync(audioPath, pcm16ToWav(mixPcm16(mic, system)));
  const endedAt = nowIso();
  const durationSec = Math.max(0, (Date.now() - current.startedAt) / 1000);
  getCtx().db.update('meetings', current.meetingId, {
    endedAt,
    durationSec,
    transcript: JSON.stringify(current.segments),
    summaryStatus: current.segments.length ? 'pending' : 'none',
    audioPath: getCtx().settings.get().storeAudio && (mic.length || system.length) ? audioPath : null,
  });
  session = null;
  setState({ phase: 'done', elapsedSec: Math.floor(durationSec), liveSegments: [...current.segments] });
  broadcast('meetings:changed', { id: current.meetingId });
  if (current.segments.length) {
    try {
      await generateMeetingSummary(current.meetingId);
      addSummaryTodos(current.meetingId);
      showToast({ key: 'MeetingReady', title: 'Your meeting notes are ready', body: getMeeting(current.meetingId)?.title ?? '', tone: 'success', target: 'hub', actions: [{ id: 'open', label: 'View notes' }] }, (action) => {
        if (action === 'open') ensureHub(true, `/notetaker/${current.meetingId}`);
      });
      broadcast('meetings:changed', { id: current.meetingId });
      if (getCtx().settings.get().notetaker.openSummaryWhenReady) {
        ensureRecorder();
        broadcast('notepad:open', { meetingId: current.meetingId });
      }
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : String(error) });
      broadcast('meetings:changed', { id: current.meetingId });
    }
  }
  return state;
}

export async function toggleRecording(): Promise<void> {
  if (session) await stopRecording();
  else await startRecording();
}

function isMeetingApp(processName: string, title: string): boolean {
  return /(zoom|cpthost|ms-teams|teams|webex|slack)/i.test(processName) || /(Meet -|Zoom Meeting|Microsoft Teams)/i.test(title);
}

function pollMeetingApps(): void {
  const settings = getCtx().settings.get().notetaker;
  if (!settings.autoDetectCalls) return;
  const app = getForegroundApp();
  const browserMeeting = ['Meet -', 'Zoom Meeting', 'Microsoft Teams', 'Webex', 'Huddle'].flatMap((needle) => findWindows(needle))[0];
  const active = isMeetingApp(app.processName, app.title) || Boolean(browserMeeting);
  if (active && !detectedCall) {
    detectedCall = true;
    if (settings.autoStart && !session) void startRecording({ title: app.title || browserMeeting?.title || 'Untitled meeting' });
    else if (!session) showToast({ key: 'MeetingDetected', title: "Looks like you're in a meeting", body: app.title || browserMeeting?.title || '', target: 'bar', actions: [{ id: 'start', label: 'Start Notetaker' }] }, (action) => {
      if (action === 'start') void startRecording({ title: app.title || browserMeeting?.title || 'Untitled meeting' });
    });
  } else if (!active && detectedCall) {
    detectedCall = false;
    if (settings.stopWhenCallEnds && session) void stopRecording();
  }
}

export function registerRecorder(): void {
  handle('recorder', {
    getState: () => state,
    start: (opts) => startRecording(opts),
    stop: () => stopRecording(),
    pause() {
      if (!session || state.phase !== 'recording') return state;
      ensureCapture().webContents.send('evt:capture:command', { kind: 'meeting', action: 'pause', deviceId: '' });
      setState({ phase: 'paused', micLevel: 0, systemLevel: 0 });
      return state;
    },
    resume() {
      if (!session || state.phase !== 'paused') return state;
      ensureCapture().webContents.send('evt:capture:command', { kind: 'meeting', action: 'resume', deviceId: '' });
      setState({ phase: 'recording' });
      return state;
    },
    pushAudio(source, chunk, level) {
      if (!session || session.stopping || state.phase !== 'recording') return;
      const buffer = Buffer.from(chunk);
      session.sources[source].chunks.push(buffer);
      session.sources[source].bytes += buffer.length;
      setState(source === 'mic' ? { micLevel: level } : { systemLevel: level });
    },
    openNotepad(meetingId) {
      ensureRecorder();
      broadcast('notepad:open', { meetingId: meetingId ?? state.meetingId });
    },
  });
  if (!detectionTimer) detectionTimer = setInterval(pollMeetingApps, 5000);
}
