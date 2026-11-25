import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { app, dialog, shell } from 'electron';
import type { CalendarEvent, Meeting, MeetingChatMessage, Todo, TranscriptSegment } from '@shared/types';
import { getCtx } from '../context';
import { newId, nowIso } from '../db';
import { broadcast, callerWindow, handle } from '../ipc';
import { paths } from '../paths';
import { showToast } from '../toasts';
import { ensureHub } from '../windows';
import { pcm16ToWav, wavToPcm16 } from '../audio/wav';
import { parseIcs } from '../meetings/ics';
import { generateMeetingSummary, summaryMarkdown } from '../meetings/summary';
import { getMeeting, listFolders, listMeetings, updateSearchable } from '../meetings/store';
import { startRecording } from './recorder';
let granolaCancelRequested = false;

function requireMeeting(id: string): Meeting {
  const meeting = getMeeting(id);
  if (!meeting) throw new Error('Meeting not found');
  return meeting;
}

function saveTranscript(id: string, segments: TranscriptSegment[]): Meeting {
  getCtx().db.update('meetings', id, { transcript: JSON.stringify(segments) });
  updateSearchable(id);
  broadcast('meetings:changed', { id });
  return requireMeeting(id);
}

function parseTranscript(text: string): TranscriptSegment[] {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/^WEBVTT.*$/gim, '').replace(/^\d+\s*$/gm, '').replace(/^\s*\d{2}:?\d{0,2}:\d{2}[,.\d]*\s*-->\s*.*$/gm, '');
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const speakerMatch = line.match(/^([^:]{1,40}):\s+(.+)$/);
    const name = speakerMatch?.[1] ?? 'Others';
    return {
      id: newId(),
      speaker: name.toLowerCase() === 'you' ? 'you' : `speaker-${name.toLowerCase().replace(/\W+/g, '-')}`,
      speakerName: name,
      start: index * 4,
      end: index * 4 + 4,
      text: speakerMatch?.[2] ?? line,
      edited: false,
    };
  });
}

function createImportedMeeting(filePath: string, segments: TranscriptSegment[], importSource: string): Meeting {
  const id = newId();
  const title = basename(filePath, extname(filePath)).replace(/[-_]+/g, ' ').trim() || 'Imported meeting';
  const createdAt = nowIso();
  getCtx().db.insert('meetings', {
    id,
    title,
    createdAt,
    endedAt: createdAt,
    durationSec: segments.reduce((max, segment) => Math.max(max, segment.end), 0),
    app: null,
    myNotes: '',
    transcript: JSON.stringify(segments),
    summary: null,
    summaryStatus: 'none',
    importSource,
    isDeleted: 0,
    language: 'en',
    audioPath: null,
    searchable: `${title} ${segments.map((segment) => segment.text).join(' ')}`,
  });
  return requireMeeting(id);
}

function decodeAudio(filePath: string): Buffer {
  if (extname(filePath).toLowerCase() === '.wav') return wavToPcm16(readFileSync(filePath));
  const probe = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) throw new Error('MP3 and M4A imports require ffmpeg on PATH. WAV files can be imported directly.');
  const output = join(paths.audioDir, `${newId()}.wav`);
  const result = spawnSync('ffmpeg', ['-y', '-i', filePath, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'ffmpeg could not decode the audio file');
  return wavToPcm16(readFileSync(output));
}

async function importFile(filePath: string): Promise<Meeting> {
  const extension = extname(filePath).toLowerCase();
  if (['.txt', '.vtt', '.srt'].includes(extension)) return createImportedMeeting(filePath, parseTranscript(readFileSync(filePath, 'utf8')), extension.slice(1));
  if (!['.wav', '.mp3', '.m4a'].includes(extension)) throw new Error(`Unsupported meeting file: ${extension}`);
  const pcm = decodeAudio(filePath);
  const settings = getCtx().settings.get();
  await getCtx().asr.start(settings.asr.model, settings.asr.threads);
  const result = await getCtx().asr.transcribe(pcm16ToWav(pcm), { language: settings.autoDetectLanguage ? 'auto' : (settings.languages[0] ?? 'en') });
  const segments = result.segments.map((segment) => ({ id: newId(), speaker: 'others', speakerName: 'Others', start: segment.start, end: segment.end, text: segment.text.trim(), edited: false })).filter((segment) => segment.text);
  const meeting = createImportedMeeting(filePath, segments, extension.slice(1));
  getCtx().db.update('meetings', meeting.id, { audioPath: filePath, language: result.language });
  return requireMeeting(meeting.id);
}

