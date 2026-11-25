// Dictation controller: hotkeys -> capture -> whisper -> formatting -> paste -> history.
import { clipboard } from 'electron';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DictationMode, DictationState, HistoryEntry, HistoryStatus } from '@shared/types';
import { countWords } from '@shared/textPipeline';
import { comboLabelParts } from '@shared/hotkeys';
import { getCtx } from '../context';
import { broadcast, handle } from '../ipc';
import { newId } from '../db';
import { runTransformText } from './transforms';
import { paths } from '../paths';
import { getForegroundApp, type ForegroundApp } from '../native/win32';
import { copySelection, pasteText, waitForModifiersReleased } from '../native/textio';
import { pcm16ToWav, speechSeconds, wavToPcm16 } from '../audio/wav';
import { asrPrompt, formatForApp, markPhrasesUsed } from './formatting';
import { getHistoryRow, rowToHistory } from './history';
import { showNudge, showToast } from '../toasts';
import { ensureCapture } from '../windows';

const MAX_SECONDS = 20 * 60;
const TAP_MS = 250;
const MURMUR_PROCESSES: Record<string, true> = { murmur: true, electron: true };

interface Session {
  id: string;
  mode: DictationMode;
  startedAt: number;
  target: ForegroundApp;
  chunks: Buffer[];
  stopping: boolean;
  cancelled: boolean;
  ended: PromiseWithResolvers<string | null>;
  warnTimer: NodeJS.Timeout;
  maxTimer: NodeJS.Timeout;
}

let state: DictationState = { phase: 'resting', mode: null, startedAt: null, level: 0, message: null, lastEntryId: null, polishName: null };
let session: Session | null = null;
let lastTapAt = 0;
let processingQueue: Promise<unknown> = Promise.resolve();
let lastLevelAt = 0;
// Sessions cancelled while capture is still flushing; resolved on the next captureEnded.
const pendingCancelled = new Set<Session>();

function setState(patch: Partial<DictationState>): void {
  state = { ...state, ...patch };
  broadcast('dictation:state', state);
}

function playSound(name: 'start' | 'stop' | 'paste' | 'notification' | 'achievement'): void {
  if (getCtx().settings.get().sounds) broadcast('sound:play', { name });
}

function shortcutLabel(action: 'ptt' | 'popo' | 'pasteLast'): string {
  const combo = getCtx().settings.get().shortcuts[action][0];
  return combo ? comboLabelParts(combo).join(' + ') : 'your shortcut';
}

export function getDictationState(): DictationState {
  return state;
}

export function isDictating(): boolean {
  return session !== null;
}

export function startDictation(mode: DictationMode): void {
  if (session) return;
  const { settings } = getCtx();
  const s = settings.get();
  const target = getForegroundApp();
  const ended = Promise.withResolvers<string | null>();
  session = {
    id: newId(),
    mode,
    startedAt: Date.now(),
    target,
    chunks: [],
    stopping: false,
    cancelled: false,
    ended,
    warnTimer: setTimeout(() => showToast({ key: 'DictationDurationWarning', title: 'Less than a minute left', body: 'Murmur supports up to 20 minutes per session.', target: 'bar', tone: 'warning' }), (MAX_SECONDS - 60) * 1000),
    maxTimer: setTimeout(() => {
      showToast({ key: 'DictationMaxDurationReached', title: 'Murmur supports up to 20 minutes per session', body: 'Your text is being inserted now.', target: 'bar', tone: 'warning' });
      stopDictation();
    }, MAX_SECONDS * 1000),
  };
  setState({ phase: mode === 'popo' ? 'active_popo' : 'active_ptt', mode, startedAt: session.startedAt, level: 0, message: null });
  playSound('start');
  ensureCapture().webContents.send('evt:capture:command', { kind: 'dictation', action: 'start', deviceId: s.micDeviceId });
}

