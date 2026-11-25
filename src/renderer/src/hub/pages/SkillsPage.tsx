import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MeetingListItem, Skill } from '@shared/types';
import { Brain, Copy, FileText, Mail, MessageSquare, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, Input, Page, PageHeader, SearchInput, Select, Tabs, TextArea } from '../../ui';
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
  const [draftAction, setDraftAction] = useState<'email' | 'slack' | 'notion' | null>(null);
  const [actionTo, setActionTo] = useState('');
  const [actionCc, setActionCc] = useState('');
  const [actionSubject, setActionSubject] = useState('');
  const [actionBody, setActionBody] = useState('');
  const [askText, setAskText] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askState, setAskState] = useState<'idle' | 'thinking' | 'stopped' | 'failed'>('idle');
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const askRequest = useRef<string | null>(null);
  const [memorySaved, setMemorySaved] = useState(false);
  const [memoryAction, setMemoryAction] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const answerRef = useRef<HTMLDivElement | null>(null);
  const refresh = useCallback(() => void api.skills.list().then(setSkills), []);
  useEffect(refresh, [refresh]);
  useEffect(() => { void api.memory.list().then((docs) => setMemorySaved(docs.some((doc) => doc.title === 'Saved facts'))); }, []);
  const visible = useMemo(() => skills.filter((skill) => {
    const matchesTab = tab === 'built-in' ? skill.builtIn : tab === 'mine' ? !skill.builtIn : false;
    return matchesTab && `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase());
  }), [query, skills, tab]);
  useEffect(() => {
    if (askState !== 'thinking') return;
    const started = Date.now();
    const timer = window.setInterval(() => setThinkingSeconds(Math.floor((Date.now() - started) / 1_000)), 250);
    return () => window.clearInterval(timer);
  }, [askState]);
  const ask = async () => {
    const query = askText.trim();
    if (!query || askState === 'thinking') return;
    const requestId = crypto.randomUUID();
    askRequest.current = requestId;
    setAskAnswer(null);
    setThinkingSeconds(0);
    setAskState('thinking');
    try {
      const answer = await api.skills.ask(requestId, query);
      if (askRequest.current === requestId) {
        setAskAnswer(answer);
        setAskState('idle');
      }
    } catch (askError) {
      if (askRequest.current === requestId) {
        setAskAnswer(errorMessage(askError));
        setAskState('failed');
      }
    } finally {
      if (askRequest.current === requestId) askRequest.current = null;
    }
  };
  const stopAsk = () => {
    if (!askRequest.current) return;
    void api.skills.cancelAsk(askRequest.current);
    askRequest.current = null;
    setAskState('stopped');
  };
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
    if (skills.some((skill) => skill.command === command && skill.id !== draft.id && !skill.builtIn)) return setError('That slash command is already used by a personal skill');
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
  const openDraft = (kind: 'email' | 'slack' | 'notion') => {
    setActionSubject(selected?.name ?? 'Murmur draft');
    setActionBody(result ?? '');
    setDraftAction(kind);
  };
  const finishDraft = async () => {
    if (!draftAction) return;
    if (draftAction === 'email') {
      const mailto = `mailto:${encodeURIComponent(actionTo)}?cc=${encodeURIComponent(actionCc)}&subject=${encodeURIComponent(actionSubject)}&body=${encodeURIComponent(actionBody)}`;
      await api.app.openExternal(mailto);
      toast('Email draft opened', { body: 'Review it in your email app before sending.', tone: 'success' });
    } else {
      const markdown = actionSubject ? `# ${actionSubject}\n\n${actionBody}` : actionBody;
      await api.app.copyText(markdown);
      if (draftAction === 'slack') await api.app.openExternal('slack://open');
      toast(draftAction === 'slack' ? 'Draft copied and Slack opened' : 'Notion-ready Markdown copied', { tone: 'success' });
    }
    setDraftAction(null);
  };
  const saveToMemory = async (text: string, source: string) => {
    setMemoryAction('running');
    try {
      await api.memory.addFact(text, source);
      toast(memorySaved ? 'Saved to memory' : 'Your first memory was saved', { body: memorySaved ? undefined : 'Murmur can use this local fact in future memory searches.', tone: 'success' });
      setMemorySaved(true);
      setMemoryAction('done');
    } catch (saveError) {
      setMemoryAction('failed');
      toast('Couldn’t save to memory', { body: errorMessage(saveError), tone: 'error' });
    }
  };
  const removeFromMemory = async (text: string) => {
    setMemoryAction('running');
    try {
      await api.memory.removeFact(text);
      setMemoryAction('done');
      toast('Removed from memory', { tone: 'success' });
    } catch (removeError) {
      setMemoryAction('failed');
      toast('Couldn’t remove from memory', { body: errorMessage(removeError), tone: 'error' });
    }
  };
  return (
    <Page wide>
      <PageHeader title="Skills" actions={<Button icon={<Plus size={16} />} onClick={() => { setError(null); setDraft({ ...EMPTY_DRAFT }); }}>Create Skill</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'built-in', label: 'Built-in' }, { id: 'mine', label: 'My Skills' }, { id: 'shared', label: 'Shared with team' }]} />
      <div className={s.toolbar}><SearchInput value={query} onChange={setQuery} placeholder="Search Skills" /></div>
      <Card padded>
        <Field label="Ask your meetings" hint="Murmur searches recent local transcripts and summaries.">
          <TextArea
            aria-label="Ask anything"
            placeholder="Ask anything"
            rows={3}
            value={askText}
            onChange={(event) => setAskText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ask();
              }
            }}
          />
        </Field>
        <div className={s.actions}>
          {askState === 'thinking' ? <Button variant="outline" onClick={stopAsk}>Stop</Button> : <Button disabled={!askText.trim()} onClick={() => void ask()}>Send</Button>}
          {askAnswer && <Button size="sm" variant="ghost" onClick={() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}>Scroll to answer</Button>}
          <span>{askState === 'thinking' ? `Thinking · ${thinkingSeconds}s` : askState === 'stopped' ? 'Stopped' : askState === 'failed' ? 'Failed' : ''}</span>
        </div>
        {(askState !== 'idle' || askAnswer) && <p>
          {['Finding participants', 'Reading summaries', 'Searching meetings', 'Drafting answer'].map((step, index) => <span key={step}>{step} <Badge tone={askState === 'failed' ? 'danger' : askState === 'stopped' ? 'default' : askAnswer ? 'success' : index === 0 ? 'orange' : 'default'}>{askState === 'failed' ? 'Failed' : askState === 'stopped' ? 'Blocked' : askAnswer ? 'Done' : index === 0 ? 'Running' : 'Waiting'}</Badge>{' '}</span>)}
          {memoryAction !== 'idle' && <span>Saving or removing memory <Badge tone={memoryAction === 'failed' ? 'danger' : memoryAction === 'running' ? 'orange' : 'success'}>{memoryAction === 'failed' ? 'Failed' : memoryAction === 'running' ? 'Running' : 'Done'}</Badge></span>}
        </p>}
        {askAnswer && <div ref={answerRef} className={s.result}>
          {askAnswer}
          <div className={s.actions}>
            <Button size="sm" icon={<Brain size={14} />} onClick={() => void saveToMemory(askAnswer, 'Ask')}>Save to memory</Button>
            <Button size="sm" variant="outline" onClick={() => void removeFromMemory(askAnswer)}>Remove from memory</Button>
          </div>
        </div>}
      </Card>
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
        {selected && <div className={s.detail}>
          {skills.some((skill) => skill.id !== selected.id && skill.command === selected.command) && <div className={s.shadowNotice}>{selected.builtIn ? `A personal skill overrides /${selected.command}. That personal skill runs when you use the command.` : `This personal skill overrides the built-in /${selected.command} command.`}</div>}
          <Card padded><strong>Instructions</strong><p>{selected.instructions}</p><code>/{selected.command}</code></Card>
          <dl className={s.metadata}><div><dt>Author</dt><dd>{selected.builtIn ? 'Murmur' : 'You'}</dd></div><div><dt>Sharing</dt><dd>{selected.builtIn ? 'Built-in on this device' : 'Private to you'}</dd></div><div><dt>Edited</dt><dd>{new Date(selected.modifiedAt).toLocaleDateString()} · {selected.builtIn ? 'Murmur' : 'you'}</dd></div><div><dt>Run scope</dt><dd>{selected.scope === 'both' ? 'One or multiple meetings' : selected.scope === 'one' ? 'One meeting' : 'Multiple meetings'}</dd></div></dl>
          <div className={s.actions}><Button onClick={() => void openRun()}>Use</Button><Button variant="outline" onClick={() => { setError(null); setDraft(selected.builtIn ? { ...selected, id: undefined } : { ...selected }); setSelected(null); }}>Edit</Button><Button variant="outline" onClick={() => { setError(null); setDraft({ ...selected, id: undefined, name: `${selected.name} copy`, command: `${selected.command}-copy` }); setSelected(null); }}>Save a copy</Button>{!selected.builtIn && <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)}>Delete</Button>}</div>
        </div>}
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
      <Dialog
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title={result ? `${selected?.name} result` : `Use ${selected?.name ?? 'skill'}`}
        width={700}
        footer={result ? (
          <div className={s.actions}>
            <Button variant="outline" icon={<Copy size={15} />} onClick={() => void navigator.clipboard.writeText(result)}>Copy</Button>
            <Button variant="outline" icon={<Mail size={15} />} onClick={() => openDraft('email')}>Email</Button>
            <Button variant="outline" icon={<MessageSquare size={15} />} onClick={() => openDraft('slack')}>Slack</Button>
            <Button variant="outline" icon={<FileText size={15} />} onClick={() => openDraft('notion')}>Notion</Button>
            <Button icon={<Brain size={15} />} onClick={() => void saveToMemory(result, `Skill: ${selected?.name ?? 'Ask'}`)}>Save to memory</Button>
          </div>
        ) : <Button loading={running} disabled={!meetingIds.length} onClick={() => void run()}>Run skill</Button>}
      >
        {result ? <div className={s.result}>{result}</div> : <div className={s.meetings}>{meetings.length ? meetings.map((meeting) => <Checkbox key={meeting.id} checked={meetingIds.includes(meeting.id)} onChange={(checked) => setMeetingIds((current) => checked ? [...current, meeting.id] : current.filter((id) => id !== meeting.id))} label={meeting.title} />) : <EmptyState title="No meetings yet" body="Record or import a meeting before using this skill." />}</div>}
      </Dialog>
      <Dialog
        open={!!draftAction}
        onClose={() => setDraftAction(null)}
        title={draftAction === 'email' ? 'Email draft' : draftAction === 'slack' ? 'Slack draft' : 'Notion page draft'}
        footer={<><Button variant="ghost" onClick={() => setDraftAction(null)}>Cancel</Button><Button onClick={() => void finishDraft()}>{draftAction === 'email' ? 'Open email' : draftAction === 'slack' ? 'Copy & open Slack' : 'Copy Markdown'}</Button></>}
      >
        <div className={s.detail}>
          {draftAction === 'email' && <><Field label="To"><Input aria-label="Draft To" value={actionTo} onChange={(event) => setActionTo(event.target.value)} /></Field><Field label="Cc"><Input aria-label="Draft Cc" value={actionCc} onChange={(event) => setActionCc(event.target.value)} /></Field></>}
          <Field label={draftAction === 'slack' ? 'Channel or person' : 'Subject / title'}><Input aria-label="Draft subject" value={actionSubject} onChange={(event) => setActionSubject(event.target.value)} /></Field>
          <Field label="Content"><TextArea aria-label="Draft content" rows={10} value={actionBody} onChange={(event) => setActionBody(event.target.value)} /></Field>
        </div>
      </Dialog>
      <ConfirmDialog open={deleteOpen} title="Delete skill?" body="This custom skill cannot be recovered." confirmLabel="Delete" danger onClose={() => setDeleteOpen(false)} onConfirm={() => { if (selected) void api.skills.remove(selected.id).then(() => { setDeleteOpen(false); setSelected(null); refresh(); }); }} />
    </Page>
  );
}