function rowToChat(row: { id: string; meetingId: string; role: 'user' | 'assistant'; content: string; status: 'done' | 'pending' | 'failed'; createdAt: string }): MeetingChatMessage {
  return { id: row.id, chatId: row.meetingId, role: row.role, content: row.content, status: row.status, createdAt: row.createdAt };
}

function addTodo(meeting: Meeting, title: string): Todo {
  const id = newId();
  const timestamp = nowIso();
  getCtx().db.insert('todos', { id, meetingId: meeting.id, title, status: 'open', priority: 'none', isArchived: 0, isDeleted: 0, sortOrder: Date.now(), createdAt: timestamp, modifiedAt: timestamp });
  return { id, meetingId: meeting.id, meetingTitle: meeting.title, title, status: 'open', priority: 'none', isArchived: false, sortOrder: Date.now(), createdAt: timestamp, modifiedAt: timestamp };
}

async function loadCalendar(): Promise<CalendarEvent[]> {
  const sources = getCtx().settings.get().notetaker.calendarIcsSources;
  const now = new Date();
  const until = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const calendars = await Promise.all(sources.map(async (source) => {
    try {
      const text = /^https?:\/\//i.test(source) ? await (await fetch(source)).text() : readFileSync(source, 'utf8');
      return parseIcs(text, basename(source), now, until);
    } catch {
      return [];
    }
  }));
  const events = calendars.flat().sort((a, b) => a.start.localeCompare(b.start));
  getCtx().db.kvSet('notetaker.calendar', events);
  scheduleReminders(events);
  return events;
}

const reminderTimers = new Map<string, NodeJS.Timeout>();
function scheduleReminders(events: CalendarEvent[]): void {
  for (const timer of reminderTimers.values()) clearTimeout(timer);
  reminderTimers.clear();
  const notetaker = getCtx().settings.get().notetaker;
  const minutes = notetaker.notifyBeforeMeetingMin;
  if (!minutes || !notetaker.calendarNotifications) return;
  for (const event of events) {
    const delay = new Date(event.start).getTime() - Date.now() - minutes * 60_000;
    if (delay < 0 || delay > 7 * 24 * 60 * 60 * 1000) continue;
    reminderTimers.set(event.id, setTimeout(() => {
      showToast({ key: `Calendar:${event.id}`, title: event.title, body: 'Your meeting is starting soon', target: 'hub', actions: [
        ...(event.conferenceUrl ? [{ id: 'join', label: 'Join' }] : []),
        { id: 'start', label: 'Start Notetaker' },
      ] }, (action) => {
        if (action === 'join' && event.conferenceUrl) void shell.openExternal(event.conferenceUrl);
        if (action === 'start') void startRecording({ title: event.title, calendarEventId: event.id });
      });
    }, delay));
  }
}

function enforceTranscriptRetention(): void {
  const days = getCtx().settings.get().notetaker.transcriptRetentionDays;
  if (!days) return;
  const cutoff = Date.now() - days * 86_400_000;
  const warningCutoff = cutoff + 86_400_000;
  const rows = getCtx().db.all<{ id: string; title: string; createdAt: string }>("SELECT id, title, createdAt FROM meetings WHERE isDeleted = 0 AND transcript <> '[]'");
  for (const row of rows) {
    const created = new Date(row.createdAt).getTime();
    if (created < cutoff) {
      getCtx().db.update('meetings', row.id, { transcript: '[]' });
      updateSearchable(row.id);
    } else if (created < warningCutoff) {
      showToast({ key: `Retention:${row.id}`, title: 'Transcript will be removed in 24 hours', body: row.title, tone: 'warning', target: 'hub', actions: [{ id: 'open', label: 'Open meeting' }] }, (action) => {
        if (action === 'open') ensureHub(true, `/notetaker/${row.id}`);
      });
    }
  }
}

