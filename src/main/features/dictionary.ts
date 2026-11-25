// Dictionary words / correction rules and Snippets (same table, `isSnippet` flag).
import type { DictionaryEntry } from '@shared/types';
import { getCtx } from '../context';
import { broadcast, handle } from '../ipc';
import { newId, nowIso } from '../db';

export const MAX_SNIPPET_CHARS = 4000;

interface DictRow {
  id: string;
  phrase: string;
  replacement: string | null;
  isSnippet: number;
  isStarred: number;
  source: DictionaryEntry['source'];
  frequencyUsed: number;
  lastUsed: string | null;
  createdAt: string;
  modifiedAt: string;
}

const toEntry = (r: DictRow): DictionaryEntry => ({ ...r, isSnippet: !!r.isSnippet, isStarred: !!r.isStarred });

const ORDER: Record<string, string> = {
  newest: 'createdAt DESC',
  oldest: 'createdAt ASC',
  alpha: 'phrase COLLATE NOCASE ASC',
  starred: 'isStarred DESC, createdAt DESC',
};

/** Simple similarity: same letters ignoring case/punctuation, or one contains the other. */
function similarTrigger(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const x = n(a);
  const y = n(b);
  return x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)));
}

export function addEntry(e: { phrase: string; replacement?: string | null; isSnippet: boolean; source?: DictionaryEntry['source'] }): { entry: DictionaryEntry; warning: string | null } {
  const { db } = getCtx();
  const phrase = e.phrase.trim();
  const replacement = e.replacement?.trim() || null;
  if (!phrase) throw new Error(e.isSnippet ? 'Snippet is required' : 'Word cannot be empty');
  if (e.isSnippet && !replacement) throw new Error('Expansion is required');
  if (replacement && replacement.length > MAX_SNIPPET_CHARS) throw new Error(`Expansion must be ${MAX_SNIPPET_CHARS} characters or fewer`);
  const dup = db.get<DictRow>('SELECT * FROM dictionary WHERE phrase = ? COLLATE NOCASE AND isSnippet = ?', phrase, e.isSnippet ? 1 : 0);
  if (dup) throw new Error(e.isSnippet ? `A snippet for "${phrase}" already exists` : `"${phrase}" is already in your dictionary`);
  let warning: string | null = null;
  if (e.isSnippet) {
    const others = db.all<{ phrase: string }>('SELECT phrase FROM dictionary WHERE isSnippet = 1');
    const near = others.find((o) => similarTrigger(o.phrase, phrase));
    if (near) warning = `"${phrase}" is similar to your snippet "${near.phrase}". Use distinct phrases so the right one expands.`;
  }
  const ts = nowIso();
  const row: DictRow = { id: newId(), phrase, replacement, isSnippet: e.isSnippet ? 1 : 0, isStarred: 0, source: e.source ?? 'manual', frequencyUsed: 0, lastUsed: null, createdAt: ts, modifiedAt: ts };
  db.insert('dictionary', { ...row });
  broadcast('dictionary:changed', null);
  return { entry: toEntry(row), warning };
}

export function registerDictionary(): void {
  const { db } = getCtx();
  handle('dictionary', {
    list({ snippets, query, sort = 'newest' }) {
      const params: (string | number)[] = [snippets ? 1 : 0];
      let where = 'isSnippet = ?';
      if (query?.trim()) {
        where += ' AND (phrase LIKE ? OR replacement LIKE ?)';
        params.push(`%${query.trim()}%`, `%${query.trim()}%`);
      }
      return db.all<DictRow>(`SELECT * FROM dictionary WHERE ${where} ORDER BY ${ORDER[sort] ?? ORDER.newest}`, ...params).map(toEntry);
    },
    add: (e) => addEntry(e),
    update(id, patch) {
      const cur = db.get<DictRow>('SELECT * FROM dictionary WHERE id = ?', id);
      if (!cur) throw new Error('Entry not found');
      const phrase = patch.phrase !== undefined ? patch.phrase.trim() : cur.phrase;
      const replacement = patch.replacement !== undefined ? patch.replacement?.trim() || null : cur.replacement;
      if (!phrase) throw new Error(cur.isSnippet ? 'Snippet is required' : 'Word cannot be empty');
      if (cur.isSnippet && !replacement) throw new Error('Expansion is required');
      if (replacement && replacement.length > MAX_SNIPPET_CHARS) throw new Error(`Expansion must be ${MAX_SNIPPET_CHARS} characters or fewer`);
      const changed = phrase !== cur.phrase || replacement !== cur.replacement || (patch.isStarred !== undefined && !!cur.isStarred !== patch.isStarred);
      if (!changed) throw new Error('No changes made');
      if (phrase.toLowerCase() !== cur.phrase.toLowerCase()) {
        const dup = db.get<DictRow>('SELECT id FROM dictionary WHERE phrase = ? COLLATE NOCASE AND isSnippet = ? AND id != ?', phrase, cur.isSnippet, id);
        if (dup) throw new Error(`"${phrase}" already exists`);
      }
      db.update('dictionary', id, { phrase, replacement, isStarred: patch.isStarred === undefined ? cur.isStarred : patch.isStarred ? 1 : 0, modifiedAt: nowIso() });
      broadcast('dictionary:changed', null);
      let warning: string | null = null;
      if (cur.isSnippet && phrase !== cur.phrase) {
        const near = db.all<{ phrase: string }>('SELECT phrase FROM dictionary WHERE isSnippet = 1 AND id != ?', id).find((o) => similarTrigger(o.phrase, phrase));
        if (near) warning = `"${phrase}" is similar to your snippet "${near.phrase}".`;
      }
      return { entry: toEntry(db.get<DictRow>('SELECT * FROM dictionary WHERE id = ?', id) as DictRow), warning };
    },
    remove(ids) {
      db.tx(() => ids.forEach((id) => db.run('DELETE FROM dictionary WHERE id = ?', id)));
      broadcast('dictionary:changed', null);
    },
    counts() {
      const r = db.get<{ w: number; s: number }>('SELECT SUM(isSnippet = 0) AS w, SUM(isSnippet = 1) AS s FROM dictionary');
      return { words: r?.w ?? 0, snippets: r?.s ?? 0 };
    },
  });
}