/** Stop capturing and process. Short PTT taps are treated as accidental (with a coaching toast). */
export function stopDictation(): void {
  const cur = session;
  if (!cur || cur.stopping) return;
  cur.stopping = true;
  clearTimeout(cur.warnTimer);
  clearTimeout(cur.maxTimer);
  const heldMs = Date.now() - cur.startedAt;
  ensureCapture().webContents.send('evt:capture:command', { kind: 'dictation', action: 'stop', deviceId: '' });
  playSound('stop');
  if (cur.mode === 'ptt' && heldMs < TAP_MS) {
    cur.cancelled = true;
    session = null;
    setState({ phase: 'resting', mode: null, startedAt: null, level: 0 });
    // two quick taps => hands-free
    if (Date.now() - lastTapAt < 600) {
      lastTapAt = 0;
      startDictation('popo');
    } else {
      lastTapAt = Date.now();
      showNudge('Debounce', { title: `Don't tap. Hold down ${shortcutLabel('ptt')}.`, body: `Or double tap to start hands-free mode.`, target: 'bar' }, { minIntervalMs: 30_000 });
    }
    return;
  }
  setState({ phase: 'processing', level: 0 });
  const job = processSession(cur).catch((e: unknown) => {
    setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    setTimeout(() => setState({ phase: 'resting', message: null }), 2500);
  });
  processingQueue = processingQueue.then(() => job);
}

export function cancelDictation(): void {
  const cur = session;
  if (!cur) return;
  cur.cancelled = true;
  clearTimeout(cur.warnTimer);
  clearTimeout(cur.maxTimer);
  ensureCapture().webContents.send('evt:capture:command', { kind: 'dictation', action: 'stop', deviceId: '' });
  session = null;
  pendingCancelled.add(cur);
  setState({ phase: 'resting', mode: null, startedAt: null, level: 0 });
  void cur.ended.promise.then(() => {
    const pcm = Buffer.concat(cur.chunks);
    const entry = saveHistory(cur, { status: 'cancelled', asrText: '', formattedText: '', pcm, language: 'en', latencyMs: 0 });
    showToast({ key: 'TranscriptCancelled', title: 'Transcript cancelled', target: 'bar', actions: [{ id: 'undo', label: 'Undo' }], durationMs: 6000 }, (action) => {
      if (action === 'undo') void retryHistory(entry.id, true);
    });
  });
}

function saveHistory(
  s: Session,
  r: { status: HistoryStatus; asrText: string; formattedText: string; pcm: Buffer; language: string; latencyMs: number; error?: string | null; extra?: Partial<HistoryEntry> },
): HistoryEntry {
  const { db, settings } = getCtx();
  const st = settings.get();
  let audioPath: string | null = null;
  if (st.storeAudio && st.localDataStorage !== 'never_store' && r.pcm.length > 0) {
    audioPath = join(paths.audioDir, `${s.id}.wav`);
    writeFileSync(audioPath, pcm16ToWav(r.pcm));
  }
  const row = {
    id: s.id,
    timestamp: new Date(s.startedAt).toISOString(),
    asrText: r.asrText,
    formattedText: r.formattedText,
    pastedText: r.extra?.pastedText ?? null,
    editedText: null,
    status: r.status,
    app: s.target.processName,
    appTitle: s.target.title,
    duration: r.pcm.length / 32000,
    speechDuration: speechSeconds(r.pcm),
    numWords: countWords(r.formattedText),
    language: r.language,
    mode: s.mode,
    cleanupLevel: r.extra?.cleanupLevel ?? st.cleanupLevel,
    styleContext: r.extra?.styleContext ?? 'other',
    audioPath,
    hasRevertedAI: 0,
    isArchived: 0,
    numDictionaryReplacements: r.extra?.numDictionaryReplacements ?? 0,
    numWordsCorrected: r.extra?.numWordsCorrected ?? 0,
    latencyMs: Math.round(r.latencyMs),
    error: r.error ?? null,
  };
  if (st.localDataStorage !== 'never_store') {
    db.run('DELETE FROM history WHERE id = ?', s.id);
    db.insert('history', row);
    broadcast('history:changed', { id: s.id });
  }
  return rowToHistory(row);
}

async function transcribe(pcm: Buffer): Promise<{ text: string; language: string }> {
  const { asr, settings } = getCtx();
  const s = settings.get();
  await asr.start(s.asr.model, s.asr.threads);
  const lang = s.autoDetectLanguage ? 'auto' : (s.languages[0] ?? 'en');
  const r = await asr.transcribe(pcm16ToWav(pcm), { language: lang, prompt: asrPrompt() || undefined });
  return { text: r.text, language: r.language };
}