export function registerMeetings(): void {
  handle('meetings', {
    list: (opts) => listMeetings(opts),
    get: (id) => getMeeting(id),
    rename(id, title) {
      const trimmed = title.trim();
      if (!trimmed) throw new Error('Title cannot be empty');
      getCtx().db.update('meetings', id, { title: trimmed });
      updateSearchable(id);
      broadcast('meetings:changed', { id });
      return requireMeeting(id);
    },
    updateNotes(id, html) {
      requireMeeting(id);
      getCtx().db.update('meetings', id, { myNotes: html });
      updateSearchable(id);
      broadcast('meetings:changed', { id });
    },
    editSegment(id, segmentId, text) {
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Transcript text cannot be empty');
      const meeting = requireMeeting(id);
      const segments = meeting.transcript.map((segment) => segment.id === segmentId ? { ...segment, text: trimmed, originalText: segment.originalText ?? segment.text, edited: true } : segment);
      return saveTranscript(id, segments);
    },
    renameSpeaker(id, speaker, name) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Speaker name cannot be empty');
      const meeting = requireMeeting(id);
      return saveTranscript(id, meeting.transcript.map((segment) => segment.speaker === speaker ? { ...segment, speakerName: trimmed } : segment));
    },
    correctSegment(id, segmentId, expectedText, text) {
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Transcript text cannot be empty');
      const meeting = requireMeeting(id);
      const segment = meeting.transcript.find((item) => item.id === segmentId);
      if (!segment) throw new Error('Transcript line not found');
      if (segment.text !== expectedText) throw new Error('This line changed elsewhere. Copy your edit, then reload and try again.');
      const originalText = segment.originalText ?? segment.text;
      getCtx().db.insert('transcript_corrections', {
        id: newId(),
        meetingId: id,
        artifactRevision: nowIso(),
        artifactDigest: createHash('sha256').update(meeting.transcript.map((item) => item.text).join('\n')).digest('hex'),
        entryId: segmentId,
        originalText,
        editedText: trimmed,
        createdAt: nowIso(),
        revertedAt: null,
      });
      return saveTranscript(id, meeting.transcript.map((item) => item.id === segmentId ? { ...item, text: trimmed, originalText, edited: true } : item));
    },
    revertSegment(id, segmentId) {
      const meeting = requireMeeting(id);
      const segment = meeting.transcript.find((item) => item.id === segmentId);
      if (!segment?.originalText) return meeting;
      getCtx().db.run('UPDATE transcript_corrections SET revertedAt = ? WHERE meetingId = ? AND entryId = ? AND revertedAt IS NULL', nowIso(), id, segmentId);
      return saveTranscript(id, meeting.transcript.map((item) => item.id === segmentId ? { ...item, text: item.originalText!, edited: false, originalText: undefined } : item));
    },
    remove(id) {
      const meeting = requireMeeting(id);
      if (meeting.importSource) getCtx().db.run('INSERT OR REPLACE INTO import_tombstones (source, externalId, deletedAt) VALUES (?, ?, ?)', meeting.importSource, meeting.title, nowIso());
      getCtx().db.update('meetings', id, { isDeleted: 1 });
      broadcast('meetings:changed', { id });
    },
    regenerateSummary: (id, template) => generateMeetingSummary(id, template),
    async chat(id, message) {
      const meeting = requireMeeting(id);
      const trimmed = message.trim();
      if (!trimmed) throw new Error('Ask a question first');
      const user: MeetingChatMessage = { id: newId(), chatId: id, role: 'user', content: trimmed, status: 'done', createdAt: nowIso() };
      getCtx().db.insert('meeting_chat', { id: user.id, meetingId: id, role: user.role, content: user.content, status: user.status, createdAt: user.createdAt });
      let instruction = 'Answer using only the meeting transcript and summary. Be concise and say when the meeting does not contain the answer.';
      const command = trimmed.match(/^\/([a-z0-9-]+)/)?.[1];
      if (command) {
        const skill = getCtx().db.get<{ instructions: string }>('SELECT instructions FROM skills WHERE command = ?', command);
        if (skill) instruction = skill.instructions;
      }
      const context = `${meeting.summary ? JSON.stringify(meeting.summary) : ''}\n${meeting.transcript.map((segment) => `${segment.speakerName}: ${segment.text}`).join('\n')}`;
      const catchUpKey = `notetaker.catchUp.${id}`;
      const contextDigest = createHash('sha256').update(context).digest('hex');
      const isCatchUp = /^what did i miss[?!.]*$/i.test(trimmed);
      const previousDigest = isCatchUp ? getCtx().db.kvGet<string | null>(catchUpKey, null) : null;
      if (isCatchUp) getCtx().db.kvSet(catchUpKey, contextDigest);
      const answer = isCatchUp && previousDigest === contextDigest
        ? 'Nothing new since you last looked.'
        : await getCtx().llm({ system: instruction, input: `${context}\n\nQuestion: ${trimmed}` });
      const assistant: MeetingChatMessage = { id: newId(), chatId: id, role: 'assistant', content: answer, status: 'done', createdAt: nowIso() };
      getCtx().db.insert('meeting_chat', { id: assistant.id, meetingId: id, role: assistant.role, content: assistant.content, status: assistant.status, createdAt: assistant.createdAt });
      return [user, assistant];
    },
    chatHistory(id) {
      return getCtx().db.all<{ id: string; meetingId: string; role: 'user' | 'assistant'; content: string; status: 'done' | 'pending' | 'failed'; createdAt: string }>('SELECT * FROM meeting_chat WHERE meetingId = ? ORDER BY createdAt', id).map(rowToChat);
    },
    saveChatFact(id, messageId) {
      const meeting = requireMeeting(id);
      const message = getCtx().db.get<{ content: string }>('SELECT content FROM meeting_chat WHERE id = ? AND meetingId = ?', messageId, id);
      if (!message) throw new Error('Chat response not found');
      const existing = getCtx().db.get<{ id: string; content: string; versions: string }>("SELECT id, content, versions FROM memory_docs WHERE folder = 'knowledge' AND title = 'Saved facts'");
      if (existing) {
        getCtx().db.update('memory_docs', existing.id, { content: `${existing.content}\n- ${message.content}`, source: `Meeting: ${meeting.title}`, changedBy: 'user', modifiedAt: nowIso() });
      } else {
        getCtx().db.insert('memory_docs', { id: newId(), folder: 'knowledge', title: 'Saved facts', content: `- ${message.content}`, source: `Meeting: ${meeting.title}`, changedBy: 'user', versions: '[]', modifiedAt: nowIso() });
      }
      broadcast('memory:status', { state: 'idle', lastRunAt: null, docCount: getCtx().db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memory_docs')?.count ?? 0, sources: { meetings: 0, dictations: 0, notes: 0 }, error: null });
    },
    extractTodos(id) {
      const meeting = requireMeeting(id);
      const existing = new Set(getCtx().db.all<{ title: string }>('SELECT title FROM todos WHERE meetingId = ? AND isDeleted = 0', id).map((row) => row.title));
      const todos = (meeting.summary?.actionItems ?? []).filter((item) => !existing.has(item.text)).map((item) => addTodo(meeting, item.text));
      if (todos.length) broadcast('todos:changed', null);
      return todos;
    },
    exportMarkdown(id) {
      const meeting = requireMeeting(id);
      const options = { defaultPath: `${meeting.title.replace(/[<>:"/\\|?*]/g, '-')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] };
      const parent = callerWindow();
      const file = parent ? dialog.showSaveDialogSync(parent, options) : dialog.showSaveDialogSync(options);
      if (!file) return '';
      writeFileSync(file, summaryMarkdown(meeting), 'utf8');
      return file;
    },
    async importFiles(filePaths) {
      const meetings = [];
      for (const filePath of filePaths) meetings.push(await importFile(filePath));
      broadcast('meetings:changed', { id: meetings.at(-1)?.id ?? null });
      return meetings.map((meeting) => ({ id: meeting.id, title: meeting.title, createdAt: meeting.createdAt, durationSec: meeting.durationSec, summaryStatus: meeting.summaryStatus, preview: meeting.transcript.map((segment) => segment.text).join(' ').slice(0, 180), folderIds: meeting.folderIds, importSource: meeting.importSource }));
    },
    importGranola() {
      const cache = join(app.getPath('appData'), 'Granola', 'cache-v3.json');
      if (!existsSync(cache)) throw new Error('Granola cache not found. Install and open Granola once, then try again.');
      granolaCancelRequested = false;
      const raw: unknown = JSON.parse(readFileSync(cache, 'utf8'));
      const documents = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>).find(Array.isArray) ?? [];
      let imported = 0;
      for (const item of documents as Record<string, unknown>[]) {
        if (granolaCancelRequested) break;
        const title = typeof item.title === 'string' ? item.title : `Granola meeting ${imported + 1}`;
        const deleted = getCtx().db.get('SELECT 1 FROM import_tombstones WHERE source = ? AND externalId = ?', 'granola', title);
        if (deleted) continue;
        const transcript = typeof item.transcript === 'string' ? item.transcript : typeof item.notes === 'string' ? item.notes : '';
        if (!transcript) continue;
        createImportedMeeting(`${title}.txt`, parseTranscript(transcript), 'granola');
        imported++;
      }
      const settings = getCtx().settings.get();
      if (!granolaCancelRequested) getCtx().settings.set('notetaker', { ...settings.notetaker, granolaImported: true });
      broadcast('meetings:changed', { id: null });
      return { imported };
    },
    cancelGranolaImport() {
      granolaCancelRequested = true;
    },
    listFolders,
    createFolder(name, description = '') {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Folder name cannot be empty');
      const id = newId();
      getCtx().db.insert('folders', { id, name: trimmed, description: description.trim(), createdAt: nowIso() });
      return listFolders().find((folder) => folder.id === id)!;
    },
    renameFolder(id, name) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Folder name cannot be empty');
      getCtx().db.update('folders', id, { name: trimmed });
      const folder = listFolders().find((item) => item.id === id);
      if (!folder) throw new Error('Folder not found');
      return folder;
    },
    deleteFolder(id) {
      getCtx().db.run('DELETE FROM folders WHERE id = ?', id);
    },
    setFolders(meetingId, folderIds) {
      requireMeeting(meetingId);
      getCtx().db.tx(() => {
        getCtx().db.run('DELETE FROM folder_meetings WHERE meetingId = ?', meetingId);
        for (const folderId of new Set(folderIds)) getCtx().db.insert('folder_meetings', { folderId, meetingId });
      });
      broadcast('meetings:changed', { id: meetingId });
    },
    upcoming() {
      return getCtx().db.kvGet<CalendarEvent[]>('notetaker.calendar', []).filter((event) => new Date(event.end).getTime() >= Date.now());
    },
    refreshCalendar: loadCalendar,
    snoozeCalendar(eventId) {
      const event = getCtx().db.kvGet<CalendarEvent[]>('notetaker.calendar', []).find((item) => item.id === eventId);
      if (!event) throw new Error('Calendar event not found');
      setTimeout(() => showToast({ key: `CalendarSnooze:${event.id}`, title: event.title, body: 'Your meeting starts soon.', tone: 'info', target: 'hub', actions: event.conferenceUrl ? [{ id: 'join', label: 'Join meeting' }] : undefined }, (action) => {
        if (action === 'join' && event.conferenceUrl) void shell.openExternal(event.conferenceUrl);
      }), 2 * 60_000);
    },
    getBrief(eventId) {
      const event = getCtx().db.kvGet<CalendarEvent[]>('notetaker.calendar', []).find((item) => item.id === eventId);
      if (!event) throw new Error('Calendar event not found');
      const prior = listMeetings({ query: event.title, limit: 5 });
      const content = prior.length
        ? prior.map((meeting) => `• ${meeting.title}: ${meeting.preview || 'No summary available'}`).join('\n')
        : 'No previous meetings with a similar title were found.';
      return { title: `Brief for ${event.title}`, content };
    },
    rateSummary(id, rating, note = '') {
      const meeting = requireMeeting(id);
      if (!meeting.summary) throw new Error('No summary to rate');
      if (rating === null) {
        getCtx().db.run('DELETE FROM meeting_feedback WHERE meetingId = ?', id);
        return;
      }
      getCtx().db.run('INSERT INTO meeting_feedback (meetingId, rating, note, summaryGeneratedAt, createdAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(meetingId) DO UPDATE SET rating = excluded.rating, note = excluded.note, summaryGeneratedAt = excluded.summaryGeneratedAt, createdAt = excluded.createdAt', id, rating, note.trim(), meeting.summary.generatedAt, nowIso());
    },
    summaryVersions(id) {
      requireMeeting(id);
      return getCtx().db.all<{ id: string; source: string; createdAt: string; content: string }>('SELECT id, source, createdAt, content FROM meeting_versions WHERE meetingId = ? ORDER BY createdAt DESC', id).map((row) => ({ id: row.id, source: row.source, createdAt: row.createdAt, summary: JSON.parse(row.content) as Meeting['summary'] }));
    },
  });
  void loadCalendar();
  enforceTranscriptRetention();
}
