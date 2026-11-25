import type { Folder, Meeting, MeetingListItem, MeetingSummary, TranscriptSegment } from '@shared/types';
import { getCtx } from '../context';

export interface MeetingRow {
  id: string;
  title: string;
  createdAt: string;
  endedAt: string | null;
  durationSec: number;
  app: string | null;
  myNotes: string;
  transcript: string;
  summary: string | null;
  summaryStatus: Meeting['summaryStatus'];
  importSource: string | null;
  isDeleted: number;
  language: string;
  audioPath: string | null;
  searchable: string;
  isTourDemo: number;
  processingPhase: Meeting['processingPhase'] | null;
  deliveredSummary: string | null;
  summaryUpdatedAt: string | null;
  audioUpdatedAt: string | null;
  noticePosted: number;
  autoShareEnabled: number;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function folderIds(meetingId: string): string[] {
  return getCtx().db.all<{ folderId: string }>('SELECT folderId FROM folder_meetings WHERE meetingId = ?', meetingId).map((row) => row.folderId);
}

export function rowToMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
    durationSec: Number(row.durationSec),
    app: row.app,
    myNotes: row.myNotes,
    transcript: parseJson<TranscriptSegment[]>(row.transcript, []),
    summary: parseJson<MeetingSummary | null>(row.summary, null),
    summaryStatus: row.summaryStatus,
    folderIds: folderIds(row.id),
    importSource: row.importSource,
    isDeleted: Boolean(row.isDeleted),
    language: row.language,
    isTourDemo: Boolean(row.isTourDemo),
    processingPhase: row.processingPhase,
    deliveredSummary: parseJson<MeetingSummary | null>(row.deliveredSummary, null),
    summaryUpdatedAt: row.summaryUpdatedAt,
    audioUpdatedAt: row.audioUpdatedAt,
    noticePosted: Boolean(row.noticePosted),
    autoShareEnabled: Boolean(row.autoShareEnabled),
  };
}

export function getMeeting(id: string): Meeting | null {
  const row = getCtx().db.get<MeetingRow>('SELECT * FROM meetings WHERE id = ? AND isDeleted = 0', id);
  return row ? rowToMeeting(row) : null;
}

export function listMeetings(opts: { query?: string; folderId?: string | null; limit?: number }): MeetingListItem[] {
  const query = opts.query?.trim().toLowerCase() ?? '';
  const clauses = ['m.isDeleted = 0'];
  const params: string[] = [];
  if (query) {
    clauses.push('(LOWER(m.title) LIKE ? OR LOWER(m.searchable) LIKE ?)');
    params.push(`%${query}%`, `%${query}%`);
  }
  if (opts.folderId) {
    clauses.push('EXISTS (SELECT 1 FROM folder_meetings fm WHERE fm.meetingId = m.id AND fm.folderId = ?)');
    params.push(opts.folderId);
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 500));
  const rows = getCtx().db.all<MeetingRow>(`SELECT m.* FROM meetings m WHERE ${clauses.join(' AND ')} ORDER BY m.createdAt DESC LIMIT ${limit}`, ...params);
  return rows.map((row) => {
    const summary = parseJson<MeetingSummary | null>(row.summary, null);
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      durationSec: Number(row.durationSec),
      summaryStatus: row.summaryStatus,
      preview: summary?.overview ?? row.searchable.slice(0, 180),
      folderIds: folderIds(row.id),
      importSource: row.importSource,
      participantCount: new Set(parseJson<TranscriptSegment[]>(row.transcript, []).map((segment) => segment.speaker)).size,
      taskCount: getCtx().db.get<{ count: number }>('SELECT COUNT(*) AS count FROM todos WHERE meetingId = ? AND isDeleted = 0', row.id)?.count ?? 0,
      noticePosted: Boolean(row.noticePosted),
      autoShareEnabled: Boolean(row.autoShareEnabled),
    };
  });
}

export function updateSearchable(id: string): void {
  const meeting = getMeeting(id);
  if (!meeting) return;
  const text = [meeting.title, meeting.myNotes.replace(/<[^>]+>/g, ' '), meeting.transcript.map((segment) => segment.text).join(' '), meeting.summary?.overview ?? '', ...(meeting.summary?.sections.flatMap((section) => section.bullets) ?? [])].join(' ');
  getCtx().db.update('meetings', id, { searchable: text });
}

export function listFolders(): Folder[] {
  return getCtx().db.all<{ id: string; name: string; description: string; createdAt: string; meetingCount: number }>(
    'SELECT f.*, COUNT(fm.meetingId) AS meetingCount FROM folders f LEFT JOIN folder_meetings fm ON fm.folderId = f.id GROUP BY f.id ORDER BY f.name COLLATE NOCASE',
  ).map((row) => ({ ...row, meetingCount: Number(row.meetingCount) }));
}
