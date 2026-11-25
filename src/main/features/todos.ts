import { dialog } from 'electron';
import { writeFileSync } from 'node:fs';
import { broadcast, handle } from '../ipc';
import type { Todo } from '@shared/types';
import { getCtx } from '../context';
import { newId, nowIso } from '../db';

interface TodoRow {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  title: string;
  status: Todo['status'];
  priority: Todo['priority'];
  isArchived: number;
  isDeleted: number;
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
}

const toTodo = (row: TodoRow): Todo => ({
  id: row.id,
  meetingId: row.meetingId,
  meetingTitle: row.meetingTitle,
  title: row.title,
  status: row.status,
  priority: row.priority,
  isArchived: !!row.isArchived,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt,
  modifiedAt: row.modifiedAt,
});

const validPriorities: Record<Todo['priority'], true> = { high: true, medium: true, low: true, none: true };
const icsEscape = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
const icsDate = (value: string): string => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function getTodo(id: string): TodoRow {
  const row = getCtx().db.get<TodoRow>(
    'SELECT t.*, m.title AS meetingTitle FROM todos t LEFT JOIN meetings m ON m.id = t.meetingId WHERE t.id = ? AND t.isDeleted = 0',
    id,
  );
  if (!row) throw new Error('Task not found');
  return row;
}

export function registerTodos(): void {
  handle('todos', {
    list({ archived, query = '' }) {
      const q = query.trim().toLowerCase();
      const base =
        'SELECT t.*, m.title AS meetingTitle FROM todos t LEFT JOIN meetings m ON m.id = t.meetingId WHERE t.isDeleted = 0 AND t.isArchived = ?';
      const rows = q
        ? getCtx().db.all<TodoRow>(`${base} AND LOWER(t.title) LIKE ? ORDER BY t.sortOrder ASC, t.createdAt DESC`, archived ? 1 : 0, `%${q}%`)
        : getCtx().db.all<TodoRow>(`${base} ORDER BY t.sortOrder ASC, t.createdAt DESC`, archived ? 1 : 0);
      return rows.map(toTodo);
    },
    add(title, meetingId = null) {
      const ts = nowIso();
      const cleanTitle = title.trim() || 'Untitled task';
      const row = {
        id: newId(),
        meetingId,
        title: cleanTitle.slice(0, 500),
        status: 'open',
        priority: 'none',
        isArchived: 0,
        isDeleted: 0,
        sortOrder: Date.now(),
        createdAt: ts,
        modifiedAt: ts,
      } satisfies Omit<TodoRow, 'meetingTitle'>;
      getCtx().db.insert('todos', row);
      broadcast('todos:changed', null);
      return toTodo({ ...row, meetingTitle: meetingId ? getCtx().db.get<{ title: string }>('SELECT title FROM meetings WHERE id = ?', meetingId)?.title ?? null : null });
    },
    update(id, patch) {
      const current = getTodo(id);
      const title = patch.title === undefined ? current.title : patch.title.trim() || 'Untitled task';
      getCtx().db.update('todos', id, {
        title: title.slice(0, 500),
        status: patch.status ?? current.status,
        priority: patch.priority === undefined ? current.priority : validPriorities[patch.priority] ? patch.priority : 'none',
        isArchived: patch.isArchived === undefined ? current.isArchived : patch.isArchived ? 1 : 0,
        sortOrder: patch.sortOrder ?? current.sortOrder,
        modifiedAt: nowIso(),
      });
      broadcast('todos:changed', null);
      return toTodo(getTodo(id));
    },
    remove(ids) {
      const ts = nowIso();
      getCtx().db.tx(() => {
        for (const id of new Set(ids)) getCtx().db.run('UPDATE todos SET isDeleted = 1, modifiedAt = ? WHERE id = ?', ts, id);
      });
      broadcast('todos:changed', null);
    },
    archiveMany(ids, archived) {
      const ts = nowIso();
      getCtx().db.tx(() => {
        for (const id of new Set(ids)) getCtx().db.run('UPDATE todos SET isArchived = ?, modifiedAt = ? WHERE id = ? AND isDeleted = 0', archived ? 1 : 0, ts, id);
      });
      broadcast('todos:changed', null);
    },
    recordEmail(input) {
      if (!input.to.trim()) throw new Error('Enter at least one recipient');
      getCtx().db.insert('automations', {
        id: newId(), entityKind: 'todo', entityId: input.todoId, kind: 'email',
        payload: JSON.stringify(input), createdAt: nowIso(),
      });
    },
    saveCalendarFile(input) {
      const start = new Date(input.start);
      const end = new Date(input.end);
      if (!input.title.trim() || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
        throw new Error('Enter a title and a valid end time after the start time');
      }
      const guests = input.guests.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
      const attendees = guests.map((email) => `ATTENDEE;CN=${icsEscape(email)}:mailto:${icsEscape(email)}`).join('\r\n');
      const body = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Murmur//Tasks//EN', 'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT', `UID:${newId()}@murmur.local`, `DTSTAMP:${icsDate(nowIso())}`,
        `DTSTART:${icsDate(input.start)}`, `DTEND:${icsDate(input.end)}`, `SUMMARY:${icsEscape(input.title.trim())}`,
        `DESCRIPTION:${icsEscape(input.description.trim())}`, attendees, 'END:VEVENT', 'END:VCALENDAR', '',
      ].filter(Boolean).join('\r\n');
      const file = dialog.showSaveDialogSync({
        title: 'Save calendar event',
        defaultPath: `${input.title.trim().replace(/[<>:"/\\|?*]/g, '-').slice(0, 80) || 'task'}.ics`,
        filters: [{ name: 'Calendar event', extensions: ['ics'] }],
      });
      if (!file) return null;
      writeFileSync(file, body, 'utf8');
      getCtx().db.insert('automations', {
        id: newId(), entityKind: 'todo', entityId: input.todoId, kind: 'calendar',
        payload: JSON.stringify(input), createdAt: nowIso(),
      });
      return file;
    },
  });
}
