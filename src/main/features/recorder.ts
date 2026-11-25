import { appendFileSync, existsSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { clipboard, powerMonitor, shell } from 'electron';
import type { CalendarEvent, RecorderState, TranscriptSegment } from '@shared/types';
import { getCtx } from '../context';
import { newId, nowIso } from '../db';
import { broadcast, handle } from '../ipc';
import { findWindows, getForegroundApp } from '../native/win32';
import { paths } from '../paths';
import { addNotification, showNudge, showToast } from '../toasts';
import { ensureCapture, ensureHub, ensureRecorder, getWindow, setContentProtectionForMeeting } from '../windows';
import { mixPcm16, pcm16ToWav, speechSeconds } from '../audio/wav';
import { generateMeetingSummary } from '../meetings/summary';
import { splitRecorderWithMeeting } from '../meetings/split-screen';
import { getMeeting, updateSearchable } from '../meetings/store';

const TRANSCRIBE_INTERVAL_MS = 10_000;
const BYTES_PER_SECOND = 16_000 * 2;

interface SourceAudio {
  path: string;
  bytes: number;
  transcribedBytes: number;
}

interface RecordingSession {
  meetingId: string;
  startedAt: number;
  sources: Record<'mic' | 'system', SourceAudio>;
  segments: TranscriptSegment[];
  participantNames: string[];
  transcribeTimer: NodeJS.Timeout;
  elapsedTimer: NodeJS.Timeout;
  diskTimer: NodeJS.Timeout;
  warningTimer: NodeJS.Timeout | null;
  checkInTimer: NodeJS.Timeout | null;
  calendarEndTimer: NodeJS.Timeout | null;
  maximumTimer: NodeJS.Timeout;
  flush: Promise<void>;
  stopping: boolean;
  lastMicAudioAt: number;
  lastAudioAt: number;
}

let state: RecorderState = { phase: 'idle', meetingId: null, startedAt: null, elapsedSec: 0, micLevel: 0, systemLevel: 0, liveSegments: [], error: null, hasCapturedAudio: false, systemAudioAvailable: true, micSilentSec: 0, storageLow: false, sleepGapSec: 0, processingPhase: null };
let session: RecordingSession | null = null;
let detectedCall = false;
let detectionTimer: NodeJS.Timeout | null = null;
let sleepStartedAt: number | null = null;

function setState(patch: Partial<RecorderState>): void {
  state = { ...state, ...patch };
  broadcast('recorder:state', state);
}

function sourceBuffer(source: SourceAudio): Buffer {
  return existsSync(source.path) ? readFileSync(source.path) : Buffer.alloc(0);
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
function detectLanguageNudges(language: string): void {
  const normalized = language.toLowerCase();
  const { settings } = getCtx();
  const current = settings.get();
  if (!normalized || normalized === 'en' || normalized.startsWith('en-')) return;
  if ((normalized === 'unknown' || normalized === 'und') && !current.notetaker.unsupportedLanguagesWarned.includes(normalized)) {
    settings.set('notetaker', {
      ...current.notetaker,
      unsupportedLanguagesWarned: [...current.notetaker.unsupportedLanguagesWarned, normalized],
    });
    showNudge(`NotetakerUnsupportedLanguage:${normalized}`, {
      title: 'This language may have transcription errors',
      body: 'Murmur supports 99 Whisper languages. Speech outside that set may be less accurate.',
      tone: 'warning',
      target: 'hub',
      actions: [{ id: 'continue', label: 'Continue anyway' }],
    }, { max: 1 });
    return;
  }
  if (!current.notetaker.translationDetectedShownLanguages.includes(normalized)) {
    settings.set('notetaker', {
      ...current.notetaker,
      translationDetectedShownLanguages: [...current.notetaker.translationDetectedShownLanguages, normalized],
    });
    showNudge('NotetakerDetectedLanguage', {
      title: `This meeting sounds like ${language.toUpperCase()}`,
      body: 'Translate the live transcript to English while Murmur keeps the original.',
      target: 'hub',
      actions: [{ id: 'later', label: 'Not now' }, { id: 'translate', label: 'Translate live transcript' }],
    }, { max: 8 }, (action) => {
      if (action !== 'translate') return;
      const latest = settings.get();
      settings.set('notetaker', { ...latest.notetaker, translationLanguage: 'English' });
    });
  }
}
function addNotificationOnce(key: string, title: string, text: string): void {
  if (getCtx().db.kvGet<boolean>(`notification.${key}`, false)) return;
  getCtx().db.kvSet(`notification.${key}`, true);
  addNotification({ type: 'announcement', key, title, text });
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
  detectLanguageNudges(result.language);
  const remoteIndex = current.segments.filter((segment) => segment.speaker !== 'you').length;
  const participantName = current.participantNames.length ? current.participantNames[remoteIndex % current.participantNames.length] : 'Them';
  const speaker = sourceName === 'mic' ? 'you' : current.participantNames.length ? `participant-${remoteIndex % current.participantNames.length + 1}` : 'others';
  const speakerName = sourceName === 'mic' ? 'You' : participantName;
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
      sourceLanguage: result.language || undefined,
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

export async function startRecording(opts: { title?: string; calendarEventId?: string; isTourDemo?: boolean; replaceActive?: boolean } = {}): Promise<RecorderState> {
  if (session) {
    if (!opts.replaceActive) throw new Error('Another meeting is already recording');
    await stopRecording();
  }
  const settings = getCtx().settings.get();
  if (!settings.onboardingComplete) throw new Error('Finish Murmur setup before starting Notetaker');
  const denied = settings.onboardingPermissions.find((permission) => (permission.name === 'microphone' || permission.name === 'system_audio') && permission.clicked && !permission.granted);
  if (denied) throw new Error(`${denied.name === 'microphone' ? 'Microphone' : 'System audio'} permission is required before starting Notetaker`);
  try {
    await getCtx().asr.start(settings.asr.model, settings.asr.threads);
  } catch {
    throw new Error('Live transcription is unavailable. Check the local Whisper model in Settings and try again.');
  }
  if (!opts.isTourDemo && settings.notetaker.quota.remaining <= 0) throw new Error('Weekly meeting limit reached');
  const meetingId = newId();
  const createdAt = nowIso();
  const micPath = `${paths.audioDir}/${meetingId}.mic.pcm`;
  const systemPath = `${paths.audioDir}/${meetingId}.system.pcm`;
  writeFileSync(micPath, Buffer.alloc(0));
  writeFileSync(systemPath, Buffer.alloc(0));
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
    isTourDemo: opts.isTourDemo ? 1 : 0,
    processingPhase: null,
    deliveredSummary: null,
    summaryUpdatedAt: null,
    audioUpdatedAt: createdAt,
    noticePosted: 0,
    autoShareEnabled: settings.notetaker.autoShareNotesType === 'all' ? 1 : 0,
  });
  const maxMs = settings.notetaker.maxRecordingMin * 60_000;
  const calendarEvent = opts.calendarEventId ? getCtx().db.kvGet<CalendarEvent[]>('notetaker.calendar', []).find((event) => event.id === opts.calendarEventId) : undefined;
  const titleParticipants = opts.title?.match(/^(.+?)\s+(?:[-|—]\s*)?(?:Zoom|Google Meet|Microsoft Teams|Webex)/i)?.[1]
    ?.split(/,| & /).map((name) => name.trim()).filter(Boolean) ?? [];
  const participantNames = settings.notetaker.autoDetectParticipantNames
    ? [...new Set([...(calendarEvent?.attendees ?? []), ...titleParticipants].map((name) => name.trim()).filter(Boolean))]
    : [];
  const current: RecordingSession = {
    meetingId,
    startedAt: Date.now(),
    sources: {
      mic: { path: micPath, bytes: 0, transcribedBytes: 0 },
      system: { path: systemPath, bytes: 0, transcribedBytes: 0 },
    },
    segments: [],
    participantNames,
    transcribeTimer: setInterval(() => void queueFlush(current), TRANSCRIBE_INTERVAL_MS),
    elapsedTimer: setInterval(() => {
      if (session !== current || !['awaiting_audio', 'recording'].includes(state.phase)) return;
      const elapsedSec = Math.floor((Date.now() - current.startedAt) / 1000);
      const micSilentSec = Math.floor((Date.now() - current.lastMicAudioAt) / 1000);
      setState({ elapsedSec, micSilentSec });
      if (micSilentSec === 180) showToast({ key: 'MicSilent', title: 'Murmur isn’t hearing your microphone', body: `Check ${settings.micDeviceId === 'default' ? 'your selected microphone' : settings.micDeviceId}.`, tone: 'warning', target: 'hub' });
      if (micSilentSec === 300) showToast({ key: 'MicStillSilent', title: "Still there? Notetaker isn't hearing anything", body: 'Stop and resume the meeting to reconnect your microphone.', tone: 'warning', target: 'hub' });
      if (Math.floor((Date.now() - current.lastAudioAt) / 1000) === 600) {
        showToast({ key: 'MeetingSilenceStop', title: 'Recording stopped after silence', body: 'Open the saved meeting or resume if the call is still going.', tone: 'warning', target: 'hub', actions: [{ id: 'resume', label: 'Resume' }] }, (action) => {
          if (action === 'resume') void startRecording({ title: getMeeting(current.meetingId)?.title });
        });
        void stopRecording('silence');
      }
    }, 1000),
    diskTimer: setInterval(() => {
      const fs = statfsSync(paths.audioDir);
      const available = Number(fs.bavail) * Number(fs.bsize);
      const storageLow = available < 512 * 1024 * 1024;
      if (storageLow && !state.storageLow) {
        const minutes = Math.max(1, Math.floor(available / (BYTES_PER_SECOND * 2 * 60)));
        showToast({ key: 'StorageLow', title: 'Storage almost full', body: `About ${minutes} recording minutes remain. Free up space to keep recording.`, tone: 'warning', target: 'hub' });
      }
      setState({ storageLow });
    }, 30_000),
    warningTimer: maxMs > 60_000 ? setTimeout(() => showToast({ key: 'MeetingDurationWarning', title: 'One minute left', body: 'Murmur will stop at your recording limit.', tone: 'warning', target: 'bar' }), maxMs - 60_000) : null,
    checkInTimer: settings.notetaker.longMeetingCheckIn ? setTimeout(() => showToast({ key: 'LongMeetingCheckIn', title: 'Still recording?', body: 'Notetaker has been listening for one hour.', tone: 'info', target: 'hub', actions: [{ id: 'continue', label: 'Keep recording' }, { id: 'stop', label: 'Stop' }] }, (action) => { if (action === 'stop') void stopRecording(); }), 60 * 60_000) : null,
    calendarEndTimer: calendarEvent && new Date(calendarEvent.end).getTime() > Date.now()
      ? setTimeout(() => void stopRecording('calendar_end'), new Date(calendarEvent.end).getTime() - Date.now())
      : null,
    maximumTimer: setTimeout(() => void stopRecording('limit'), maxMs),
    flush: Promise.resolve(),
    stopping: false,
    lastMicAudioAt: Date.now(),
    lastAudioAt: Date.now(),
  };
  session = current;
  setContentProtectionForMeeting(settings.notetaker.hideInScreenCapture);
  setState({ phase: 'awaiting_audio', meetingId, startedAt: current.startedAt, elapsedSec: 0, micLevel: 0, systemLevel: 0, liveSegments: [], error: null, hasCapturedAudio: false, systemAudioAvailable: true, micSilentSec: 0, storageLow: false, sleepGapSec: 0, processingPhase: null });
  showNudge('NotetakerTranslationDiscovery', {
    title: 'Translate this meeting live',
    body: 'Choose a language from the meeting note. Murmur keeps every original line available.',
    target: 'hub',
  }, { max: 1 });
  showNudge('NotetakerLanguageSupport', {
    title: 'Transcribe meetings in 99 languages',
    body: 'Whisper detects supported languages automatically. Other languages may contain more errors.',
    target: 'hub',
  }, { max: 1 });
  addNotificationOnce('TranslationAvailable', 'Live meeting translation', 'Translate a transcript while preserving the detected original language.');
  void ensureCapture().webContents.executeJavaScript(`window.murmurStartMeeting(${JSON.stringify(settings.micDeviceId)})`, true);
  setTimeout(() => {
    if (session === current && !state.hasCapturedAudio) {
      showToast({ key: 'NoMeetingAudio', title: "Notetaker isn't getting any audio", body: 'Check your microphone and system-audio permissions, then try again.', tone: 'warning', target: 'hub', actions: [{ id: 'dismiss', label: 'Dismiss' }, { id: 'retry', label: 'Try again' }] }, (action) => {
        if (action === 'retry') void ensureCapture().webContents.executeJavaScript(`window.murmurStartMeeting(${JSON.stringify(settings.micDeviceId)})`, true);
      });
    }
  }, 20_000);
  if (settings.notetaker.notepadView !== 'hidden') {
    ensureRecorder();
    if (settings.notetaker.notepadView === 'side_by_side' || settings.notetaker.splitScreenJoin) splitRecorderWithMeeting(ensureRecorder());
  }
  if (settings.notetaker.consentChatNotice) {
    showToast({ key: 'ConsentNotice', title: 'Post this consent message in the meeting chat', body: settings.notetaker.consentMessage, tone: 'info', target: 'hub', actions: [{ id: 'copy', label: 'Copy' }, { id: 'posted', label: "I've posted it" }] }, (action) => {
      if (action === 'copy') clipboard.writeText(settings.notetaker.consentMessage);
      if (action === 'posted') {
        getCtx().db.update('meetings', meetingId, { noticePosted: 1 });
        broadcast('meetings:changed', { id: meetingId });
      }
    });
  }
  broadcast('meetings:changed', { id: meetingId });
  return state;
}

function clearSessionTimers(current: RecordingSession): void {
  clearInterval(current.transcribeTimer);
  clearInterval(current.elapsedTimer);
  clearInterval(current.diskTimer);
  clearTimeout(current.warningTimer ?? undefined);
  clearTimeout(current.checkInTimer ?? undefined);
  clearTimeout(current.calendarEndTimer ?? undefined);
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

type StopReason = 'manual' | 'silence' | 'call_end' | 'calendar_end' | 'limit' | 'sleep';

export async function stopRecording(reason: StopReason = 'manual'): Promise<RecorderState> {
  const current = session;
  if (!current || current.stopping) return state;
  current.stopping = true;
  clearSessionTimers(current);
  ensureCapture().webContents.send('evt:capture:command', { kind: 'meeting', action: 'stop', deviceId: '' });
  setState({ phase: 'finalizing', micLevel: 0, systemLevel: 0, processingPhase: 'transcribing' });
  await queueFlush(current);
  const mic = sourceBuffer(current.sources.mic);
  const system = sourceBuffer(current.sources.system);
  const mixed = mixPcm16(mic, system);
  const hasAudio = mixed.length > 0 && speechSeconds(mixed) >= 0.15;
  const audioPath = `${paths.audioDir}/${current.meetingId}.wav`;
  try {
    if (getCtx().settings.get().storeAudio && hasAudio) writeFileSync(audioPath, pcm16ToWav(mixed));
  } catch {
    setState({ storageLow: true, error: 'Storage full. Free up space on your computer to finish processing.' });
    getCtx().db.update('meetings', current.meetingId, { processingPhase: 'transcribing' });
    current.stopping = false;
    return state;
  }
  rmSync(current.sources.mic.path, { force: true });
  rmSync(current.sources.system.path, { force: true });

  if (hasAudio && speechSeconds(mixed) >= 0.5) {
    setState({ processingPhase: 'refining' });
    getCtx().db.update('meetings', current.meetingId, { processingPhase: 'refining' });
    try {
      const settings = getCtx().settings.get();
      await getCtx().asr.start(settings.asr.model, settings.asr.threads);
      const refined = await getCtx().asr.transcribe(pcm16ToWav(mixed), { language: settings.autoDetectLanguage ? 'auto' : (settings.languages[0] ?? 'en') });
      detectLanguageNudges(refined.language);
      const segments: TranscriptSegment[] = [];
      for (const [index, part] of refined.segments.entries()) {
        const text = part.text.trim();
        if (!text) continue;
        const participantIndex = current.participantNames.length ? index % current.participantNames.length : index;
        segments.push({
          id: newId(),
          speaker: current.participantNames.length ? `participant-${participantIndex + 1}` : `speaker-${index + 1}`,
          speakerName: current.participantNames[participantIndex] ?? `Speaker ${index + 1}`,
          start: part.start,
          end: part.end,
          text,
          edited: false,
          translatedText: await translate(text),
          sourceLanguage: refined.language || undefined,
        });
      }
      if (segments.length) current.segments = segments;
    } catch {
      // Keep the live transcript when the higher-quality local refinement pass fails.
    }
  }

  const endedAt = nowIso();
  const durationSec = Math.max(0, (Date.now() - current.startedAt) / 1000);
  getCtx().db.update('meetings', current.meetingId, {
    endedAt,
    durationSec,
    transcript: JSON.stringify(current.segments),
    summaryStatus: current.segments.length ? 'pending' : 'none',
    audioPath: getCtx().settings.get().storeAudio && hasAudio ? audioPath : null,
    audioUpdatedAt: endedAt,
    processingPhase: current.segments.length ? 'summarizing' : null,
  });
  session = null;
  setState({ phase: 'done', elapsedSec: Math.floor(durationSec), liveSegments: [...current.segments], processingPhase: current.segments.length ? 'summarizing' : null });
  broadcast('meetings:changed', { id: current.meetingId });
  if (!hasAudio) {
    showToast({ key: 'MeetingNoAudio', title: 'Stopped meeting', body: 'No audio was recorded.', tone: 'warning', target: 'hub' });
  }
  if (hasAudio) {
    const stoppedCopy: Record<StopReason, { body: string; tone: 'success' | 'info' | 'warning' }> = {
      manual: { body: 'Your meeting was saved and is ready to review.', tone: 'success' },
      silence: { body: 'Murmur stopped after prolonged silence.', tone: 'warning' },
      call_end: { body: 'The call appeared to end, so Murmur saved the meeting.', tone: 'info' },
      calendar_end: { body: 'The scheduled meeting ended, so Murmur saved the recording.', tone: 'info' },
      limit: { body: 'Murmur reached your selected maximum recording length.', tone: 'warning' },
      sleep: { body: 'Notetaker stopped when the computer slept. Audio captured before sleep was saved.', tone: 'warning' },
    };
    const copy = stoppedCopy[reason];
    showToast({ key: `MeetingStopped:${reason}`, title: 'Notetaker stopped', body: copy.body, tone: copy.tone, target: 'hub', actions: [{ id: 'open', label: 'Open saved meeting' }, ...(reason === 'manual' || reason === 'limit' ? [] : [{ id: 'resume', label: 'Resume' }])] }, (action) => {
      if (action === 'open') ensureHub(true, `/notetaker/${current.meetingId}`);
      if (action === 'resume') void startRecording({ title: getMeeting(current.meetingId)?.title });
    });
  }
  const capturedWords = current.segments.reduce((total, segment) => total + segment.text.trim().split(/\s+/).filter(Boolean).length, 0);
  if (capturedWords > 0 && capturedWords <= 10) {
    showToast({ key: 'ShortMeeting', title: 'That meeting was brief', body: 'Started by mistake? Open the note to keep or discard it — or try Notetaker again in your next conversation.', tone: 'info', target: 'hub', actions: [{ id: 'open', label: 'Review meeting' }] }, (action) => {
      if (action === 'open') ensureHub(true, `/notetaker/${current.meetingId}`);
    });
  }
  if (capturedWords > 0 && capturedWords <= 10 && getCtx().settings.get().notetaker.meetingCount === 0) {
      showNudge('FirstShortMeeting', {
        title: 'Want a better first look at Notetaker?',
        body: 'Connect a calendar for participant names, or try the two-minute guided tour.',
        target: 'hub',
        actions: [{ id: 'calendar', label: 'Connect calendar' }, { id: 'tour', label: 'Start guided tour' }],
      }, { max: 1 }, (action) => {
        if (action === 'calendar') broadcast('settings:open', { section: 'connectors' });
        if (action === 'tour') void startRecording({ title: 'Notetaker guided tour', isTourDemo: true });
      });
    }
  const autoStartSettings = getCtx().settings.get();
  if (autoStartSettings.notetaker.autoStart && durationSec < 30) {
    const cutoff = Date.now() - 7 * 86_400_000;
    const rapidStops = [...getCtx().db.kvGet<number[]>('notetaker.rapidStops', []).filter((time) => time >= cutoff), Date.now()].slice(-2);
    getCtx().db.kvSet('notetaker.rapidStops', rapidStops);
    if (rapidStops.length === 2) {
      showToast({ key: 'AutoStartRapidStop', title: 'Turn off auto-start?', body: 'You stopped Notetaker quickly twice. Murmur can wait for you to start it instead.', tone: 'info', target: 'hub', actions: [{ id: 'disable', label: 'Turn off auto-start' }, { id: 'keep', label: 'Keep enabled' }] }, (action) => {
        if (action !== 'disable') return;
        const latest = getCtx().settings.get();
        getCtx().settings.set('notetaker', { ...latest.notetaker, autoStart: false, autoStartOptInState: 'disabled' });
        showToast({ key: 'AutoStartDisabled', title: 'Auto-start turned off', body: 'Murmur will still remind you when meetings begin.', tone: 'success', target: 'hub', actions: [{ id: 'undo', label: 'Undo' }] }, (undoAction) => {
          if (undoAction !== 'undo') return;
          const undoSettings = getCtx().settings.get();
          getCtx().settings.set('notetaker', { ...undoSettings.notetaker, autoStart: true, autoStartOptInState: 'enabled' });
        });
      });
    }
  }
  if (current.segments.length) {
    try {
      await generateMeetingSummary(current.meetingId);
      addSummaryTodos(current.meetingId);
      getCtx().db.update('meetings', current.meetingId, { processingPhase: null });
      setState({ processingPhase: null });
      const meeting = getMeeting(current.meetingId);
      const words = current.segments.reduce((total, segment) => total + segment.text.split(/\s+/).length, 0);
      const readMinutes = Math.max(1, Math.round(words / 220));
      showToast({ key: 'MeetingReady', title: 'Your summary is ready!', body: `${meeting?.title ?? 'Synthesized your notes'} · ${readMinutes} min read`, tone: 'success', target: 'hub', actions: [{ id: 'open', label: 'View notes' }] }, (action) => {
        if (action === 'open') ensureHub(true, `/notetaker/${current.meetingId}`);
      });
      broadcast('meetings:changed', { id: current.meetingId });
      if (getCtx().settings.get().notetaker.openSummaryWhenReady) {
        ensureRecorder();
        broadcast('notepad:open', { meetingId: current.meetingId });
      }
      showNudge('NotetakerSkillsCallout', {
        title: 'Introducing Skills',
        body: 'Turn meeting notes into reusable follow-ups, updates, decision logs, and more.',
        target: 'hub',
        actions: [{ id: 'browse', label: 'Browse Skills' }, { id: 'dismiss', label: 'Not now' }],
      }, { max: 1 }, (action) => {
        if (action === 'browse') ensureHub(true, '/skills');
      });
      addNotificationOnce('NotetakerSkills', 'Use Skills with meeting notes', 'Browse reusable follow-ups, updates, decision logs, and action-ready formats.');
    } catch (error) {
      getCtx().db.update('meetings', current.meetingId, { processingPhase: null });
      setState({ error: error instanceof Error ? error.message : String(error), processingPhase: null });
      broadcast('meetings:changed', { id: current.meetingId });
    }
  }
  const settings = getCtx().settings.get();
  const original = getMeeting(current.meetingId);
  if (!original?.isTourDemo) {
    getCtx().settings.set('notetaker', {
      ...settings.notetaker,
      meetingCount: settings.notetaker.meetingCount + 1,
      hasRecordedRealMeeting: true,
      quota: { ...settings.notetaker.quota, remaining: Math.max(0, settings.notetaker.quota.remaining - 1) },
    });
    const updatedCount = settings.notetaker.meetingCount + 1;
    const discovery = updatedCount === 1
      ? { title: 'Stay present — Murmur takes the notes', body: 'Get a transcript, summary, and action items. Nothing joins your call.' }
      : { title: 'Turn conversations into next steps', body: 'Murmur captures decisions and action items locally while you focus.' };
    showNudge('NotetakerRecorderDiscovery', { ...discovery, target: 'hub', actions: [{ id: 'later', label: 'Later' }, { id: 'no', label: 'No thanks' }] }, { max: 2 });
    if (!settings.notetaker.autoStart && settings.notetaker.autoStartOptInState === 'none') {
      showNudge('NotetakerAutoStartOptIn', {
        title: 'Start Notetaker automatically?',
        body: 'Murmur can start as soon as a meeting begins. You can always stop it.',
        target: 'hub',
        actions: [{ id: 'later', label: 'Not now' }, { id: 'enable', label: 'Turn on auto-start' }],
      }, { max: 2 }, (action) => {
        if (action !== 'enable') return;
        const latest = getCtx().settings.get();
        getCtx().settings.set('notetaker', { ...latest.notetaker, autoStart: true, autoStartOptInState: 'enabled' });
      });
    }
    addNotificationOnce('NotetakerDiscovery', 'Meetings become action-ready notes', 'Murmur creates a local transcript, summary, and action items without joining the call.');
  }
  return state;
}

export async function toggleRecording(): Promise<void> {
  if (session) {
    await stopRecording();
    return;
  }
  const now = Date.now();
  const next = getCtx().db.kvGet<CalendarEvent[]>('notetaker.calendar', []).find((event) => {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end).getTime();
    return Boolean(event.conferenceUrl) && start <= now + 15 * 60_000 && end >= now;
  });
  if (next?.conferenceUrl) {
    await shell.openExternal(next.conferenceUrl);
    await startRecording({ title: next.title, calendarEventId: next.id });
    return;
  }
  await startRecording();
}

function isMeetingApp(processName: string, title: string): boolean {
  return /(zoom|cpthost|ms-teams|teams|webex|slack|chrome|msedge|firefox)/i.test(processName)
    && /(meet\.google\.com|app\.zoom\.us|teams\.microsoft\.com|webex|huddle|Meet -|Zoom Meeting|Microsoft Teams)/i.test(title);
}

function pollMeetingApps(): void {
  const settings = getCtx().settings.get().notetaker;
  if (!settings.autoDetectCalls) return;
  const app = getForegroundApp();
  const browserMeeting = ['meet.google.com', 'app.zoom.us', 'Meet -', 'Zoom Meeting', 'Microsoft Teams', 'Webex', 'Huddle'].flatMap((needle) => findWindows(needle))[0];
  const active = isMeetingApp(app.processName, app.title) || Boolean(browserMeeting);
  if (active && !detectedCall) {
    detectedCall = true;
    const title = app.title || browserMeeting?.title || 'Untitled meeting';
    if (settings.autoStart && !session) void startRecording({ title });
    else if (!session && settings.detectionAction === 'notify') showToast({ key: 'MeetingDetected', title: "Looks like you're in a meeting", body: title, target: 'bar', actions: [{ id: 'start', label: 'Start Notetaker' }, { id: 'ignore', label: 'Not now' }] }, (action) => {
      if (action === 'start') {
        getCtx().db.kvSet('notetaker.ignoredPrompts', 0);
        void startRecording({ title });
        return;
      }
      if (action !== 'ignore') return;
      const ignored = getCtx().db.kvGet<number>('notetaker.ignoredPrompts', 0) + 1;
      getCtx().db.kvSet('notetaker.ignoredPrompts', ignored);
      if (ignored < 3) return;
      const latest = getCtx().settings.get();
      getCtx().settings.set('notetaker', { ...latest.notetaker, autoDetectCalls: false });
      showToast({ key: 'MeetingDetectionPaused', title: 'Meeting reminders paused', body: 'You skipped several reminders, so Murmur stopped showing them. You can turn them back on now or manage notifications.', tone: 'info', target: 'hub', actions: [{ id: 'restore', label: 'Turn back on' }, { id: 'manage', label: 'Manage notifications' }] }, (nextAction) => {
        if (nextAction === 'restore') {
          const current = getCtx().settings.get();
          getCtx().settings.set('notetaker', { ...current.notetaker, autoDetectCalls: true });
          getCtx().db.kvSet('notetaker.ignoredPrompts', 0);
        }
        if (nextAction === 'manage') broadcast('settings:open', { section: 'notetaker' });
      });
    });
  } else if (!active && detectedCall) {
    detectedCall = false;
    if (settings.stopWhenCallEnds && session) void stopRecording('call_end');
  }
}

function recoverIncompleteRecordings(): void {
  const rows = getCtx().db.all<{ id: string; createdAt: string; transcript: string }>('SELECT id, createdAt, transcript FROM meetings WHERE endedAt IS NULL AND isDeleted = 0');
  for (const row of rows) {
    const micPath = `${paths.audioDir}/${row.id}.mic.pcm`;
    const systemPath = `${paths.audioDir}/${row.id}.system.pcm`;
    const mic = existsSync(micPath) ? readFileSync(micPath) : Buffer.alloc(0);
    const system = existsSync(systemPath) ? readFileSync(systemPath) : Buffer.alloc(0);
    const mixed = mixPcm16(mic, system);
    const audioPath = `${paths.audioDir}/${row.id}.wav`;
    if (mixed.length && getCtx().settings.get().storeAudio) writeFileSync(audioPath, pcm16ToWav(mixed));
    rmSync(micPath, { force: true });
    rmSync(systemPath, { force: true });
    const transcript = JSON.parse(row.transcript) as TranscriptSegment[];
    getCtx().db.update('meetings', row.id, {
      endedAt: nowIso(),
      durationSec: mixed.length / BYTES_PER_SECOND,
      audioPath: mixed.length && getCtx().settings.get().storeAudio ? audioPath : null,
      audioUpdatedAt: nowIso(),
      summaryStatus: transcript.length ? 'pending' : 'none',
      processingPhase: transcript.length ? 'summarizing' : null,
    });
    if (transcript.length) void generateMeetingSummary(row.id).then(() => {
      getCtx().db.update('meetings', row.id, { processingPhase: null });
      broadcast('meetings:changed', { id: row.id });
    }).catch(() => getCtx().db.update('meetings', row.id, { processingPhase: null }));
    showToast({ key: 'MeetingRecovered', title: 'Recovered meeting recording', body: 'Audio captured before Murmur closed has been saved.', tone: 'success', target: 'hub', actions: [{ id: 'open', label: 'Open meeting' }] }, (action) => {
      if (action === 'open') ensureHub(true, `/notetaker/${row.id}`);
    });
  }
}

export function registerRecorder(): void {
  handle('recorder', {
    getState: () => state,
    start: (opts) => startRecording(opts),
    stop: () => stopRecording(),
    pause() {
      if (!session || !['recording', 'awaiting_audio'].includes(state.phase)) return state;
      ensureCapture().webContents.send('evt:capture:command', { kind: 'meeting', action: 'pause', deviceId: '' });
      setState({ phase: 'paused', micLevel: 0, systemLevel: 0 });
      return state;
    },
    resume() {
      if (!session || state.phase !== 'paused') return state;
      ensureCapture().webContents.send('evt:capture:command', { kind: 'meeting', action: 'resume', deviceId: '' });
      setState({ phase: state.hasCapturedAudio ? 'recording' : 'awaiting_audio' });
      return state;
    },
    retrySystemAudio() {
      if (!session) return state;
      const micId = getCtx().settings.get().micDeviceId;
      void ensureCapture().webContents.executeJavaScript(`window.murmurStartMeeting(${JSON.stringify(micId)})`, true);
      setState({ systemAudioAvailable: true, error: null });
      return state;
    },
    systemAudioStatus(available, reason) {
      setState({ systemAudioAvailable: available });
      if (!available) {
        showToast({ key: reason === 'dropped' ? 'SystemAudioDropped' : 'SystemAudioOff', title: reason === 'dropped' ? 'System audio turned off' : 'Only your microphone is recording', body: 'Remote participants may not appear in your transcript.', tone: 'warning', target: 'hub', actions: [{ id: 'retry', label: 'Turn on system audio' }] }, (action) => {
          if (action === 'retry') {
            const micId = getCtx().settings.get().micDeviceId;
            void ensureCapture().webContents.executeJavaScript(`window.murmurStartMeeting(${JSON.stringify(micId)})`, true);
          }
        });
      }
      return state;
    },
    splitScreen() {
      return splitRecorderWithMeeting(ensureRecorder());
    },
    getWindowState() {
      const win = ensureRecorder(false);
      const [width, height] = win.getSize();
      return { maximized: win.isMaximized(), width, height };
    },
    toggleMaximize() {
      const win = ensureRecorder(false);
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return win.isMaximized();
    },
    toggleFullScreen() {
      const win = ensureRecorder(false);
      win.setFullScreen(!win.isFullScreen());
      return win.isFullScreen();
    },
    setWindowSize(width, height) {
      const safeWidth = Math.max(360, Math.round(width));
      const safeHeight = Math.max(420, Math.round(height));
      getCtx().db.kvSet('notetaker.windowSize', { width: safeWidth, height: safeHeight });
      getWindow('recorder')?.setSize(safeWidth, safeHeight);
    },
    pushAudio(source, chunk, level) {
      if (!session || session.stopping || !['awaiting_audio', 'recording'].includes(state.phase)) return;
      const buffer = Buffer.from(chunk);
      try {
        appendFileSync(session.sources[source].path, buffer);
      } catch (error) {
        setState({ storageLow: true, error: error instanceof Error ? error.message : 'Storage full' });
        return;
      }
      session.sources[source].bytes += buffer.length;
      if (level > 0.01) {
        session.lastAudioAt = Date.now();
        if (source === 'mic') session.lastMicAudioAt = Date.now();
      }
      setState({ ...(source === 'mic' ? { micLevel: level } : { systemLevel: level }), phase: 'recording', hasCapturedAudio: true });
    },
    openNotepad(meetingId) {
      const recorder = ensureRecorder();
      const saved = getCtx().db.kvGet<{ width: number; height: number } | null>('notetaker.windowSize', null);
      if (saved) recorder.setSize(saved.width, saved.height);
      broadcast('notepad:open', { meetingId: meetingId ?? state.meetingId });
    },
  });
  recoverIncompleteRecordings();
  powerMonitor.on('suspend', () => {
    if (session) sleepStartedAt = Date.now();
  });
  powerMonitor.on('resume', () => {
    if (!session || sleepStartedAt === null) return;
    const durationSec = Math.max(1, Math.round((Date.now() - sleepStartedAt) / 1000));
    sleepStartedAt = null;
    const segment: TranscriptSegment = { id: newId(), speaker: 'system', speakerName: 'Murmur', start: state.elapsedSec, end: state.elapsedSec, text: `Device slept for ${durationSec}s — audio was unavailable.`, edited: false };
    session.segments.push(segment);
    getCtx().db.update('meetings', session.meetingId, { transcript: JSON.stringify(session.segments) });
    setState({ sleepGapSec: durationSec, liveSegments: [...session.segments] });
    broadcast('recorder:segment', segment);
    void stopRecording('sleep');
  });
  if (!detectionTimer) detectionTimer = setInterval(pollMeetingApps, 5000);
}
