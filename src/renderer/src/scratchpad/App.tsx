import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Clock3, Copy, Eye, History, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Pilcrow, Pin, PinOff, Plus, RefreshCw, Send, Sparkles, Trash2, X } from 'lucide-react';
import type { Note, NoteVersion } from '@shared/types';
import { api, errorMessage, useEvent } from '../lib/api';
import { useSettings } from '../lib/settings';
import { ConfirmDialog, Kbd } from '../ui';
import { RichEditor } from './RichEditor';
import styles from './Scratchpad.module.css';

interface Tab { id: string; note: Note }

const VERSION_LABEL: Record<NoteVersion['source'], string> = {
  created: 'Created', dictated: 'Dictated', typed: 'Typed edits', transform: 'Transform', custom_transform: 'Custom transform',
};

export function App() {
  const settings = useSettings();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [noteLimit, setNoteLimit] = useState(30);
  const [sidebar, setSidebar] = useState(false);
  const [compact, setCompact] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [transformOpen, setTransformOpen] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [transforming, setTransforming] = useState(false);
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [formatting, setFormatting] = useState(true);
  const [preview, setPreview] = useState(false);
  const [activeAppName, setActiveAppName] = useState('active app');
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<{ noteId: string; patch: { title?: string; content?: string } } | null>(null);
  const active = tabs.find((tab) => tab.id === activeId)?.note ?? null;

  const loadNotes = useCallback(async () => setNotes(await api.notes.list({ query: search, limit: noteLimit })), [noteLimit, search]);
  useEffect(() => void loadNotes(), [loadNotes]);
  useEffect(() => { void api.notes.sendTarget().then((app) => setActiveAppName(app || 'active app')); }, []);
  useEvent('notes:changed', ({ id }) => {
    void loadNotes();
    if (id && tabs.some((tab) => tab.id === id)) void api.notes.get(id).then((note) => note && setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, note } : tab)));
  });

  const open = useCallback(async (id: string) => {
    const note = await api.notes.get(id);
    if (!note) return;
    setTabs((current) => current.some((tab) => tab.id === id) ? current : [...current, { id, note }]);
    setActiveId(id);
  }, []);
  useEvent('scratchpad:open', ({ noteId }) => { if (noteId) void open(noteId); });

  useEffect(() => {
    if (!activeId && notes[0]) void open(notes[0].id);
  }, [activeId, notes, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key.toLowerCase() === 't') { event.preventDefault(); void api.notes.create().then((note) => open(note.id)); }
      if (event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(activeId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!activeId) return;
    if (historyOpen) {
      setVersionsLoading(true);
      void api.notes.versions(activeId).then(setVersions).finally(() => setVersionsLoading(false));
    }
    if (transformOpen) void api.notes.suggestions(activeId).then(setSuggestions);
  }, [activeId, historyOpen, transformOpen]);

  function closeTab(id: string | null) {
    if (!id) return;
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== id);
      if (id === activeId) setActiveId(next.at(-1)?.id ?? null);
      return next;
    });
  }
  const create = async () => open((await api.notes.create()).id);
  const updateLocal = (patch: Partial<Note>) => setTabs((current) => current.map((tab) => tab.id === activeId ? { ...tab, note: { ...tab.note, ...patch } } : tab));
  const save = (patch: { title?: string; content?: string }, source: 'typed' | 'dictated' = 'typed') => {
    if (!active) return;
    updateLocal(patch);
    if (source === 'dictated') {
      void api.notes.update(active.id, patch, 'dictated');
      return;
    }
    if (pendingSave.current && pendingSave.current.noteId !== active.id) {
      void api.notes.update(pendingSave.current.noteId, pendingSave.current.patch, 'typed');
      pendingSave.current = null;
    }
    pendingSave.current = { noteId: active.id, patch: { ...pendingSave.current?.patch, ...patch } };
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const pending = pendingSave.current;
      pendingSave.current = null;
      if (pending) void api.notes.update(pending.noteId, pending.patch, 'typed');
    }, 450);
  };
  const showToast = (message: string) => { setToast(message); setTimeout(() => setToast(''), 1800); };
  const copy = async () => { if (active) { await api.app.copyText(active.contentPreview); showToast('Copied to clipboard'); } };
  const regenerate = async () => { if (active) setSuggestions(await api.notes.suggestions(active.id)); };
  const transform = async (instruction: string) => {
    if (!active || !instruction.trim()) return;
    setTransforming(true);
    try {
      const note = await api.notes.transform(active.id, instruction);
      updateLocal(note);
      setPrompt('');
      setVersions(await api.notes.versions(active.id));
      setTransformOpen(false);
      setHistoryOpen(true);
    } catch (error) {
      showToast(`Transform failed: ${errorMessage(error)}`);
    } finally {
      setTransforming(false);
    }
  };

  return <main className={`${styles.window} ${compact ? styles.compact : ''}`}>
    <header className={`${styles.titlebar} drag`}>
      <button className="no-drag" aria-label={sidebar ? 'Collapse Notes' : 'Expand Notes'} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>
      <strong>Scratchpad</strong>
      <div className={styles.windowButtons}>
        <button className="no-drag" aria-label={compact ? 'Expand window' : 'Compact window'} onClick={() => { setCompact(!compact); void api.app.toggleMaximizeWindow(); }}>{compact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}</button>
        <button className="no-drag" aria-label="Close" onClick={() => void api.app.closeWindow()}><X size={17} /></button>
      </div>
    </header>
    <div className={styles.tabs} role="tablist" aria-label="Open notes">
      <div className={styles.tabScroll}>
        {tabs.map((tab) => <button role="tab" aria-selected={tab.id === activeId} className={tab.id === activeId ? styles.activeTab : ''} key={tab.id} onClick={() => setActiveId(tab.id)}><span>{tab.note.title}</span><X size={13} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} /></button>)}
      </div>
      <button aria-label="New tab (Ctrl+T)" title="New tab (Ctrl+T)" onClick={() => void create()}><Plus size={16} /></button>
    </div>
    <div className={styles.workspace}>
      {sidebar && <aside className={styles.sidebar}>
        <div className={styles.sideHead}><strong>Notes</strong><button aria-label="New note" onClick={() => void create()}><Plus size={16} /></button></div>
        <label className={styles.sideSearch}><input aria-label="Search notes" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={13} /></button>}</label>
        <div className={styles.sideLabel}>Recents</div>
        <div className={styles.noteList}>{notes.map((note) => <button key={note.id} className={note.id === activeId ? styles.currentNote : ''} onClick={() => void open(note.id)}><strong>{note.title}</strong><span>{note.contentPreview || 'Empty note'}</span>{note.pinned && <Pin size={11} />}</button>)}</div>
        {notes.length >= noteLimit && <button className={styles.loadMore} onClick={() => setNoteLimit((current) => current + 30)}>Load more</button>}
        {!notes.length && <p className={styles.noNotes}>{search ? 'No matching notes.' : 'No notes yet.'}</p>}
      </aside>}
      <section className={styles.document}>
        {active ? <>
          <div className={styles.noteHeader}>
            <input aria-label="Note title" value={active.title === 'Untitled' ? '' : active.title} placeholder="Untitled" onChange={(e) => save({ title: e.target.value })} />
            <button aria-label={active.pinned ? 'Unpin note' : 'Pin note'} onClick={() => void api.notes.update(active.id, { pinned: !active.pinned })}>{active.pinned ? <PinOff size={17} /> : <Pin size={17} />}</button>
          </div>
          {preview
            ? <div className={styles.messagePreview} aria-label="Message preview"><div>{active.contentPreview || 'Your message preview will appear here.'}</div></div>
            : <RichEditor noteId={active.id} html={active.content} showFormatting={formatting} onChange={(content, source) => save({ content }, source)} />}
          <footer className={styles.footer}>
            <div className={styles.dictate}><Kbd combo={settings.shortcuts.ptt.join('+') || 'PTT'} /> to dictate</div>
            <button onClick={() => void copy()}><Copy size={15} /> Copy</button>
            <button aria-pressed={formatting} onClick={() => setFormatting((visible) => !visible)}><Pilcrow size={15} /> Formatting</button>
            <button aria-pressed={preview} onClick={() => setPreview((visible) => !visible)}><Eye size={15} /> Preview</button>
            <button aria-pressed={transformOpen} onClick={() => { setTransformOpen(!transformOpen); setHistoryOpen(false); }}><Sparkles size={15} /> Transforms</button>
            <button aria-pressed={historyOpen} onClick={() => { setHistoryOpen(!historyOpen); setTransformOpen(false); }}><History size={15} /> History</button>
            <button className={styles.send} onClick={async () => {
              const target = await api.notes.sendToApp(active.id);
              if (target) showToast(`Sent in ${target.app}`);
              else showToast('Couldn’t find an active app');
            }}><Send size={15} /> Send in {activeAppName}</button>
          </footer>
        </> : <div className={styles.blank}><h2>No note open</h2><button onClick={() => void create()}>New note</button></div>}
      </section>
      {(transformOpen || historyOpen) && active && <aside className={styles.panel}>
        <div className={styles.panelHead}><strong>{transformOpen ? 'Transforms' : 'Version history'}</strong><button aria-label="Close panel" onClick={() => { setTransformOpen(false); setHistoryOpen(false); }}><X size={16} /></button></div>
        {transformOpen ? <>
          <form className={styles.prompt} onSubmit={(e) => { e.preventDefault(); void transform(prompt); }}><textarea aria-label="Transform prompt" placeholder="Follow up or ask a question" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void transform(prompt); } }} /><button disabled={transforming || !prompt.trim()}><Send size={15} /></button></form>
          <div className={styles.suggestionHead}><span>Suggestions</span><button aria-label="Regenerate suggestions" onClick={() => void regenerate()}><RefreshCw size={14} /></button></div>
          <div className={styles.chips}>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void transform(suggestion)}>{suggestion}</button>)}</div>
        </> : <div className={styles.versionList}>{versionsLoading ? <p>Loading versions…</p> : versions.length === 0 ? <p>No versions yet.</p> : versions.map((version) => <button key={version.id} onClick={async () => { const note = await api.notes.restoreVersion(version.id); updateLocal(note); }}><Clock3 size={14} /><span><strong>{VERSION_LABEL[version.source]}</strong>{version.transformName && <small>{version.transformName}</small>}<time>{new Date(version.createdAt).toLocaleString()}</time></span><ChevronRight size={14} /></button>)}</div>}
        <button className={styles.deleteNote} onClick={() => setDeleting(true)}><Trash2 size={15} /> Delete note</button>
      </aside>}
    </div>
    {toast && <div className={styles.toast} role="status">{toast}</div>}
    <ConfirmDialog open={deleting} title="Delete note?" body="Once deleted it cannot be recovered." confirmLabel="Delete note" danger onClose={() => setDeleting(false)} onConfirm={() => {
      if (!active) return setDeleting(false);
      const id = active.id;
      void api.notes.remove(id).then(() => {
        closeTab(id);
        showToast('Note deleted');
      }).catch((error) => showToast(`Failed to delete note: ${errorMessage(error)}`));
      setDeleting(false);
    }} />
  </main>;
}
