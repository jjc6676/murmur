import { useCallback, useEffect, useState } from 'react';
import type { MemoryDoc, MemoryEvent, MemoryLink, MemoryPerson, MemoryStatus } from '@shared/types';
import { Brain, Clock3, History, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Page, PageHeader, SearchInput, Select, Tabs, TextArea } from '../../ui';
import { toast } from '../state';
import s from '../memory/Memory.module.css';

type MemoryTab = 'documents' | 'search' | 'events' | 'people' | 'links' | 'agents';
const FOLDERS: { id: MemoryDoc['folder']; label: string }[] = [
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'people', label: 'People' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'projects', label: 'Projects' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'other', label: 'Other' },
];

function eventDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString();
}

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
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [people, setPeople] = useState<MemoryPerson[]>([]);
  const [links, setLinks] = useState<MemoryLink[]>([]);
  const refresh = useCallback(async () => {
    const [nextStatus, nextDocs, nextEvents, nextPeople, nextLinks] = await Promise.all([
      api.memory.status(), api.memory.list(), api.memory.events(), api.memory.people(), api.memory.links(),
    ]);
    setStatus(nextStatus);
    setDocs(nextDocs);
    setEvents(nextEvents);
    setPeople(nextPeople);
    setLinks(nextLinks);
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
            <div className={s.agentList}>
              {['Meeting agent · Notetaker meetings', 'Dictation agent · Local dictations', 'Notes agent · Scratchpad notes', 'Dreamer · Nightly tidy-up (1–5 a.m.)'].map((agent) => <span key={agent}>{agent}<Badge tone="success">Available</Badge></span>)}
              {['Email agent · Gmail', 'Slack agent · Slack'].map((agent) => <span key={agent}>{agent}<Badge>Offline only</Badge></span>)}
            </div>
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
        actions={<><Button variant="outline" onClick={() => void api.memory.runDreamer()}>Run Dreamer</Button><Button variant="outline" loading={status?.state === 'running'} onClick={() => void build()}>Refresh memory</Button><Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)}>Delete all memory</Button></>}
      />
      <div className={s.runBar}>
        <span><Badge tone={status?.state === 'running' ? 'orange' : 'success'}>{status?.state === 'running' ? 'Running' : 'Changed memory'}</Badge> Meeting agent · Catch up</span>
        <span>{status?.sources.meetings ?? 0} meetings · {status?.sources.dictations ?? 0} dictations · {status?.sources.notes ?? 0} notes</span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'documents', label: 'Documents' }, { id: 'events', label: 'Events' }, { id: 'people', label: 'People' }, { id: 'links', label: 'Links' }, { id: 'agents', label: 'Agents' }, { id: 'search', label: 'Search' }]} />
      {tab === 'documents' && selected && <div className={s.changeBanner}><strong>{selected.changedBy === 'agent' ? 'An agent changed memory' : selected.changedBy === 'setup' ? 'Setup created memory' : 'You changed memory'}</strong><span>{selected.title}{selected.source ? ` · From ${selected.source}` : ''}</span></div>}
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
      ) : tab === 'search' ? (
        <div className={s.search}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search every document" autoFocus />
          {results.map((result) => <button type="button" className={s.result} key={`${result.docId}-${result.line}`} onClick={() => { const doc = docs.find((item) => item.id === result.docId); if (doc) choose(doc); }}><span>{result.title} · line {result.line}</span><strong>{result.text}</strong></button>)}
          {query && !results.length && <EmptyState icon={<Search size={28} />} title="No matching memory" body={`Nothing matched “${query}”.`} />}
        </div>
      ) : (
        <MemoryCollection tab={tab} events={events} people={people} links={links} status={status} onRunDreamer={() => void api.memory.runDreamer()} />
      )}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Version history" width={800}>
        {selected?.versions.length ? <><label>Version <select value={versionIndex} onChange={(event) => setVersionIndex(Number(event.target.value))}>{selected.versions.map((version, index) => <option value={index} key={version.modifiedAt}>{new Date(version.modifiedAt).toLocaleString()} · {version.changedBy}</option>)}</select></label><div className={s.diff}><div><h3>Removed</h3><pre>{oldVersion?.content.split(/\r?\n/).filter((line) => !selected.content.split(/\r?\n/).includes(line)).map((line) => `- ${line}`).join('\n') || 'No removed lines'}</pre></div><div><h3>Added</h3><pre>{selected.content.split(/\r?\n/).filter((line) => !oldVersion?.content.split(/\r?\n/).includes(line)).map((line) => `+ ${line}`).join('\n') || 'No added lines'}</pre></div></div></> : <EmptyState icon={<Clock3 size={28} />} title="No earlier versions" />}
      </Dialog>
      <ConfirmDialog open={deleteOpen} title="Delete all memory?" body="This stops memory work and permanently removes every generated document and version." confirmLabel="Delete all memory" danger onClose={() => setDeleteOpen(false)} onConfirm={() => void api.memory.deleteAll().then(() => { setDeleteOpen(false); setDocs([]); setSelected(null); void refresh(); })} />
    </Page>
  );
}

