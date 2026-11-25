// Dictation history: listing, search, revert/redo AI edits, audio access, deletion.
import { dialog } from 'electron';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { HistoryEntry } from '@shared/types';
import { getCtx } from '../context';
import { broadcast, handle } from '../ipc';

export interface HistoryRow {
  id: string;
  timestamp: string;
  asrText: string;
  formattedText: string;
  pastedText: string | null;
  editedText: string | null;
  status: HistoryEntry['status'];
  app: string;
  appTitle: string;
  duration: number;
  speechDuration: number;
  numWords: number;
  language: string;
  mode: HistoryEntry['mode'];
  cleanupLevel: HistoryEntry['cleanupLevel'];
  styleContext: HistoryEntry['styleContext'];
  audioPath: string | null;
  hasRevertedAI: number;
  isArchived: number;
  numDictionaryReplacements: number;
  numWordsCorrected: number;
  latencyMs: number;
  error: string | null;
  feedback: string | null;
  accessibilityContext: string | null;
}

export function rowToHistory(r: HistoryRow): HistoryEntry {
  const { audioPath, hasRevertedAI, isArchived, ...rest } = r;
  return { ...rest, hasAudio: !!audioPath && existsSync(audioPath), hasRevertedAI: !!hasRevertedAI, isArchived: !!isArchived };
}

export function getHistoryRow(id: string): HistoryRow | undefined {
  return getCtx().db.get<HistoryRow>('SELECT * FROM history WHERE id = ?', id);
}

export function registerHistory(): void {
  const { db } = getCtx();
  const get = (id: string): HistoryEntry => {
    const r = getHistoryRow(id);
    if (!r) throw new Error('Transcript not found');
    return rowToHistory(r);
  };
  handle('history', {
    list({ query, limit = 200, offset = 0, includeArchived = false }) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (!includeArchived) where.push('isArchived = 0');
      if (query?.trim()) {
        where.push('(formattedText LIKE ? OR asrText LIKE ?)');
        params.push(`%${query.trim()}%`, `%${query.trim()}%`);
      }
      const sql = `SELECT * FROM history ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      return db.all<HistoryRow>(sql, ...params, limit, offset).map(rowToHistory);
    },
    get(id) {
      const r = getHistoryRow(id);
      return r ? rowToHistory(r) : null;
    },
    delete(id) {
      const r = getHistoryRow(id);
      if (r?.audioPath) rmSync(r.audioPath, { force: true });
      db.run('DELETE FROM history WHERE id = ?', id);
      broadcast('history:changed', { id });
    },
    archive(id, archived) {
      db.run('UPDATE history SET isArchived = ? WHERE id = ?', archived ? 1 : 0, id);
      broadcast('history:changed', { id });
    },
    undoAiEdit(id) {
      db.run('UPDATE history SET hasRevertedAI = 1 WHERE id = ?', id);
      broadcast('history:changed', { id });
      return get(id);
    },
    redoAiEdit(id) {
      db.run('UPDATE history SET hasRevertedAI = 0 WHERE id = ?', id);
      broadcast('history:changed', { id });
      return get(id);
    },
    getAudio(id) {
      const r = getHistoryRow(id);
      if (!r?.audioPath || !existsSync(r.audioPath)) return null;
      const b = readFileSync(r.audioPath);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    saveAudioAs(id) {
      const r = getHistoryRow(id);
      if (!r?.audioPath || !existsSync(r.audioPath)) return null;
      const target = dialog.showSaveDialogSync({ defaultPath: `murmur-dictation-${id.slice(0, 8)}.wav`, filters: [{ name: 'WAV audio', extensions: ['wav'] }] });
      if (!target) return null;
      copyFileSync(r.audioPath, target);
      return target;
    },
    report(id, input) {
      const feedback = JSON.stringify({
        expectedText: input.expectedText.trim(),
        comments: input.comments.trim(),
        submittedAt: new Date().toISOString(),
      });
      db.run('UPDATE history SET feedback = ? WHERE id = ?', feedback, id);
      broadcast('history:changed', { id });
      return get(id);
    },
    exportFeedback() {
      const rows = db.all<HistoryRow>("SELECT * FROM history WHERE feedback IS NOT NULL AND feedback <> '' ORDER BY timestamp DESC");
      const target = dialog.showSaveDialogSync({
        title: 'Export model feedback',
        defaultPath: 'murmur-model-feedback.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!target) return null;
      writeFileSync(target, JSON.stringify(rows.map(rowToHistory), null, 2), 'utf8');
      return target;
    },
    clearAll() {
      for (const r of db.all<{ audioPath: string | null }>('SELECT audioPath FROM history')) if (r.audioPath) rmSync(r.audioPath, { force: true });
      db.run('DELETE FROM history');
      broadcast('history:changed', { id: null });
    },
  });
}
