import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MeetingListItem, Skill } from '@shared/types';
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, Input, Page, PageHeader, SearchInput, Select, Tabs, TextArea } from '../../ui';
import { toast } from '../state';
import s from '../skills/Skills.module.css';

type GalleryTab = 'built-in' | 'mine' | 'shared';
type SkillDraft = Pick<Skill, 'name' | 'description' | 'instructions' | 'command' | 'category' | 'scope'> & { id?: string };
const EMPTY_DRAFT: SkillDraft = { name: '', description: '', instructions: '', command: '', category: 'more', scope: 'both' };
const CATEGORIES: { id: Skill['category']; label: string }[] = [
  { id: 'before', label: 'Before a meeting' },
  { id: 'after', label: 'After a meeting' },
  { id: 'across', label: 'Across meetings' },
  { id: 'more', label: 'More Skills' },
];
const RESERVED = new Set(['help', 'settings', 'search', 'skills', 'memory', 'new', 'delete']);

export function SkillsPage() {
  const [tab, setTab] = useState<GalleryTab>('built-in');
  const [query, setQuery] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [meetingIds, setMeetingIds] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const refresh = useCallback(() => void api.skills.list().then(setSkills), []);
  useEffect(refresh, [refresh]);
  const visible = useMemo(() => skills.filter((skill) => {
    const matchesTab = tab === 'built-in' ? skill.builtIn : tab === 'mine' ? !skill.builtIn : false;
    return matchesTab && `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase());
  }), [query, skills, tab]);
  const openRun = async () => {
    setResult(null);
    setMeetingIds([]);
    setRunOpen(true);
    try {
      setMeetings(await api.meetings.list({ limit: 50 }));
    } catch {
      setMeetings([]);
    }
  };
  const save = async () => {
    if (!draft) return;
    const command = draft.command.trim();
    if (!draft.name.trim() || !draft.description.trim() || !draft.instructions.trim()) return setError('Name, description, and instructions are required');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command)) return setError('Slash command must use lowercase letters, numbers, and single hyphens');
    if (RESERVED.has(command)) return setError('That slash command is reserved');
    if (skills.some((skill) => skill.command === command && skill.id !== draft.id)) return setError('That slash command is already in use');
    try {
      await api.skills.save({ ...draft, command });
      setDraft(null);
      setSelected(null);
      refresh();
      toast('Skill saved', { tone: 'success' });
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  };
  const run = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      setResult(await api.skills.run(selected.id, meetingIds));
    } catch (runError) {
      toast('Couldn’t run skill', { body: errorMessage(runError), tone: 'error' });
    } finally {
      setRunning(false);
    }
  };
  return (
    <Page wide>
      <PageHeader title="Skills" actions={<Button icon={<Plus size={16} />} onClick={() => { setError(null); setDraft({ ...EMPTY_DRAFT }); }}>Create Skill</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'built-in', label: 'Built-in' }, { id: 'mine', label: 'My Skills' }, { id: 'shared', label: 'Shared with team' }]} />
      <div className={s.toolbar}><SearchInput value={query} onChange={setQuery} placeholder="Search Skills" /></div>
      {tab === 'shared' ? (
        <EmptyState icon={<Sparkles size={28} />} title="Shared skills aren’t available offline" body="Your personal and built-in skills remain fully available on this device." />
      ) : visible.length ? (
        CATEGORIES.map((category) => {
          const categorySkills = visible.filter((skill) => skill.category === category.id);
          return categorySkills.length ? <section className={s.section} key={category.id}><h2>{category.label}</h2><div className={s.gallery}>{categorySkills.map((skill) => <button type="button" className={s.skill} key={skill.id} onClick={() => setSelected(skill)}><strong>{skill.name}</strong><span>{skill.description}</span><code className={s.command}>/{skill.command}</code></button>)}</div></section> : null;
        })
      ) : (
        <EmptyState title={query ? `No skills match “${query}”` : 'No skills yet'} body={tab === 'mine' ? 'Create a skill for your own meeting workflow.' : undefined} />
      )}
      <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.name} description={selected?.description} width={620}>
        {selected && <div className={s.detail}><Card padded><strong>Instructions</strong><p>{selected.instructions}</p><code>/{selected.command}</code></Card><div className={s.actions}><Button onClick={() => void openRun()}>Use</Button><Button variant="outline" onClick={() => { setError(null); setDraft({ ...selected }); setSelected(null); }}>Edit</Button><Button variant="outline" onClick={() => { setError(null); setDraft({ ...selected, id: undefined, name: `${selected.name} copy`, command: `${selected.command}-copy` }); setSelected(null); }}>Save a copy</Button>{!selected.builtIn && <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)}>Delete</Button>}</div></div>}
      </Dialog>
      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit Skill' : 'Create Skill'} width={620} footer={<><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={() => void save()}>Save</Button></>}>
        {draft && (
          <div className={s.detail}>
            <Field label="Name"><Input aria-label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="One-line description"><Input aria-label="One-line description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
            <Field label="Instructions"><TextArea aria-label="Instructions" rows={6} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></Field>
            <Field label="Slash command" hint="Lowercase letters, numbers, and single hyphens." error={error}><Input value={draft.command} aria-label="Slash command" onChange={(event) => { setError(null); setDraft({ ...draft, command: event.target.value.replace(/^\//, '') }); }} /></Field>
            <Field label="Category"><Select ariaLabel="Category" value={draft.category} onChange={(category) => setDraft({ ...draft, category })} options={CATEGORIES.map((category) => ({ value: category.id, label: category.label }))} /></Field>
            <Field label="Run scope"><Select ariaLabel="Run scope" value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} options={[{ value: 'one', label: 'One meeting' }, { value: 'multiple', label: 'Multiple meetings' }, { value: 'both', label: 'One or multiple meetings' }]} /></Field>
          </div>
        )}
      </Dialog>
      <Dialog open={runOpen} onClose={() => setRunOpen(false)} title={result ? `${selected?.name} result` : `Use ${selected?.name ?? 'skill'}`} width={700} footer={result ? <Button icon={<Copy size={15} />} onClick={() => void navigator.clipboard.writeText(result)}>Copy result</Button> : <Button loading={running} disabled={!meetingIds.length} onClick={() => void run()}>Run skill</Button>}>
        {result ? <div className={s.result}>{result}</div> : <div className={s.meetings}>{meetings.length ? meetings.map((meeting) => <Checkbox key={meeting.id} checked={meetingIds.includes(meeting.id)} onChange={(checked) => setMeetingIds((current) => checked ? [...current, meeting.id] : current.filter((id) => id !== meeting.id))} label={meeting.title} />) : <EmptyState title="No meetings yet" body="Record or import a meeting before using this skill." />}</div>}
      </Dialog>
      <ConfirmDialog open={deleteOpen} title="Delete skill?" body="This custom skill cannot be recovered." confirmLabel="Delete" danger onClose={() => setDeleteOpen(false)} onConfirm={() => { if (selected) void api.skills.remove(selected.id).then(() => { setDeleteOpen(false); setSelected(null); refresh(); }); }} />
    </Page>
  );
}