function MemoryCollection({
  tab, events, people, links, status, onRunDreamer,
}: {
  tab: Exclude<MemoryTab, 'documents' | 'search'>;
  events: MemoryEvent[];
  people: MemoryPerson[];
  links: MemoryLink[];
  status: MemoryStatus | null;
  onRunDreamer: () => void;
}) {
  const [eventFilter, setEventFilter] = useState('all');
  const visibleEvents = eventFilter === 'all' ? events : events.filter((event) => event.source === eventFilter);
  if (tab === 'events') return <div className={s.collection}>
    <Select ariaLabel="Filter memory events" value={eventFilter} onChange={setEventFilter} options={[{ value: 'all', label: 'All sources' }, ...[...new Set(events.map((event) => event.source))].map((source) => ({ value: source, label: source }))]} />
    {visibleEvents.length ? visibleEvents.map((event) => <article key={event.id}><div><strong>{event.title}</strong><span>{eventDay(event.createdAt)} · {event.source} · {new Date(event.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><p>{event.detail}</p></div><Badge tone={event.status === 'Didn’t finish' ? 'danger' : event.status === 'Running' ? 'orange' : 'success'}>{event.status}</Badge></article>) : <EmptyState icon={<Clock3 size={28} />} title="No matching memory events" body="Runs and local source changes appear newest first." />}
  </div>;
  if (tab === 'people') return <div className={s.collection}>{people.length ? people.map((person) => <article key={person.name}><div><strong>{person.name}</strong><span>Last met {new Date(person.lastMet).toLocaleDateString()}</span><p>{person.meetingCount} meetings · {person.minutes} minutes shared · {person.mentions} transcript mentions</p></div></article>) : <EmptyState title="No people identified yet" body="Speaker names from local meetings will build this index." />}</div>;
  if (tab === 'links') return <div className={s.collection}>{links.length ? links.map((link) => <article key={link.url}><div><a href={link.url} onClick={(event) => { event.preventDefault(); void api.app.openExternal(link.url); }}><strong>{link.host}</strong></a><span>{link.count} shares · {link.sources.join(', ')} · {new Date(link.lastSeen).toLocaleDateString()}</span><p>{link.url}</p></div></article>) : <EmptyState title="No links found" body="URLs in notes, meetings, and dictations appear here, ranked by frequency." />}</div>;
  const agents = [
    ['Meeting agent', 'Reads local Notetaker meetings', 'Available'],
    ['Dictation agent', 'Reads local dictations', 'Available'],
    ['Notes agent', 'Reads Scratchpad notes', 'Available'],
    ['Dreamer', 'Tidies memory nightly between 1–5 a.m.', status?.state === 'running' ? 'Running' : 'Scheduled'],
    ['Email agent', 'Gmail connector', 'Unavailable offline'],
    ['Slack agent', 'Slack connector', 'Unavailable offline'],
  ];
  return <div className={s.collection}>
    {agents.map(([name, detail, state]) => <article key={name}><div><strong>{name}</strong><span>{detail}</span></div><Badge tone={state === 'Running' ? 'orange' : state === 'Available' ? 'success' : 'default'}>{state}</Badge></article>)}
    <div className={s.statusVocabulary} aria-label="Memory run statuses">{['Queued', 'Running', 'Scheduled', 'Waiting', 'Changed memory', 'No changes', 'Skipped', 'Didn’t finish'].map((state) => <Badge key={state}>{state}</Badge>)}</div>
    <Button onClick={onRunDreamer}>Run Dreamer now</Button>
  </div>;
}
