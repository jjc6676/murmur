import type { Todo } from '@shared/types';
import { getCtx } from '../context';
import { newId, nowIso } from '../db';
import { broadcast, handle } from '../ipc';

interface TodoRow {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  title: string;
  status: Todo['status'];
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
  isArchived: !!row.isArchived,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt,
  modifiedAt: row.modifiedAt,
});

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
  });
}
