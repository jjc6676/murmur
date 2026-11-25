import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Folder, MessageCircle, Plus, RotateCcw, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Folder as FolderType, Meeting, MeetingChatMessage, Todo, TranscriptSegment } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Button, Checkbox, EmptyState, IconButton, Input, Page, Select, Tabs, TextArea } from '../../ui';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { toast, useHubUi } from '../state';
import { SpeakerClipButton } from '../notetaker/SpeakerClipButton';
import '../notetaker/notetaker.css';

type MeetingTab = 'thoughts' | 'transcript' | 'summary';
const TEMPLATES = ['auto', '1:1', 'team meeting', 'sales call', 'interview', 'lecture', 'client call'];

export function MeetingPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const patchSettings = usePatchSettings();
  const openSettings = useHubUi((state) => state.openSettings);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [tab, setTab] = useState<MeetingTab>('summary');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [summarySearch, setSummarySearch] = useState('');
  const [template, setTemplate] = useState('auto');
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [incompleteQuestion, setIncompleteQuestion] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ segment: TranscriptSegment; text: string; saving: boolean; error: string | null } | null>(null);
  const [revealedOriginals, setRevealedOriginals] = useState<Set<string>>(() => new Set());
  const [meetingTodos, setMeetingTodos] = useState<Todo[]>([]);
  const [resumeFailed, setResumeFailed] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const [next, folderRows, history, todos] = await Promise.all([api.meetings.get(id), api.meetings.listFolders(), api.meetings.chatHistory(id), api.todos.list({ archived: false })]);
    setMeeting(next);
    setFolders(folderRows);
    setMessages(history);
    setMeetingTodos(todos.filter((todo) => todo.meetingId === id));
    if (next) {
      setTitle(next.title);
      setNotes(next.myNotes);
      setTemplate(next.summary?.template ?? 'auto');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEvent('meetings:changed', ({ id: changed }) => { if (!changed || changed === id) void load(); });

  const filteredSegments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return meeting?.transcript.filter((segment) => !needle || segment.text.toLowerCase().includes(needle) || segment.speakerName.toLowerCase().includes(needle)) ?? [];
  }, [meeting, search]);
  useEffect(() => setMatchIndex(0), [search]);
  const visibleSummarySections = useMemo(() => {
    const needle = summarySearch.trim().toLowerCase();
    if (!needle) return meeting?.summary?.sections ?? [];
    return meeting?.summary?.sections.filter((section) => section.heading.toLowerCase().includes(needle) || section.bullets.some((bullet) => bullet.toLowerCase().includes(needle))) ?? [];
  }, [meeting, summarySearch]);

  const saveTitle = async () => {
    if (!meeting || title.trim() === meeting.title) return;
    try {
      const next = await api.meetings.rename(meeting.id, title);
      setMeeting(next);
    } catch (error) {
      setTitle(meeting.title);
      toast(errorMessage(error), { tone: 'error' });
    }
  };
  const saveSegment = async () => {
    if (!meeting || !editing || editing.saving || !editing.text.trim()) return;
    setEditing({ ...editing, saving: true, error: null });
    try {
      const next = await api.meetings.correctSegment(meeting.id, editing.segment.id, editing.segment.text, editing.text);
      setMeeting(next);
      setEditing(null);
    } catch (error) {
      setEditing((current) => current ? { ...current, saving: false, error: errorMessage(error) } : current);
    }
  };

  const deleteSegment = async (segment: TranscriptSegment) => {
    if (!meeting) return;
    try {
      setMeeting(await api.meetings.deleteSegment(meeting.id, segment.id));
      toast('Transcript line deleted', {
        actions: [{ label: 'Undo', onClick: () => void api.meetings.restoreSegment(meeting.id, segment).then(setMeeting).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' })) }],
      });
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
    }
  };

  const copyTranscript = async () => {
    if (!meeting) return;
    if (!meeting.transcript.length) {
      toast('No transcript to copy', { tone: 'warning' });
      return;
    }
    try {
      await api.app.copyText(meeting.transcript.map((segment) => `${segment.speakerName}: ${segment.text}`).join('\n'));
      toast('Transcript copied', { tone: 'success' });
    } catch (error) {
      toast('Couldn’t copy transcript', { body: errorMessage(error), tone: 'error' });
    }
  };

  const refreshMeetingTodos = async () => {
    const todos = await api.todos.list({ archived: false });
    setMeetingTodos(todos.filter((todo) => todo.meetingId === id));
  };
  const resumeMeeting = async () => {
    try {
      const next = await api.recorder.start({ title: meeting?.title });
      if (!next.meetingId) throw new Error('Notetaker could not start');
      await api.recorder.openNotepad(next.meetingId);
      setResumeFailed(false);
    } catch (error) {
      setResumeFailed(true);
      toast(errorMessage(error), { tone: 'error' });
    }
  };

  const runQuestion = async (text: string) => {
    if (!text.trim() || asking) return;
    const request = ++requestRef.current;
    setQuestion('');
    setIncompleteQuestion(null);
    setAsking(true);
    try {
      const next = await api.meetings.chat(id, text);
      if (request === requestRef.current) setMessages((current) => [...current, ...next]);
    } catch (error) {
      if (request === requestRef.current) {
        setIncompleteQuestion(text);
        toast(errorMessage(error), { tone: 'error' });
      }
    } finally {
      if (request === requestRef.current) setAsking(false);
    }
  };

  const ask = (event: FormEvent) => {
    event.preventDefault();
    void runQuestion(question);
  };

  if (!meeting) return <Page><EmptyState title="Meeting not found" action={<Button onClick={() => navigate('/notetaker')}>Back to Notetaker</Button>} /></Page>;
  const summaryMarkdown = [`# ${meeting.title}`, '', meeting.summary?.overview ?? '', ...(meeting.summary?.sections.flatMap((section) => ['', `## ${section.heading}`, ...section.bullets.map((bullet) => `- ${bullet}`)]) ?? [])].join('\n');

  return (
    <Page wide>
      <div className="meeting-layout">
        <main className="meeting-main">
          <input className="meeting-title-input" aria-label="Meeting title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void saveTitle()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <div className="meeting-meta">{new Date(meeting.createdAt).toLocaleString()} · {Math.max(1, Math.round(meeting.durationSec / 60))} min <Button size="sm" variant="ghost" onClick={() => void resumeMeeting()}>{resumeFailed ? 'Record new meeting' : 'Resume meeting'}</Button></div>
          <Tabs tabs={[{ id: 'thoughts', label: 'My thoughts' }, { id: 'transcript', label: 'Transcript' }, { id: 'summary', label: 'Summary' }]} value={tab} onChange={setTab} />

          <section className="meeting-panel">
            {tab === 'thoughts' && (
              <TextArea className="thoughts-editor" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void api.meetings.updateNotes(meeting.id, notes).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' }))} placeholder="Write your notes here. We'll make a separate summary at the end." />
            )}
            {tab === 'transcript' && (
              <>
                <div className="transcript-tools">
                  <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transcript" aria-label="Search transcript" />
                  {search && <><span className="nt-subtle">{filteredSegments.length ? matchIndex + 1 : 0}/{filteredSegments.length}</span><Button size="sm" variant="ghost" aria-label="Previous transcript match" icon={<ChevronLeft size={14} />} onClick={() => setMatchIndex((current) => filteredSegments.length ? (current - 1 + filteredSegments.length) % filteredSegments.length : 0)} /><Button size="sm" variant="ghost" aria-label="Next transcript match" icon={<ChevronRight size={14} />} onClick={() => setMatchIndex((current) => filteredSegments.length ? (current + 1) % filteredSegments.length : 0)} /></>}
                  <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void copyTranscript()}>Copy transcript</Button>
                </div>
                {meeting.transcriptDeletedAt && (
                  <div className="recorder-banner warning" role="status">
                    <div className="nt-grow"><strong>Transcript deleted by retention policy</strong><div>The transcript reached your local retention limit on {new Date(meeting.transcriptDeletedAt).toLocaleDateString()}.</div></div>
                    <Button size="sm" variant="outline" onClick={() => openSettings('notetaker')}>Retention settings</Button>
                  </div>
                )}
                {filteredSegments.map((segment) => (
                  <div className="transcript-line" key={segment.id}>
                    <button type="button" className="speaker-chip" onClick={() => { const name = window.prompt('Speaker name', segment.speakerName); if (name) void api.meetings.renameSpeaker(meeting.id, segment.speaker, name).then(setMeeting); }}>{segment.speakerName}</button>
                    <div className="segment-text">
                      {editing?.segment.id === segment.id ? (
                        <div className="transcript-editor">
                          <TextArea aria-label="Edit transcript line" value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value, error: null })} />
                          {editing.error && <span role="alert" className="save-failed">{editing.error}</span>}
                          <div className="nt-inline-actions"><Button size="sm" onClick={() => void saveSegment()} disabled={!editing.text.trim() || editing.saving}>{editing.saving ? 'Saving edit…' : editing.error ? 'Try again' : 'Save edit'}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={editing.saving}>Cancel edit</Button></div>
                        </div>
                      ) : (
                        <>{segment.translatedText ? <>{segment.translatedText}<span className="segment-translation"><span className="nt-subtle">{segment.sourceLanguage || meeting.language ? `Translated from ${(segment.sourceLanguage || meeting.language).toUpperCase()}. Original available.` : 'Translated. Original available.'}</span> <button type="button" className="inline-link" onClick={() => setRevealedOriginals((current) => { const next = new Set(current); if (next.has(segment.id)) next.delete(segment.id); else next.add(segment.id); return next; })}>{revealedOriginals.has(segment.id) ? 'Hide original' : 'Original'}</button>{revealedOriginals.has(segment.id) && <span className="segment-original">{segment.text}</span>}</span></> : segment.text}{segment.edited && <span className="nt-subtle"> · Edited <button type="button" className="inline-link" onClick={() => setRevealedOriginals((current) => { const next = new Set(current); if (next.has(segment.id)) next.delete(segment.id); else next.add(segment.id); return next; })}>{revealedOriginals.has(segment.id) ? 'Hide original transcript' : 'Original transcript'}</button></span>}{revealedOriginals.has(segment.id) && segment.originalText && <span className="segment-original">{segment.originalText}</span>}</>
                      )}
                    </div>
                    <div className="nt-inline-actions"><SpeakerClipButton meetingId={meeting.id} speaker={segment.speaker} speakerName={segment.speakerName} /><Button size="sm" variant="ghost" onClick={() => setEditing({ segment, text: segment.text, saving: false, error: null })}>Edit</Button>{segment.edited && <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => void api.meetings.revertSegment(meeting.id, segment.id).then(setMeeting)}>Revert</Button>}<IconButton size="sm" label="Delete transcript line" onClick={() => void deleteSegment(segment)}><Trash2 size={13} /></IconButton></div>
                  </div>
                ))}
                {!filteredSegments.length && <EmptyState icon={<Search />} title="No transcript matches" />}
              </>
            )}
            {tab === 'summary' && (meeting.summary ? (
              <>
                <div className="transcript-tools">
                  <Input type="search" value={summarySearch} onChange={(event) => setSummarySearch(event.target.value)} placeholder="Search summary" aria-label="Search summary" />
                  <Select value={template} options={TEMPLATES.map((value) => ({ value, label: value === 'auto' ? 'Auto' : value.replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} onChange={setTemplate} ariaLabel="Summary template" />
                  <Button size="sm" variant="outline" onClick={() => void api.meetings.regenerateSummary(meeting.id, template).then(setMeeting).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' }))}>Regenerate</Button>
                  <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void api.app.copyText(summaryMarkdown).then(() => toast('Copied summary', { tone: 'success' }))}>Copy markdown</Button>
                  <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => void api.meetings.exportMarkdown(meeting.id)}>Export</Button>
                </div>
                {meeting.audioUpdatedAt && meeting.summaryUpdatedAt && meeting.audioUpdatedAt > meeting.summaryUpdatedAt && <div className="recorder-banner warning">New audio since this summary. Regenerate when you're ready.</div>}
                <div className="summary-kicker">Enhanced Summary · {Math.max(1, Math.round(summaryMarkdown.split(/\s+/).length / 220))} min read</div>
                <p className="summary-overview">{meeting.summary.overview}</p>
                {visibleSummarySections.map((section) => <section className="summary-section" key={section.heading}><h2>{section.heading}</h2><ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></section>)}
                <section className="summary-section">
                  <div className="section-heading-row">
                    <h2>Action items</h2>
                    <div className="nt-inline-actions">
                      <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => { const title = window.prompt('Add action item'); if (title?.trim()) void api.todos.add(title, meeting.id).then(refreshMeetingTodos); }}>Add action item</Button>
                      {!!meetingTodos.length && <Button size="sm" variant="ghost" icon={<CheckCircle2 size={14} />} onClick={() => void Promise.all(meetingTodos.map((todo) => api.todos.update(todo.id, { status: 'done' }))).then(refreshMeetingTodos)}>Mark all as completed</Button>}
                      {!!meetingTodos.length && <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => { if (window.confirm(`Archive ${meetingTodos.length === 1 ? 'this action item' : `all ${meetingTodos.length} action items`}? You can restore ${meetingTodos.length === 1 ? 'it' : 'them'} from Archived.`)) void api.todos.archiveMany(meetingTodos.map((todo) => todo.id), true).then(refreshMeetingTodos); }}>Archive all</Button>}
                      <Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>View all in Tasks</Button>
                    </div>
                  </div>
                  {meeting.summary.actionItems.map((item) => {
                    const todo = meetingTodos.find((entry) => entry.title === item.text);
                    return <div className="action-row" key={item.text}><span className="nt-grow">{item.text}{item.owner && <span className="nt-subtle"> · {item.owner}</span>}</span>{todo ? <Checkbox checked={todo.status === 'done'} label={todo.status === 'done' ? `Mark ${todo.title} open` : `Mark ${todo.title} completed`} onChange={(checked) => void api.todos.update(todo.id, { status: checked ? 'done' : 'open' }).then(refreshMeetingTodos)} /> : <Button size="sm" variant="outline" onClick={() => void api.todos.add(item.text, meeting.id).then(() => { toast('Added to My Tasks', { tone: 'success' }); return refreshMeetingTodos(); })}>Add to My Tasks</Button>}</div>;
                  })}
                  {!meeting.summary.actionItems.length && !meetingTodos.length && <p className="nt-subtle">No remaining action items for this meeting.</p>}
                </section>
                <div className="summary-feedback"><span>Was this summary useful?</span><IconButton label="Helpful summary" size="sm" onClick={() => void api.meetings.rateSummary(meeting.id, 'up').then(() => toast('Thanks for your feedback'))}><ThumbsUp size={14} /></IconButton><IconButton label="Not helpful summary" size="sm" onClick={() => { const note = window.prompt('What could be better? (optional)') ?? ''; void api.meetings.rateSummary(meeting.id, 'down', note).then(() => toast('Thanks for your feedback')); }}><ThumbsDown size={14} /></IconButton></div>
              </>
            ) : (
              <EmptyState title={meeting.summaryStatus === 'pending' ? meeting.processingPhase === 'refining' ? 'Refining transcript…' : meeting.processingPhase === 'summarizing' ? 'Summarizing meeting…' : 'Transcribing audio…' : meeting.importSource ? 'This meeting came without a summary.' : meeting.durationSec < 15 ? 'This meeting was too short to summarize.' : 'No summary yet'} body="Generate a structured summary from this transcript." action={meeting.transcript.length ? <Button onClick={() => void api.meetings.regenerateSummary(meeting.id).then(setMeeting)}>Generate summary</Button> : undefined} />
            ))}
          </section>
        </main>

        <aside className="meeting-rail">
          <h2><MessageCircle size={17} /> Ask anything</h2>
          <div className="chat-log" aria-live="polite">
            {!messages.length && <div className="chat-suggestions">{['What did I miss?', 'Write a follow-up email', 'Identify blind spots', 'List decisions', 'Create an agenda'].map((prompt) => <Button key={prompt} size="sm" variant="outline" onClick={() => void runQuestion(prompt)}>{prompt}</Button>)}</div>}
            {messages.map((message) => <div className="chat-bubble" data-role={message.role} key={message.id}><div>{message.content}</div>{message.role === 'assistant' && <div className="chat-message-actions"><Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => void api.app.copyText(message.content).then(() => toast('Response copied', { tone: 'success' })).catch((error: unknown) => toast('Couldn’t copy response', { body: errorMessage(error), tone: 'error' }))}>Copy</Button><Button size="sm" variant="ghost" onClick={() => { const next = `${notes}${notes ? '\n\n' : ''}${message.content}`; setNotes(next); void api.meetings.updateNotes(meeting.id, next).then(() => toast('Updated meeting notes.')); }}>Add to notes</Button><Button size="sm" variant="ghost" onClick={() => void api.meetings.saveChatFact(meeting.id, message.id).then(() => toast('Saved to memory'))}>Save fact</Button></div>}</div>)}
            {incompleteQuestion && <div className="chat-bubble incomplete"><strong>This response did not complete</strong><Button size="sm" variant="ghost" onClick={() => void runQuestion(incompleteQuestion)}>Retry</Button></div>}
          </div>
          <form className="chat-form" onSubmit={ask}><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything, or type / for Skills" aria-label="Ask about this meeting" />{asking ? <Button type="button" variant="outline" onClick={() => { requestRef.current++; setAsking(false); setIncompleteQuestion(question || 'Previous request'); }}>Stop</Button> : <Button type="submit">Send</Button>}</form>
          <div className="skill-hints">Try /follow-up-email · /decision-log · /open-questions</div>
          <Select value={settings.notetaker.translationLanguage ?? ''} options={[{ value: '', label: 'Original language' }, { value: 'English', label: 'English' }, { value: 'Spanish', label: 'Spanish' }, { value: 'French', label: 'French' }, { value: 'German', label: 'German' }, { value: 'Japanese', label: 'Japanese' }]} onChange={(value) => void patchSettings({ notetaker: { translationLanguage: value || null } }).then(() => toast(value ? `Changing language to ${value}…` : 'Translation turned off'))} ariaLabel="Transcript translation language" />
          <h3><Folder size={16} /> Folders</h3>
          {folders.map((folder) => (
            <Checkbox
              key={folder.id}
              checked={meeting.folderIds.includes(folder.id)}
              label={folder.name}
              onChange={(checked) => {
                const previous = meeting.folderIds;
                const next = checked ? [...previous, folder.id] : previous.filter((folderId) => folderId !== folder.id);
                setMeeting({ ...meeting, folderIds: next });
                void api.meetings.setFolders(meeting.id, next).catch((error: unknown) => {
                  setMeeting((current) => current ? { ...current, folderIds: previous } : current);
                  toast(errorMessage(error), { tone: 'error' });
                });
              }}
            />
          ))}
          {!folders.length && <span className="nt-subtle">Create folders from the Notetaker library.</span>}
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => { if (window.confirm('Delete this meeting? Its notes and transcript cannot be recovered.')) void api.meetings.remove(meeting.id).then(() => navigate('/notetaker')); }}>Delete meeting</Button>
        </aside>
      </div>
    </Page>
  );
}