async function processSession(s: Session): Promise<void> {
  const err = await s.ended.promise;
  session = null;
  const t0 = Date.now();
  const pcm = Buffer.concat(s.chunks);
  if (err) {
    saveHistory(s, { status: 'failed', asrText: '', formattedText: '', pcm, language: 'en', latencyMs: 0, error: err });
    showToast({ key: 'MicAccessError', title: 'Microphone could not start', body: err, tone: 'error', target: 'bar' });
    setState({ phase: 'resting', mode: null, startedAt: null });
    return;
  }
  if (speechSeconds(pcm) < 0.15) {
    saveHistory(s, { status: 'empty', asrText: '', formattedText: '', pcm, language: 'en', latencyMs: 0 });
    showToast({ key: 'TranscriptionEmpty', title: "We couldn't hear you", body: 'Check that the right microphone is selected.', tone: 'warning', target: 'bar', actions: [{ id: 'mic', label: 'Select microphone' }] }, (a) => {
      if (a === 'mic') broadcast('settings:open', { section: 'general' });
    });
    setState({ phase: 'resting', mode: null, startedAt: null });
    return;
  }
  const delayTimer = setTimeout(() => {
    if (getCtx().settings.get().notifications.processingDelay)
      showToast({ key: 'ProcessingDelayNotification', title: 'Taking longer than usual…', body: 'Your audio is saved for retrying.', target: 'bar' });
  }, 12_000);
  try {
    let asrText: string;
    let language: string;
    try {
      ({ text: asrText, language } = await transcribe(pcm));
    } catch (e) {
      const entry = saveHistory(s, { status: 'failed', asrText: '', formattedText: '', pcm, language: 'en', latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
      showToast({ key: 'TranscriptionError', title: "Something's not right", body: 'Transcription failed. Your audio is saved.', tone: 'error', target: 'bar', actions: [{ id: 'retry', label: 'Retry' }] }, (a) => {
        if (a === 'retry') void retryHistory(entry.id, true);
      });
      setState({ phase: 'resting', mode: null, startedAt: null });
      return;
    }
    if (!asrText.trim()) {
      saveHistory(s, { status: 'empty', asrText: '', formattedText: '', pcm, language, latencyMs: Date.now() - t0 });
      showToast({ key: 'TranscriptionEmpty', title: "We couldn't hear you", body: 'No words were detected.', tone: 'warning', target: 'bar' });
      setState({ phase: 'resting', mode: null, startedAt: null });
      return;
    }
    if (s.mode === 'command' || s.mode === 'lens' || s.mode === 'instruct') await deliverCommand(s, asrText, language, pcm, t0);
    else await deliver(s, asrText, language, pcm, t0);
  } finally {
    clearTimeout(delayTimer);
  }
}

/**
 * Command / Lens / Instruct: the spoken words are an instruction. With text selected it rewrites the selection;
 * without a selection it drafts new text from the instruction (and window title as context).
 */
async function deliverCommand(s: Session, instruction: string, language: string, pcm: Buffer, t0: number): Promise<void> {
  const { settings, llm, hotkeys } = getCtx();
  if (s.mode === 'command' && !settings.get().commandModeEnabled) {
    saveHistory(s, { status: 'cancelled', asrText: instruction, formattedText: '', pcm, language, latencyMs: 0 });
    showToast({ key: 'CommandModeDisabled', title: 'Command mode is toggled off', body: 'Please turn it on to use it.', target: 'bar', actions: [{ id: 'settings', label: 'Go to settings' }] }, (a) => {
      if (a === 'settings') broadcast('settings:open', { section: 'experimental' });
    });
    setState({ phase: 'resting', mode: null, startedAt: null });
    return;
  }
  showNudge('FirstTimeUsingCommandMode', { title: 'Using Command Mode (beta)', target: 'bar' }, { max: 1 });
  setState({ phase: 'polish_processing', polishName: 'Command' });
  await waitForModifiersReleased((k) => hotkeys.isHeld(k));
  const selection = await copySelection();
  let output = '';
  let error: string | null = null;
  try {
    output = await llm({
      system: selection
        ? "Apply the user's spoken instruction to the selected text. Output ONLY the resulting text, ready to replace the selection. No preamble."
        : `Write the text the user asks for, ready to paste into the focused app ("${s.target.title}"). Output ONLY that text. No preamble.`,
      input: selection ? `Instruction: ${instruction}\n\nSelected text:\n${selection}` : `Instruction: ${instruction}`,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const entry = saveHistory(s, { status: error ? 'failed' : 'success', asrText: instruction, formattedText: output, pcm, language, latencyMs: Date.now() - t0, error });
  setState({ lastEntryId: entry.id });
  if (error || !output.trim()) {
    showToast({ key: 'CommandModeServersAreBusy', title: 'Command failed', body: error ?? 'The AI returned no text.', tone: 'error', target: 'bar' });
    setState({ phase: 'resting', mode: null, startedAt: null, polishName: null });
    return;
  }
  await pasteText(output.trim(), { target: s.target });
  playSound('paste');
  setState({ phase: 'completed', mode: null, startedAt: null, polishName: null, message: selection ? 'Transformed!' : 'Done!' });
  setTimeout(() => {
    if (state.phase === 'completed') setState({ phase: 'resting', message: null });
  }, 1600);
}

async function deliver(s: Session, asrText: string, language: string, pcm: Buffer, t0: number): Promise<HistoryEntry> {
  const { settings } = getCtx();
  const st = settings.get();
  const app = { processName: s.target.processName, title: s.target.title };
  const formatted = await formatForApp(asrText, app);
  let finalText = formatted.text;
  // Auto Apply After Dictation: run the selected transform before pasting.
  if (st.transformsEnabled && st.autoApplyAfterDictation.active && finalText) {
    const tr = st.transforms.find((t) => t.id === st.autoApplyAfterDictation.transformId);
    if (tr) {
      setState({ phase: 'polish_processing', polishName: tr.name });
      try {
        finalText = await runTransformText(tr.id, finalText);
        showToast({ key: 'PolishAutoEditReady', title: 'We polished your dictation', target: 'bar', actions: [{ id: 'reveal', label: 'Reveal edit' }] }, (a) => {
          if (a === 'reveal') broadcast('diff:show', { before: formatted.text, after: finalText, title: tr.name });
        });
      } catch {
        // keep the cleaned dictation if the transform fails
      }
    }
  }
  markPhrasesUsed(formatted.usedPhrases);
  const isOwnWindow = MURMUR_PROCESSES[s.target.processName] === true && !s.target.title.toLowerCase().includes('scratchpad');
  const voidTarget = !s.target.hwnd || s.target.processName === 'explorer' && !s.target.title;
  const entry = saveHistory(s, {
    status: formatted.llmError && formatted.cleanupLevel !== 'light' ? 'raw' : 'success',
    asrText,
    formattedText: finalText,
    pcm,
    language,
    latencyMs: Date.now() - t0,
    extra: {
      pastedText: voidTarget ? null : finalText,
      cleanupLevel: formatted.cleanupLevel,
      styleContext: formatted.styleContext,
      numDictionaryReplacements: formatted.numDictionaryReplacements,
      numWordsCorrected: formatted.numWordsCorrected,
    },
  });
  setState({ lastEntryId: entry.id });
  if (voidTarget) {
    showToast({ key: 'VoidDictation', title: 'Select a textbox first, then dictate', body: finalText.slice(0, 120), target: 'bar', actions: [{ id: 'copy', label: 'Copy' }], durationMs: 10000 }, (a) => {
      if (a === 'copy') clipboard.writeText(finalText);
    });
  } else {
    await waitForModifiersReleased((k) => getCtx().hotkeys.isHeld(k));
    await pasteText(finalText, { target: s.target, pressEnter: formatted.pressEnter });
    playSound('paste');
    if (isOwnWindow) showNudge('PostOnboardingInAppDictation', { title: 'Try using Murmur in another app!', body: 'Murmur works anywhere you type.', target: 'bar' }, { max: 3 });
  }
  if (formatted.llmError) {
    showToast({ key: 'RawTranscript', title: 'Formatting may be missing', body: formatted.llmError.slice(0, 140), tone: 'warning', target: 'bar' });
  } else if (formatted.appliedFeatures.length) {
    const label = formatted.appliedFeatures.includes('list') ? 'Listed!' : formatted.appliedFeatures.includes('backtrack') ? 'Backtrack caught!' : 'Email formatted!';
    setState({ message: label });
  } else if (formatted.numWordsCorrected > 0) {
    setState({ message: 'Cleaned up!' });
  }
  setState({ phase: 'completed', mode: null, startedAt: null, polishName: null });
  setTimeout(() => {
    if (state.phase === 'completed') setState({ phase: 'resting', message: null });
  }, 1600);
  return entry;
}

/** Re-run ASR + formatting for a stored dictation. When `paste` is true the result is inserted like a live dictation. */
export async function retryHistory(id: string, paste: boolean): Promise<HistoryEntry> {
  const row = getHistoryRow(id);
  if (!row?.audioPath || !existsSync(row.audioPath)) throw new Error('Audio for this dictation is no longer available');
  const pcm = wavToPcm16(readFileSync(row.audioPath));
  const t0 = Date.now();
  const { text, language } = await transcribe(pcm);
  const target = paste ? getForegroundApp() : { hwnd: null, exe: row.app + '.exe', processName: row.app, title: row.appTitle };
  const s: Session = {
    id: row.id,
    mode: row.mode,
    startedAt: new Date(row.timestamp).getTime(),
    target,
    chunks: [pcm],
    stopping: true,
    cancelled: false,
    ended: Promise.withResolvers<string | null>(),
    warnTimer: setTimeout(() => {}, 0),
    maxTimer: setTimeout(() => {}, 0),
  };
  if (!text.trim()) return saveHistory(s, { status: 'empty', asrText: '', formattedText: '', pcm, language, latencyMs: Date.now() - t0 });
  if (paste) return deliver(s, text, language, pcm, t0);
  const f = await formatForApp(text, { processName: row.app, title: row.appTitle });
  return saveHistory(s, {
    status: 'success',
    asrText: text,
    formattedText: f.text,
    pcm,
    language,
    latencyMs: Date.now() - t0,
    extra: { cleanupLevel: f.cleanupLevel, styleContext: f.styleContext, numDictionaryReplacements: f.numDictionaryReplacements, numWordsCorrected: f.numWordsCorrected },
  });
}

function lastTranscript(): string | null {
  const r = getCtx().db.get<{ formattedText: string; asrText: string; hasRevertedAI: number }>(
    "SELECT formattedText, asrText, hasRevertedAI FROM history WHERE status IN ('success','raw') ORDER BY timestamp DESC LIMIT 1",
  );
  if (!r) return null;
  return r.hasRevertedAI ? r.asrText : r.formattedText;
}

export async function pasteLast(): Promise<void> {
  const t = lastTranscript();
  if (!t) {
    showToast({ key: 'SuggestPasteLastText', title: 'No transcript to paste yet', target: 'bar' });
    return;
  }
  await waitForModifiersReleased((k) => getCtx().hotkeys.isHeld(k));
  await pasteText(t, { target: getForegroundApp() });
}

export function copyLast(): void {
  const t = lastTranscript();
  if (!t) return;
  clipboard.writeText(t);
  showToast({ key: 'CopyLast', title: 'Last transcript copied', target: 'bar', tone: 'success', durationMs: 2000 });
}

export function registerDictation(): void {
  handle('dictation', {
    getState: () => state,
    start: (mode) => startDictation(mode),
    stop: () => stopDictation(),
    cancel: () => cancelDictation(),
    pasteLast: () => pasteLast(),
    copyLast: () => copyLast(),
    retry: (id) => retryHistory(id, false),
    async formatText(text, app) {
      return (await formatForApp(text, { processName: app ?? '', title: '' })).text;
    },
    pushAudio(chunk, level) {
      if (!session || session.cancelled) return;
      session.chunks.push(Buffer.from(chunk));
      if (Date.now() - lastLevelAt > 50) {
        lastLevelAt = Date.now();
        setState({ level });
      }
    },
    captureEnded(error) {
      session?.ended.resolve(error ?? null);
      // cancelled sessions are already detached from `session`
      pendingCancelled.forEach((s) => s.ended.resolve(error ?? null));
      pendingCancelled.clear();
    },
    hideBarFor(ms) {
      getCtx().settings.patch({ flowBarHiddenUntil: Date.now() + ms });
    },
  });
}
