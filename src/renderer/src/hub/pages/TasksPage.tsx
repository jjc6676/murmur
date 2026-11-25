import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Check, Search, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Todo } from '@shared/types';
import { api, useEvent } from '../../lib/api';
import { Button, Checkbox, ConfirmDialog, IconButton, Page, PageHeader, Tabs } from '../../ui';
import { toast } from '../state';
import styles from '../tasks/TasksPage.module.css';

type Tab = 'date' | 'priority' | 'archived';

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

  const load = useCallback(async () => {
    setTasks(await api.todos.list({ archived: tab === 'archived', query }));
    setSelected(new Set());
  }, [query, tab]);
  useEffect(() => void load(), [load]);
  useEvent('todos:changed', () => void load());

  const groups = useMemo(() => {
    const result = new Map<string, Todo[]>();
    for (const task of tasks) {
      const key = groupName(task.createdAt);
      result.set(key, [...(result.get(key) ?? []), task]);
    }
    return result;
  }, [tasks]);

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
      {tab === 'date' && (
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
      {tab === 'priority' ? (
        <div className={styles.empty}><h2>Priority is coming soon</h2><p>Soon you’ll be able to organize tasks by what matters most.</p></div>
      ) : tasks.length ? (
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
                    <Checkbox checked={task.status === 'done'} label={`Mark ${task.title} ${task.status === 'done' ? 'incomplete' : 'complete'}`} onChange={(done) => void api.todos.update(task.id, { status: done ? 'done' : 'open' })} />
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
