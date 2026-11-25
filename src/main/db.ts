// SQLite storage (node:sqlite, built into Electron's Node). One connection, synchronous, WAL mode.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE history (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    asrText TEXT NOT NULL DEFAULT '',
    formattedText TEXT NOT NULL DEFAULT '',
    pastedText TEXT,
    editedText TEXT,
    status TEXT NOT NULL,
    app TEXT NOT NULL DEFAULT '',
    appTitle TEXT NOT NULL DEFAULT '',
    duration REAL NOT NULL DEFAULT 0,
    speechDuration REAL NOT NULL DEFAULT 0,
    numWords INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en',
    mode TEXT NOT NULL DEFAULT 'ptt',
    cleanupLevel TEXT NOT NULL DEFAULT 'light',
    styleContext TEXT NOT NULL DEFAULT 'other',
    audioPath TEXT,
    hasRevertedAI INTEGER NOT NULL DEFAULT 0,
    isArchived INTEGER NOT NULL DEFAULT 0,
    numDictionaryReplacements INTEGER NOT NULL DEFAULT 0,
    numWordsCorrected INTEGER NOT NULL DEFAULT 0,
    latencyMs INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
  CREATE INDEX history_ts ON history(timestamp);

  CREATE TABLE dictionary (
    id TEXT PRIMARY KEY,
    phrase TEXT NOT NULL,
    replacement TEXT,
    isSnippet INTEGER NOT NULL DEFAULT 0,
    isStarred INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    frequencyUsed INTEGER NOT NULL DEFAULT 0,
    lastUsed TEXT,
    createdAt TEXT NOT NULL,
    modifiedAt TEXT NOT NULL,
    UNIQUE(phrase COLLATE NOCASE, isSnippet)
  );

  CREATE TABLE transform_runs (
    id TEXT PRIMARY KEY,
    transformId TEXT NOT NULL,
    inputText TEXT NOT NULL,
    outputText TEXT NOT NULL,
    app TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    processingMs INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    error TEXT
  );

  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    contentPreview TEXT NOT NULL DEFAULT '',
    searchable TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    isDeleted INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    modifiedAt TEXT NOT NULL
  );

  CREATE TABLE note_versions (
    id TEXT PRIMARY KEY,
    noteId TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    transformName TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE note_images (
    id TEXT PRIMARY KEY,
    noteId TEXT NOT NULL,
    data BLOB NOT NULL,
    contentType TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE todos (
    id TEXT PRIMARY KEY,
    meetingId TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    isArchived INTEGER NOT NULL DEFAULT 0,
    isDeleted INTEGER NOT NULL DEFAULT 0,
    sortOrder REAL NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    modifiedAt TEXT NOT NULL
  );

  CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    endedAt TEXT,
    durationSec REAL NOT NULL DEFAULT 0,
    app TEXT,
    myNotes TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '[]',
    summary TEXT,
    summaryStatus TEXT NOT NULL DEFAULT 'none',
    importSource TEXT,
    isDeleted INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en',
    audioPath TEXT,
    searchable TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE folder_meetings (
    folderId TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    meetingId TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    PRIMARY KEY (folderId, meetingId)
  );

  CREATE TABLE meeting_chat (
    id TEXT PRIMARY KEY,
    meetingId TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'done',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    isRead INTEGER NOT NULL DEFAULT 0,
    isArchived INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL,
    command TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'more',
    scope TEXT NOT NULL DEFAULT 'both',
    builtIn INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    modifiedAt TEXT NOT NULL
  );

  CREATE TABLE memory_docs (
    id TEXT PRIMARY KEY,
    folder TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    changedBy TEXT NOT NULL DEFAULT 'agent',
    versions TEXT NOT NULL DEFAULT '[]',
    modifiedAt TEXT NOT NULL
  );
  `,
];

export type Row = Record<string, SQLInputValue>;

export class Db {
  readonly raw: DatabaseSync;

  constructor(file: string) {
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    this.migrate();
  }

  private migrate(): void {
    const v = Number(this.raw.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    for (let i = v; i < MIGRATIONS.length; i++) {
      this.raw.exec('BEGIN');
      try {
        this.raw.exec(MIGRATIONS[i]);
        this.raw.exec(`PRAGMA user_version = ${i + 1}`);
        this.raw.exec('COMMIT');
      } catch (e) {
        this.raw.exec('ROLLBACK');
        throw e;
      }
    }
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SQLInputValue[]): { changes: number } {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  /** INSERT a row object; keys become columns. */
  insert(table: string, row: Row): void {
    const keys = Object.keys(row);
    this.raw.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k]));
  }

  /** UPDATE by primary key `id`. */
  update(table: string, id: string, patch: Row): void {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    this.raw.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k]), id);
  }

  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN');
    try {
      const r = fn();
      this.raw.exec('COMMIT');
      return r;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  kvGet<T>(key: string, fallback: T): T {
    const r = this.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return r ? (JSON.parse(r.value) as T) : fallback;
  }

  kvSet(key: string, value: unknown): void {
    this.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }

  close(): void {
    this.raw.close();
  }
}

export const newId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();
