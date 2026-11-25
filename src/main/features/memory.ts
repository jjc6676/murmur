// Inspectable local memory documents generated from meetings, dictations, and notes.
import type { MemoryDoc, MemoryStatus, TranscriptSegment } from '@shared/types';
import { getCtx } from '../context';
import { newId, nowIso } from '../db';
import { broadcast, handle } from '../ipc';

interface MemoryRow {
  id: string;
  folder: MemoryDoc['folder'];
  title: string;
  content: string;
  source: string;
  changedBy: MemoryDoc['changedBy'];
  versions: string;
  modifiedAt: string;
}

const idleStatus: MemoryStatus = {
  state: 'idle',
  lastRunAt: null,
  docCount: 0,
  sources: { meetings: 0, dictations: 0, notes: 0 },
  error: null,
};
let memoryBuilding = false;
let memoryGeneration = 0;

function addEvent(source: string, title: string, status: string, detail = ''): void {
  getCtx().db.insert('memory_events', { id: newId(), source, title, detail, status, createdAt: nowIso() });
}

function rowToDoc(row: MemoryRow): MemoryDoc {
  try {
    return { ...row, versions: JSON.parse(row.versions) as MemoryDoc['versions'] };
  } catch {
    return { ...row, versions: [] };
  }
}

function parseTranscript(value: string): TranscriptSegment[] {
  try {
    return JSON.parse(value) as TranscriptSegment[];
  } catch {
    return [];
  }
}

function getStatus(): MemoryStatus {
  const stored = getCtx().db.kvGet<MemoryStatus>('memoryStatus', idleStatus);
  return {
    ...stored,
    state: stored.state === 'running' && !memoryBuilding ? 'idle' : stored.state,
    docCount: getCtx().db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memory_docs')?.count ?? 0,
  };
}

function setStatus(status: MemoryStatus): void {
  getCtx().db.kvSet('memoryStatus', status);
  broadcast('memory:status', status);
}

