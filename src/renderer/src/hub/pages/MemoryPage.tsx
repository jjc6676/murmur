import { useCallback, useEffect, useState } from 'react';
import type { MemoryDoc, MemoryStatus } from '@shared/types';
import { Brain, Clock3, History, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Page, PageHeader, SearchInput, Tabs, TextArea } from '../../ui';
import { toast } from '../state';
import s from '../memory/Memory.module.css';

type MemoryTab = 'documents' | 'search';
const FOLDERS: { id: MemoryDoc['folder']; label: string }[] = [
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'people', label: 'People' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'projects', label: 'Projects' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'other', label: 'Other' },
];

export function MemoryPage() {
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [docs, setDocs] = useState<MemoryDoc[]>([]);
  const [selected, setSelected] = useState<MemoryDoc | null>(null);
  const [tab, setTab] = useState<MemoryTab>('documents');
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ docId: string; title: string; line: number; text: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionIndex, setVersionIndex] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const refresh = useCallback(async () => {
    const [nextStatus, nextDocs] = await Promise.all([api.memory.status(), api.memory.list()]);
    setStatus(nextStatus);
    setDocs(nextDocs);
    setSelected((current) => nextDocs.find((doc) => doc.id === current?.id) ?? current ?? nextDocs[0] ?? null);
  }, []);
  useEffect(() => void refresh(), [refresh]);
  useEvent('memory:status', (nextStatus) => {
    setStatus(nextStatus);
    if (nextStatus.state !== 'running') void refresh();
  });
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    void api.memory.search(query).then(setResults);
  }, [query]);
  const build = async () => {
    try {
      setStatus(await api.memory.build());
    } catch (error) {
      toast('Couldn’t build memory', { body: errorMessage(error), tone: 'error' });
    }
  };
  const save = async () => {
    if (!selected) return;
    try {
      const saved = await api.memory.save(selected.id, content);
      setSelected(saved);
      setDocs((current) => current.map((doc) => doc.id === saved.id ? saved : doc));
      setEditing(false);
      toast('Memory document saved', { tone: 'success' });
    } catch (error) {
      toast('Couldn’t save memory document', { body: errorMessage(error), tone: 'error' });
    }
  };
  const choose = (doc: MemoryDoc) => {
    setSelected(doc);
    setEditing(false);
    setContent(doc.content);
    setTab('documents');
  };
  if (status && !docs.length && !status.lastRunAt && status.state !== 'running') {
    return (
      <Page>
        <div className={s.start}>
          <div className={s.startInner}>
            <Brain size={42} />
            <h2>Build your memory</h2>
            <p>Murmur reads recent local meetings, dictations, and notes to build documents you can inspect and edit.</p>
            <p className={s.meta}><ShieldCheck size={14} /> Everything stays on this device.</p>
            <Button onClick={() => void build()}>Start</Button>
          </div>
        </div>
      </Page>
    );
  }
  const oldVersion = selected?.versions[versionIndex];
  return (
    <Page wide>
      <PageHeader
        title="Memory"
        badge={<span className={s.status}>{status?.state === 'running' ? <Badge tone="orange">Running</Badge> : status?.state === 'failed' ? <Badge tone="danger">Didn’t finish</Badge> : <Badge tone="success">Up to date</Badge>}</span>}
        actions={<><Button variant="outline" loading={status?.state === 'running'} onClick={() => void build()}>Refresh memory</Button><Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)}>Delete all memory</Button></>}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'documents', label: 'Documents' }, { id: 'search', label: 'Search' }]} />
      {tab === 'documents' ? (
        <div className={s.workspace}>
          <aside className={s.tree}>
            {FOLDERS.map((folder) => {
              const folderDocs = docs.filter((doc) => doc.folder === folder.id);
              return folderDocs.length ? <section className={s.folder} key={folder.id}><h3>{folder.label}</h3>{folderDocs.map((doc) => <button key={doc.id} type="button" className={s.docButton} data-active={selected?.id === doc.id} onClick={() => choose(doc)}>{doc.title}</button>)}</section> : null;
            })}
          </aside>
          <article className={s.viewer}>
            {selected ? <><header className={s.viewerHeader}><div><h2>{selected.title}</h2><p className={s.meta}>Changed by {selected.changedBy} · {new Date(selected.modifiedAt).toLocaleString()} · {selected.source}</p></div><div className={s.actions}>{selected.versions.length > 0 && <Button variant="ghost" icon={<History size={15} />} onClick={() => setHistoryOpen(true)}>History</Button>}{editing ? <><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={() => void save()}>Save</Button></> : <Button variant="outline" onClick={() => { setContent(selected.content); setEditing(true); }}>Edit</Button>}</div></header>{editing ? <TextArea className={s.editor} value={content} onChange={(event) => setContent(event.target.value)} /> : <div className={s.markdown}>{selected.content}</div>}</> : <EmptyState title="Choose a document" />}
          </article>
        </div>
      ) : (
        <div className={s.search}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search every document" autoFocus />
          {results.map((result) => <button type="button" className={s.result} key={`${result.docId}-${result.line}`} onClick={() => { const doc = docs.find((item) => item.id === result.docId); if (doc) choose(doc); }}><span>{result.title} · line {result.line}</span><strong>{result.text}</strong></button>)}
          {query && !results.length && <EmptyState icon={<Search size={28} />} title="No matching memory" body={`Nothing matched “${query}”.`} />}
        </div>
      )}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Version history" width={800}>
        {selected?.versions.length ? <><label>Version <select value={versionIndex} onChange={(event) => setVersionIndex(Number(event.target.value))}>{selected.versions.map((version, index) => <option value={index} key={version.modifiedAt}>{new Date(version.modifiedAt).toLocaleString()} · {version.changedBy}</option>)}</select></label><div className={s.diff}><div><h3>Removed</h3><pre>{oldVersion?.content.split(/\r?\n/).filter((line) => !selected.content.split(/\r?\n/).includes(line)).map((line) => `- ${line}`).join('\n') || 'No removed lines'}</pre></div><div><h3>Added</h3><pre>{selected.content.split(/\r?\n/).filter((line) => !oldVersion?.content.split(/\r?\n/).includes(line)).map((line) => `+ ${line}`).join('\n') || 'No added lines'}</pre></div></div></> : <EmptyState icon={<Clock3 size={28} />} title="No earlier versions" />}
      </Dialog>
      <ConfirmDialog open={deleteOpen} title="Delete all memory?" body="This stops memory work and permanently removes every generated document and version." confirmLabel="Delete all memory" danger onClose={() => setDeleteOpen(false)} onConfirm={() => void api.memory.deleteAll().then(() => { setDeleteOpen(false); setDocs([]); setSelected(null); void refresh(); })} />
    </Page>
  );
}
