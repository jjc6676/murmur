import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, CalendarDays, Check, Mail, MoreHorizontal, Plug, Search, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Todo } from '@shared/types';
import { api, useEvent } from '../../lib/api';
import { Button, Checkbox, ConfirmDialog, Dialog, Field, IconButton, Input, Menu, Page, PageHeader, Tabs, TextArea } from '../../ui';
import { toast } from '../state';
import styles from '../tasks/TasksPage.module.css';

type Tab = 'date' | 'priority' | 'archived';
type AutomationKind = 'email' | 'calendar';
const PRIORITY_LABEL: Record<Todo['priority'], string> = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };
const PRIORITY_ORDER: Todo['priority'][] = ['high', 'medium', 'low', 'none'];

const groupName = (iso: string) => {
  const day = new Date(iso);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const stamp = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const days = Math.floor((start - stamp) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Last week';
  return 'Older';
};

export function TasksPage() {
  const [tab, setTab] = useState<Tab>('date');
  const [tasks, setTasks] = useState<Todo[]>([]);
  const [query, setQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [showCoachmark, setShowCoachmark] = useState(true);
  const [automation, setAutomation] = useState<{ kind: AutomationKind; task: Todo } | null>(null);

  const load = useCallback(async () => {
    setTasks(await api.todos.list({ archived: tab === 'archived', query }));
    setSelected(new Set());
  }, [query, tab]);
  useEffect(() => void load(), [load]);
  useEvent('todos:changed', () => void load());

  const groups = useMemo(() => {
    const result = new Map<string, Todo[]>();
    if (tab === 'priority') {
      for (const priority of PRIORITY_ORDER) {
        const matches = tasks.filter((task) => task.priority === priority);
        if (matches.length) result.set(PRIORITY_LABEL[priority], matches);
      }
      return result;
    }
    for (const task of tasks) {
      const key = groupName(task.createdAt);
      result.set(key, [...(result.get(key) ?? []), task]);
    }
    return result;
  }, [tab, tasks]);

  const add = async () => {
    if (!newTitle.trim()) return;
    await api.todos.add(newTitle);
    setNewTitle('');
  };

  const archive = async (task: Todo, archived: boolean) => {
    await api.todos.update(task.id, { isArchived: archived });
    toast(archived ? 'Task archived' : 'Task restored', {
      tone: 'success',
      actions: [{ label: 'Undo', onClick: () => void api.todos.update(task.id, { isArchived: !archived }) }],
    });
  };

  const bulkArchive = async (archived: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    await api.todos.archiveMany(ids, archived);
    toast(archived ? `${ids.length} tasks archived` : `${ids.length} tasks restored`, {
      actions: [{ label: 'Undo', onClick: () => void api.todos.archiveMany(ids, !archived) }],
    });
  };

  const setCompleted = (task: Todo, done: boolean) => {
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: done ? 'done' : 'open' } : item));
    void api.todos.update(task.id, { status: done ? 'done' : 'open' }).catch(() => load());
  };

  return (
    <Page wide>
      <PageHeader title="My Tasks" />
      {showCoachmark && (
        <section className={styles.coachmark}>
          <div className={styles.coachIcon}><Check size={22} /></div>
          <div><strong>Your tasks live here!</strong><p>Action items from your notes and meetings are collected in one place.</p></div>
          <Button size="sm" onClick={() => setShowCoachmark(false)}>Check it out</Button>
          <IconButton label="Dismiss" onClick={() => setShowCoachmark(false)}><X size={17} /></IconButton>
        </section>
      )}
      <div className={styles.controls}>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'date', label: 'By date created' },
            { id: 'priority', label: 'By priority' },
            { id: 'archived', label: 'Archived' },
          ]}
        />
        <label className={styles.search}><Search size={16} /><input aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      {tab !== 'archived' && (
        <form className={styles.addTask} onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <span>+</span>
          <input aria-label="Add task" placeholder="Add task" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
          <Button type="submit" size="sm" disabled={!newTitle.trim()}>Add</Button>
        </form>
      )}
      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <strong>{selected.size} selected</strong>
          <Button size="sm" variant="ghost" icon={tab === 'archived' ? <ArchiveRestore size={16} /> : <Archive size={16} />} onClick={() => void bulkArchive(tab !== 'archived')}>
            {tab === 'archived' ? 'Restore' : 'Archive'}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={16} />} onClick={() => setDeleteIds([...selected])}>Delete</Button>
        </div>
      )}
      {tasks.length ? (
        <div className={styles.groups}>
          {[...groups.entries()].map(([name, items]) => (
            <section key={name}>
              <div className={styles.groupTitle}>
                <Checkbox
                  checked={items.every((task) => selected.has(task.id))}
                  label={name}
                  onChange={(checked) => setSelected((current) => {
                    const next = new Set(current);
                    for (const task of items) {
                      if (checked) next.add(task.id);
                      else next.delete(task.id);
                    }
                    return next;
                  })}
                />
                <span>{items.length}</span>
              </div>
              <ul className={styles.taskList}>
                {items.map((task) => (
                  <li key={task.id} className={styles.task}>
                    <Checkbox checked={selected.has(task.id)} label={`Select ${task.title}`} onChange={(checked) => setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(task.id);
                      else next.delete(task.id);
                      return next;
                    })} />
                    <Checkbox checked={task.status === 'done'} label={`Mark ${task.title} ${task.status === 'done' ? 'incomplete' : 'complete'}`} onChange={(done) => setCompleted(task, done)} />
                    <div className={styles.taskBody}>
                      <input
                        aria-label={`Edit ${task.title}`}
                        className={task.status === 'done' ? styles.done : ''}
                        defaultValue={task.title}
                        onBlur={(event) => {
                          if (event.target.value !== task.title) void api.todos.update(task.id, { title: event.target.value });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                      {task.meetingId && <Link to={`/notetaker/${task.meetingId}`}>From {task.meetingTitle || 'meeting'}</Link>}
                    </div>
                    <Menu
                      trigger={(props) => <IconButton label={`More actions for ${task.title}`} {...props}><MoreHorizontal size={17} /></IconButton>}
                      items={[
                        { label: 'High priority', onSelect: () => void api.todos.update(task.id, { priority: 'high' }) },
                        { label: 'Medium priority', onSelect: () => void api.todos.update(task.id, { priority: 'medium' }) },
                        { label: 'Low priority', onSelect: () => void api.todos.update(task.id, { priority: 'low' }) },
                        { label: 'No priority', onSelect: () => void api.todos.update(task.id, { priority: 'none' }) },
                        { separator: true, label: '' },
                        { label: 'Send email…', icon: <Mail size={16} />, onSelect: () => setAutomation({ kind: 'email', task }) },
                        { label: 'Add to calendar…', icon: <CalendarDays size={16} />, onSelect: () => setAutomation({ kind: 'calendar', task }) },
                      ]}
                    />
                    <IconButton label={task.isArchived ? `Restore ${task.title}` : `Archive ${task.title}`} onClick={() => void archive(task, !task.isArchived)}>
                      {task.isArchived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
                    </IconButton>
                    <IconButton label={`Delete ${task.title}`} onClick={() => setDeleteIds([task.id])}><Trash2 size={17} /></IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h2>{query ? 'No tasks match your search' : tab === 'archived' ? 'Nothing archived' : 'No tasks yet'}</h2>
          {!query && tab === 'date' && <p>Action items from your meetings show up here.</p>}
        </div>
      )}
      <section className={styles.connect}>
        <Plug size={20} />
        <div><strong>Connect apps</strong><p>Task sync with your favorite apps is coming in a few weeks.</p></div>
        <Button variant="outline" size="sm" onClick={() => toast('Murmur runs fully offline', { body: 'Online task connectors are not available.', tone: 'info' })}>Learn more</Button>
      </section>
      <AutomationDialog value={automation} onClose={() => setAutomation(null)} />
      <ConfirmDialog
        open={deleteIds.length > 0}
        title={`Delete ${deleteIds.length === 1 ? 'task' : `${deleteIds.length} tasks`}?`}
        body="This cannot be undone."
        confirmLabel="Delete permanently"
        danger
        onClose={() => setDeleteIds([])}
        onConfirm={() => {
          void api.todos.remove(deleteIds);
          setDeleteIds([]);
        }}
      />
    </Page>
  );
}

function AutomationDialog({ value, onClose }: { value: { kind: AutomationKind; task: Todo } | null; onClose: () => void }) {
  const task = value?.task;
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [guests, setGuests] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (!task) return;
    setSubject(task.title);
    setBody(`Hi,\n\n${task.title}\n`);
    setDescription(task.title);
  }, [task]);
  const sendEmail = async () => {
    if (!to.trim()) return;
    const url = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (task) await api.todos.recordEmail({ todoId: task.id, to: to.trim(), subject, body });
    try {
      await api.app.openExternal(url);
      toast('Email draft opened', { body: 'Review and send it in your email app.', tone: 'success' });
    } catch {
      await api.app.copyText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      toast('Draft copied', { body: 'No email app was available, so the draft was copied.', tone: 'info' });
    }
    onClose();
  };
  const saveCalendar = async () => {
    if (!task) return;
    const file = await api.todos.saveCalendarFile({ todoId: task.id, title: subject || task.title, start, end, guests, description });
    if (file) toast('Calendar event saved', { body: file, tone: 'success' });
    onClose();
  };
  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      title={value?.kind === 'email' ? 'Send email' : 'Add to calendar'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => void (value?.kind === 'email' ? sendEmail() : saveCalendar())}>{value?.kind === 'email' ? 'Open email draft' : 'Save .ics file'}</Button></>}
    >
      {value?.kind === 'email' ? (
        <div className={styles.form}>
          <Field label="To"><Input aria-label="To" type="email" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="Subject"><Input aria-label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
          <Field label="Body"><TextArea aria-label="Body" rows={7} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
        </div>
      ) : (
        <div className={styles.form}>
          <Field label="Title"><Input aria-label="Calendar title" value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
          <Field label="Start"><Input aria-label="Start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
          <Field label="End"><Input aria-label="End" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
          <Field label="Guests" hint="Separate email addresses with commas"><Input aria-label="Guests" value={guests} onChange={(event) => setGuests(event.target.value)} /></Field>
          <Field label="Description"><TextArea aria-label="Description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        </div>
      )}
    </Dialog>
  );
}