async function buildMemory(reason = 'Catch up'): Promise<void> {
  const { db } = getCtx();
  const generation = memoryGeneration;
  const meetings = db.all<{ title: string; createdAt: string; transcript: string; summary: string | null }>(
    'SELECT title, createdAt, transcript, summary FROM meetings WHERE isDeleted = 0 ORDER BY createdAt DESC LIMIT 100',
  );
  const dictations = db.all<{ timestamp: string; asrText: string; formattedText: string; app: string }>(
    "SELECT timestamp, asrText, formattedText, app FROM history WHERE status IN ('success', 'raw') ORDER BY timestamp DESC LIMIT 300",
  );
  const notes = db.all<{ title: string; content: string; modifiedAt: string }>(
    'SELECT title, content, modifiedAt FROM notes WHERE isDeleted = 0 ORDER BY modifiedAt DESC LIMIT 100',
  );
  const sources = { meetings: meetings.length, dictations: dictations.length, notes: notes.length };
  setStatus({ state: 'running', lastRunAt: null, docCount: 0, sources, error: null });
  try {
    const meetingText = meetings.map((meeting) => {
      const transcript = parseTranscript(meeting.transcript);
      return `${meeting.createdAt} ${meeting.title}\n${meeting.summary ?? ''}\n${transcript.map((segment) => segment.text).join(' ')}`;
    }).join('\n\n');
    const dictationText = dictations.map((entry) => `${entry.timestamp} [${entry.app}] ${entry.formattedText || entry.asrText}`).join('\n');
    const noteText = notes.map((note) => `${note.modifiedAt} ${note.title}\n${note.content}`).join('\n\n');
    const sourceText = `MEETINGS\n${meetingText}\n\nDICTATIONS\n${dictationText}\n\nNOTES\n${noteText}`.slice(0, 60_000);
    const synthesis = await getCtx().llm({
      system: 'Synthesize durable, factual local memory from these sources. Use concise Markdown bullets. Do not invent details.',
      input: sourceText || 'No local sources yet. Create a clean starter memory structure.',
    });
    const timestamp = nowIso();
    const docs: { folder: MemoryDoc['folder']; title: string; content: string; source: string }[] = [
      { folder: 'knowledge', title: 'Knowledge', content: `# Knowledge\n\n${synthesis}`, source: 'Meetings, dictations, and notes' },
      { folder: 'people', title: 'People', content: `# People\n\n${meetingText ? 'People and collaborators mentioned in recent meetings are summarized from local context.' : 'No people have been identified yet.'}`, source: 'Recent meetings' },
      { folder: 'preferences', title: 'Preferences', content: `# Preferences\n\n${noteText ? 'Preferences inferred from recurring choices in your local notes and conversations.' : 'No preferences have been identified yet.'}`, source: 'Notes and meetings' },
      { folder: 'preferences', title: 'Dictation writing style', content: `# Dictation writing style\n\n${dictationText ? synthesis : 'Start dictating to build a local writing-style profile.'}`, source: 'Dictation' },
      { folder: 'projects', title: 'Projects', content: `# Projects\n\n${meetingText || noteText ? synthesis : 'No active projects have been identified yet.'}`, source: 'Meetings and notes' },
      { folder: 'timeline', title: 'Timeline', content: `# Timeline\n\n${[...meetings.map((x) => `- ${x.createdAt.slice(0, 10)} — ${x.title}`), ...notes.map((x) => `- ${x.modifiedAt.slice(0, 10)} — ${x.title}`)].slice(0, 50).join('\n') || '- Memory initialized'}`, source: 'Local activity' },
    ];
    if (generation !== memoryGeneration) return;
    db.tx(() => {
      for (const doc of docs) {
        const existing = db.get<MemoryRow>('SELECT * FROM memory_docs WHERE folder = ? AND title = ?', doc.folder, doc.title);
        if (existing) {
          const versions = rowToDoc(existing).versions;
          versions.unshift({ content: existing.content, modifiedAt: existing.modifiedAt, changedBy: existing.changedBy });
          db.update('memory_docs', existing.id, { ...doc, changedBy: 'agent', versions: JSON.stringify(versions.slice(0, 20)), modifiedAt: timestamp });
        } else {
          db.insert('memory_docs', { id: newId(), ...doc, changedBy: 'setup', versions: '[]', modifiedAt: timestamp });
        }
      }
    });
    addEvent('Local sources', reason, 'Changed memory', `${sources.meetings} meetings · ${sources.dictations} dictations · ${sources.notes} notes`);
    memoryBuilding = false;
    setStatus({ state: 'idle', lastRunAt: timestamp, docCount: docs.length, sources, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    memoryBuilding = false;
    setStatus({ state: 'failed', lastRunAt: null, docCount: db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memory_docs')?.count ?? 0, sources, error: message });
  }
}

function scheduleDreamer(): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const timer = setTimeout(() => {
    if (!memoryBuilding) {
      memoryBuilding = true;
      addEvent('Dreamer', 'Nightly tidy-up', 'Running');
      void buildMemory('Nightly tidy-up').finally(() => scheduleDreamer());
    } else {
      scheduleDreamer();
    }
  }, next.getTime() - now.getTime());
  timer.unref();
}

export function registerMemory(): void {
  const { db } = getCtx();
  handle('memory', {
    status: getStatus,
    build() {
      const current = getStatus();
      if (memoryBuilding || current.state === 'running') return current;
      memoryBuilding = true;
      const status = { ...current, state: 'running' as const, error: null };
      setStatus(status);
      void buildMemory();
      return status;
    },
    runDreamer() {
      const current = getStatus();
      if (memoryBuilding) return current;
      memoryBuilding = true;
      const status = { ...current, state: 'running' as const, error: null };
      setStatus(status);
      addEvent('Dreamer', 'Nightly tidy-up', 'Running');
      void buildMemory('Nightly tidy-up');
      return status;
    },
    list: () => db.all<MemoryRow>('SELECT * FROM memory_docs ORDER BY folder, title COLLATE NOCASE').map(rowToDoc),
    get(id) {
      const row = db.get<MemoryRow>('SELECT * FROM memory_docs WHERE id = ?', id);
      return row ? rowToDoc(row) : null;
    },
    save(id, content) {
      const row = db.get<MemoryRow>('SELECT * FROM memory_docs WHERE id = ?', id);
      if (!row) throw new Error('Memory document not found');
      const versions = rowToDoc(row).versions;
      versions.unshift({ content: row.content, modifiedAt: row.modifiedAt, changedBy: row.changedBy });
      db.update('memory_docs', id, { content, changedBy: 'user', versions: JSON.stringify(versions.slice(0, 20)), modifiedAt: nowIso() });
      addEvent('You', `Edited ${row.title}`, 'Changed memory', row.source);
      return rowToDoc(db.get<MemoryRow>('SELECT * FROM memory_docs WHERE id = ?', id)!);
    },
    search(query) {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return [];
      return db.all<MemoryRow>('SELECT * FROM memory_docs ORDER BY title').flatMap((row) =>
        row.content.split(/\r?\n/).flatMap((text, index) =>
          text.toLocaleLowerCase().includes(needle) ? [{ docId: row.id, title: row.title, line: index + 1, text }] : [],
        ),
      );
    },
    addFact(text, source) {
      const clean = text.trim();
      if (!clean) throw new Error('Memory fact cannot be empty');
      const existing = db.get<MemoryRow>("SELECT * FROM memory_docs WHERE folder = 'knowledge' AND title = 'Saved facts'");
      const timestamp = nowIso();
      if (existing) {
        const versions = rowToDoc(existing).versions;
        versions.unshift({ content: existing.content, modifiedAt: existing.modifiedAt, changedBy: existing.changedBy });
        db.update('memory_docs', existing.id, {
          content: `${existing.content}\n- ${clean}`,
          source: source.trim() || 'Local action',
          changedBy: 'user',
          versions: JSON.stringify(versions.slice(0, 20)),
          modifiedAt: timestamp,
        });
      } else {
        db.insert('memory_docs', {
          id: newId(), folder: 'knowledge', title: 'Saved facts', content: `# Saved facts\n\n- ${clean}`,
          source: source.trim() || 'Local action', changedBy: 'user', versions: '[]', modifiedAt: timestamp,
        });
      }
      addEvent(source.trim() || 'Local action', 'Saved a fact', 'Changed memory', clean);
      const row = db.get<MemoryRow>("SELECT * FROM memory_docs WHERE folder = 'knowledge' AND title = 'Saved facts'")!;
      return rowToDoc(row);
    },
    deleteAll() {
      memoryGeneration += 1;
      memoryBuilding = false;
      db.run('DELETE FROM memory_docs');
      db.run('DELETE FROM memory_events');
      const status = { ...idleStatus };
      setStatus(status);
    },
  });
  scheduleDreamer();
}
