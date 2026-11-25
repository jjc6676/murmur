import { useCallback, useEffect, useState } from 'react';
import { Grid2X2, List, Pin, PinOff, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { Note } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Badge, Button, ConfirmDialog, IconButton, Page, PageHeader, Toggle } from '../../ui';
import { toast } from '../state';
import styles from '../scratchpad/ScratchpadPage.module.css';

const relative = (iso: string) => {
  const delta = Math.max(0, Date.now() - new Date(iso).getTime());
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
};

export function ScratchpadPage() {
  const settings = useSettings();
  const patchSettings = usePatchSettings();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const refreshedLabel = (() => {
    if (!refreshedAt) return 'Refresh notes';
    const minutes = Math.floor(Math.max(0, clock - refreshedAt.getTime()) / 60_000);
    return minutes < 1 ? 'Last refreshed just now' : minutes === 1 ? 'Last refreshed 1 minute ago' : minutes < 60 ? `Last refreshed ${minutes} minutes ago` : `Last refreshed ${refreshedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  })();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setNotes(await api.notes.list({ query, limit: 100 }));
      setRefreshedAt(new Date());
      setClock(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => void load(), [load]);
  useEvent('notes:changed', () => void load());

  const newNote = async () => {
    const note = await api.notes.create();
    await api.notes.openScratchpad(note.id);
  };

  const enableShortcut = async () => {
    const combo = await api.settings.recordShortcut();
    if (combo) await api.settings.setShortcut('openScratchpad', [combo]);
  };

  return (
    <Page wide>
      <PageHeader
        title="Scratchpad"
        badge={<Badge>Beta</Badge>}
        actions={
          <div className={styles.headerActions}>
            <span>Add to Flow Bar</span>
            <Toggle checked={settings.scratchpadInFlowBar} label="Add Scratchpad to Flow Bar" onChange={(scratchpadInFlowBar) => void patchSettings({ scratchpadInFlowBar })} />
            <button className={styles.shortcut} onClick={() => void enableShortcut()}>
              {settings.shortcuts.openScratchpad[0] || 'Click to enable shortcut'}
            </button>
            {settings.shortcuts.openScratchpad.length > 0 && <Button size="sm" variant="ghost" onClick={() => void api.settings.setShortcut('openScratchpad', [])}>Disable</Button>}
          </div>
        }
      />
      <section className={styles.hero}>
        <div>
          <h2>For quick thoughts you want to come back to</h2>
          <p>Drop a to-do list, polish a message before you send it, brain dump an idea. Scratchpad is your safe space to save, create, and explore.</p>
          <Button variant="light" onClick={() => void newNote()}>
            Start new note
          </Button>
        </div>
        <div className={styles.heroArt} aria-hidden="true"><span /><span /><span /></div>
      </section>
      <section className={styles.library}>
        <div className={styles.libraryHeader}>
          <h2>Recents</h2>
          <div className={styles.tools}>
            <label className={styles.search}>
              <Search size={16} />
              <input aria-label="Search notes" placeholder="Search notes" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <IconButton label="Refresh notes" title={refreshedLabel} onClick={() => void load()}><RefreshCw size={17} className={refreshing ? styles.spinning : ''} /></IconButton>
            <div className={styles.viewToggle}>
              <IconButton label="Grid view" aria-pressed={settings.notesViewType === 'grid'} onClick={() => void patchSettings({ notesViewType: 'grid' })}><Grid2X2 size={16} /></IconButton>
              <IconButton label="List view" aria-pressed={settings.notesViewType === 'list'} onClick={() => void patchSettings({ notesViewType: 'list' })}><List size={17} /></IconButton>
            </div>
          </div>
        </div>
        {notes.length ? (
          <div className={settings.notesViewType === 'grid' ? styles.grid : styles.list}>
            {notes.map((note) => (
              <article key={note.id} className={styles.noteCard}>
                <button className={styles.noteOpen} onClick={() => void api.notes.openScratchpad(note.id)}>
                  <strong>{note.title}</strong>
                  <p>{note.contentPreview || 'Empty note'}</p>
                  <time>{relative(note.modifiedAt)}</time>
                </button>
                <div className={styles.noteActions}>
                  <IconButton label={note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`} onClick={() => {
                    void api.notes.update(note.id, { pinned: !note.pinned }).catch((error) => toast('Couldn’t update pin', { body: errorMessage(error), tone: 'error' }));
                  }}>
                    {note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </IconButton>
                  <IconButton label={`Delete ${note.title}`} onClick={() => setDeleting(note)}><Trash2 size={15} /></IconButton>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No notes found</div>
        )}
      </section>
      <ConfirmDialog
        open={!!deleting}
        title="Delete note?"
        body="Once deleted it cannot be recovered."
        confirmLabel="Delete note"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const note = deleting;
          setDeleting(null);
          if (!note) return;
          void api.notes.remove(note.id)
            .then(() => toast('Note deleted', { tone: 'success' }))
            .catch((error) => toast('Failed to delete note', { body: errorMessage(error), tone: 'error' }));
        }}
      />
    </Page>
  );
}
