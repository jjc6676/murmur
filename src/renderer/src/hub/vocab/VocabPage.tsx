import { useCallback, useEffect, useState } from 'react';
import { ArrowDownAZ, Pencil, RefreshCw, Sparkles, Star, Trash2 } from 'lucide-react';
import type { DictionaryEntry, DictionarySort } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { toast } from '../state';
import { Banner, Button, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, Menu, Page, PageHeader, SearchInput, Tabs, TextArea, Toggle, cx } from '../../ui';
import styles from './vocab.module.css';

type Scope = 'all' | 'personal' | 'team';
type EditorValue = DictionaryEntry | { preset: string } | 'new';

const SORTS: { value: DictionarySort; label: string }[] = [
  { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' },
  { value: 'alpha', label: 'Alphabetical A–Z' }, { value: 'starred', label: 'Starred first' },
];

export function VocabPage({ snippets }: { snippets: boolean }) {
  const settings = useSettings();
  const patchSettings = usePatchSettings();
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorValue | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [hero, setHero] = useState(!settings.dismissedBanners.includes(snippets ? 'snippets-hero' : 'dictionary-hero'));

  const load = useCallback(async () => {
    setEntries(await api.dictionary.list({ snippets, query, sort: settings.dictionarySort }));
  }, [query, settings.dictionarySort, snippets]);
  useEffect(() => { void load(); }, [load]);
  useEvent('dictionary:changed', () => void load());

  async function importEntries() {
    const path = await api.app.pickFile([{ name: 'Vocabulary files', extensions: ['txt', 'csv', 'json'] }]);
    if (!path) return;
    try {
      const result = await api.app.importFile(snippets ? 'snippets' : 'dictionary', path);
      await load();
      toast(`Imported ${result.imported} ${snippets ? 'snippets' : 'entries'}`, { body: `${result.skipped} skipped`, tone: 'success' });
    } catch (error) { toast('Import failed', { body: errorMessage(error), tone: 'error' }); }
  }

  async function remove(ids: string[]) {
    try { await api.dictionary.remove(ids); setSelected([]); await load(); toast(`${ids.length} ${snippets ? 'snippet' : 'word'}${ids.length === 1 ? '' : 's'} deleted`, { tone: 'success' }); }
    catch (error) { toast('Could not delete', { body: errorMessage(error), tone: 'error' }); }
  }

  async function setSort(sort: DictionarySort) { await patchSettings({ dictionarySort: sort }); }
  async function dismissHero() {
    const id = snippets ? 'snippets-hero' : 'dictionary-hero';
    setHero(false);
    await patchSettings({ dismissedBanners: [...settings.dismissedBanners, id] });
  }

  const visible = scope === 'team' ? [] : entries;
  const title = snippets ? 'Snippets' : 'Dictionary';
  return (
    <Page wide>
      <PageHeader title={title} actions={<><Button variant="outline" onClick={() => void importEntries()}>Import</Button><Button onClick={() => setEditor('new')}>Add new</Button></>} />
      <p className={styles.syncStatus} title="Murmur runs fully offline — account sync and admin approval are not available.">
        {title} stored locally · Cloud sync unavailable
      </p>
      <div className={styles.toolbar}>
        <Tabs value={scope} onChange={setScope} tabs={[{ id: 'all', label: 'All' }, { id: 'personal', label: 'Personal' }, { id: 'team', label: 'Shared with team' }]} />
        <div className={styles.tools}>
          <SearchInput className={styles.search} value={query} onChange={setQuery} placeholder={snippets ? 'Search your snippets' : 'Search your vocabulary'} />
          <Menu align="end" trigger={(props) => <IconButton label={`Sort: ${SORTS.find((s) => s.value === settings.dictionarySort)?.label}`} {...props}><ArrowDownAZ size={17} /></IconButton>} items={SORTS.map((sort) => ({ label: sort.label, onSelect: () => void setSort(sort.value) }))} />
          <IconButton label="Refresh" onClick={() => void load()}><RefreshCw size={17} /></IconButton>
        </div>
      </div>
      {scope === 'team' ? <div className={styles.teamNotice}><h2>Shared with team</h2><p>Murmur runs fully offline, so team {snippets ? 'snippets' : 'vocabulary'}, sync, and admin approval are not available. Personal entries remain available immediately.</p></div> : <>
        {hero && (snippets ? <SnippetHero onAdd={() => setEditor('new')} onDismiss={() => void dismissHero()} /> : <DictionaryHero onAdd={(phrase) => setEditor(phrase ? { preset: phrase } : 'new')} onDismiss={() => void dismissHero()} />)}
        {selected.length > 0 && <div className={styles.bulk}><span>{selected.length} selected</span><Button size="sm" variant="danger" onClick={() => setDeleting(selected)}>Delete selected</Button></div>}
        {visible.length ? <div className={styles.list} role="grid" aria-label={title}>
          {visible.map((entry) => <div className={styles.row} role="row" key={entry.id}>
            <Checkbox aria-label={`Select ${entry.phrase}`} checked={selected.includes(entry.id)} onChange={(checked) => setSelected((ids) => checked ? [...ids, entry.id] : ids.filter((id) => id !== entry.id))} />
            <div className={styles.rowText} role="gridcell">{entry.phrase}{entry.replacement ? ` → ${entry.replacement}` : ''}</div>
            {entry.source === 'auto' && <span className={cx('m-tooltip', styles.learned)} data-tip="Murmur learned this word automatically"><Sparkles size={16} /></span>}
            <IconButton className={entry.isStarred ? styles.starred : undefined} label={entry.isStarred ? 'Unstar' : 'Star'} onClick={() => void api.dictionary.update(entry.id, { isStarred: !entry.isStarred })}><Star size={16} fill={entry.isStarred ? 'currentColor' : 'none'} /></IconButton>
            <div className={styles.actions}><IconButton label="Edit" onClick={() => setEditor(entry)}><Pencil size={16} /></IconButton><IconButton label="Delete" onClick={() => setDeleting([entry.id])}><Trash2 size={16} /></IconButton></div>
          </div>)}
        </div> : <div className={styles.empty}><EmptyState title={query ? `No matching ${snippets ? 'snippets' : 'words'}` : `No ${snippets ? 'snippets' : 'words'} yet`} body={query ? 'Try a different search.' : 'Add one to get started.'} action={!query && <Button onClick={() => setEditor('new')}>Add new</Button>} /></div>}
      </>}
      <EntryDialog snippets={snippets} value={editor} onClose={() => setEditor(null)} onSaved={() => void load()} />
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.length === 1 ? (snippets ? 'snippet' : 'word') : (snippets ? 'snippets' : 'words')}?`} body={deleting?.length === 1 ? 'This cannot be undone.' : `Permanently delete these ${deleting?.length} items? This cannot be undone.`} confirmLabel={deleting?.length === 1 ? 'Delete' : `Delete ${deleting?.length} items`} danger onClose={() => setDeleting(null)} onConfirm={() => deleting && void remove(deleting)} />
    </Page>
  );
}

function DictionaryHero({ onAdd, onDismiss }: { onAdd: (phrase?: string) => void; onDismiss: () => void }) {
  return <div className={styles.hero}><Banner variant="amber" title={<>Murmur spells the way <em>you</em> do.</>} body={<>Correct a spelling once or add it here manually, so your <strong>personal terms, company jargon, or uncommon names</strong> are spelled right in both dictations and meeting notes.</>} onDismiss={onDismiss}><div className={styles.heroChips}><button className={styles.chip} onClick={() => onAdd()}>Add new word</button>{['Murmur', 'Samir', 'Sara', 'Karol', 'Spyder'].map((word) => <button className={styles.chip} key={word} onClick={() => onAdd(word)}>{word}</button>)}</div></Banner></div>;
}

function SnippetHero({ onAdd, onDismiss }: { onAdd: () => void; onDismiss: () => void }) {
  return <div className={styles.hero}><Banner variant="teal" title={<>The stuff <em>you</em> shouldn&apos;t have to re-type.</>} body="Save text you type often — an email, intro, or prompt — then say a word to drop it in instantly." onDismiss={onDismiss}><div className={styles.exampleGrid}>{[['“my LinkedIn”', 'https://www.linkedin.com/in/john-doe/'], ['“rewrite prompt”', 'Rewrite this to be more concise...'], ['“intro email”', 'Hey, would love to find some time to chat later...'], ['“company intro”', 'Murmur is a private, offline voice workspace...'], ['“support message”', 'Thanks for reaching out — here’s how I can help...']].map(([a, b]) => <div className={styles.example} key={a}><span>{a}</span> → <span>{b}</span></div>)}</div><div className={styles.heroChips}><button className={styles.chip} onClick={onAdd}>Add new snippet</button></div></Banner></div>;
}

function EntryDialog({ snippets, value, onClose, onSaved }: { snippets: boolean; value: EditorValue | null; onClose: () => void; onSaved: () => void }) {
  const existing = value && value !== 'new' && 'id' in value ? value : null;
  const preset = value && value !== 'new' && 'preset' in value ? value.preset : '';
  const [phrase, setPhrase] = useState('');
  const [replacement, setReplacement] = useState('');
  const [correction, setCorrection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (value) { setPhrase(existing?.phrase ?? preset); setReplacement(existing?.replacement ?? ''); setCorrection(!!existing?.replacement && !snippets); setError(null); } }, [existing, preset, snippets, value]);
  async function save() {
    setError(null); setSaving(true);
    try {
      const result = existing ? await api.dictionary.update(existing.id, { phrase, replacement: snippets || correction ? replacement : null }) : await api.dictionary.add({ phrase, replacement: snippets || correction ? replacement : null, isSnippet: snippets });
      if (result.warning) toast('Snippet saved', { body: result.warning, tone: 'warning' });
      onSaved(); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
  }
  return <Dialog open={!!value} onClose={onClose} title={existing ? (snippets ? 'Edit snippet' : existing.replacement ? 'Edit replacement' : 'Edit word') : snippets ? 'Add snippet' : 'Add to vocabulary'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={() => void save()}>{existing ? 'Save changes' : snippets ? 'Add snippet' : 'Add word'}</Button></>}>
    <div className={styles.dialogFields}>
      <Field label={snippets ? 'Snippet' : correction ? 'Misspelling' : 'Word'} error={error}><Input autoFocus aria-label={snippets ? 'Snippet' : correction ? 'Misspelling' : 'Word'} value={phrase} onChange={(e) => setPhrase(e.target.value)} /></Field>
      {!snippets && <div className={styles.toggleRow}><div><strong>Correct a misspelling</strong><div className="m-field__hint">Automatically replace it during dictation.</div></div><Toggle label="Correct a misspelling" checked={correction} onChange={setCorrection} /></div>}
      {(snippets || correction) && <Field label={snippets ? 'Expansion' : 'Replacement'}><TextArea aria-label={snippets ? 'Expansion' : 'Replacement'} rows={snippets ? 7 : 3} maxLength={4000} value={replacement} onChange={(e) => setReplacement(e.target.value)} /><div className={styles.counter}>{replacement.length} / 4000</div></Field>}
    </div>
  </Dialog>;
}
