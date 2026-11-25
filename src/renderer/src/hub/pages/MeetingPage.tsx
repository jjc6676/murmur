import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Plus, RotateCcw, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Folder as FolderType, Meeting, MeetingArtifact, MeetingSummary, Todo, TranscriptSegment } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Button, Checkbox, Dialog, EmptyState, IconButton, Input, Page, Select, Tabs, TextArea } from '../../ui';
import { toast, useHubUi } from '../state';
import { MeetingChatRail } from '../notetaker/MeetingChatRail';
import { MeetingFolderPicker } from '../notetaker/MeetingFolderPicker';
import { MeetingNotesEditor } from '../notetaker/MeetingNotesEditor';
import { SpeakerClipButton } from '../notetaker/SpeakerClipButton';
import { SummaryLanguagePicker, type SummaryTranslationRow } from '../notetaker/SummaryLanguagePicker';
import '../notetaker/notetaker.css';

type MeetingTab = 'brief' | 'thoughts' | 'transcript' | 'summary' | 'actions' | `artifact:${string}`;
const TEMPLATES = ['auto', '1:1', 'team meeting', 'sales call', 'interview', 'lecture', 'client call'];

export function MeetingPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
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
  const [artifacts, setArtifacts] = useState<MeetingArtifact[]>([]);
  const [translations, setTranslations] = useState<SummaryTranslationRow[]>([]);
  const [displayedSummary, setDisplayedSummary] = useState<MeetingSummary | null>(null);
  const [summaryLanguage, setSummaryLanguage] = useState('Original');
  const [feedback, setFeedback] = useState<{ rating: 'up' | 'down'; note: string } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [editing, setEditing] = useState<{ segment: TranscriptSegment; text: string; saving: boolean; error: string | null } | null>(null);
  const [revealedOriginals, setRevealedOriginals] = useState<Set<string>>(() => new Set());
  const [meetingTodos, setMeetingTodos] = useState<Todo[]>([]);
  const [resumeFailed, setResumeFailed] = useState(false);

  const load = useCallback(async () => {
    const [next, folderRows, todos, artifactRows, translationRows] = await Promise.all([
      api.meetings.get(id),
      api.meetings.listFolders(),
      api.todos.list({ archived: false }),
      api.meetings.listArtifacts(id),
      api.meetings.summaryTranslations(id),
    ]);
    setMeeting(next);
    setFolders(folderRows);
    setMeetingTodos(todos.filter((todo) => todo.meetingId === id));
    setArtifacts(artifactRows);
    setTranslations(translationRows);
    if (next) {
      setTitle(next.title);
      setNotes(next.myNotes);
      setTemplate(next.summary?.template ?? 'auto');
      setDisplayedSummary(next.summary);
      setSummaryLanguage('Original');
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
    if (!needle) return displayedSummary?.sections ?? [];
    return displayedSummary?.sections.filter((section) => section.heading.toLowerCase().includes(needle) || section.bullets.some((bullet) => bullet.toLowerCase().includes(needle))) ?? [];
  }, [displayedSummary, summarySearch]);

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

  if (!meeting) return <Page><EmptyState title="Meeting not found" action={<Button onClick={() => navigate('/notetaker')}>Back to Notetaker</Button>} /></Page>;
  const activeSummary = displayedSummary ?? meeting.summary;
  const summaryMarkdown = [`# ${meeting.title}`, '', activeSummary?.overview ?? '', ...(activeSummary?.sections.flatMap((section) => ['', `## ${section.heading}`, ...section.bullets.map((bullet) => `- ${bullet}`)]) ?? [])].join('\n');
  const wordCount = meeting.transcript.reduce((total, segment) => total + segment.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const speakerCount = new Set(meeting.transcript.map((segment) => segment.speaker)).size;
  const activeArtifact = tab.startsWith('artifact:') ? artifacts.find((artifact) => `artifact:${artifact.id}` === tab) : null;
  const regenerate = async () => {
    setRetrying(true);
    try {
      const next = await api.meetings.regenerateSummary(meeting.id, template);
      setMeeting(next);
      setDisplayedSummary(next.summary);
      setSummaryLanguage('Original');
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
      await load();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Page wide>
      <div className="meeting-layout">
        <main className="meeting-main">
          <input className="meeting-title-input" aria-label="Meeting title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void saveTitle()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <div className="meeting-meta">{new Date(meeting.createdAt).toLocaleString()} · {Math.max(1, Math.round(meeting.durationSec / 60))} min <Button size="sm" variant="ghost" onClick={() => void resumeMeeting()}>{resumeFailed ? 'Record new meeting' : 'Resume meeting'}</Button></div>
          <Tabs tabs={[{ id: 'brief', label: 'Brief' }, { id: 'thoughts', label: 'My Notes' }, { id: 'transcript', label: 'Transcript' }, { id: 'summary', label: 'Summary' }, { id: 'actions', label: 'Action Items' }, ...artifacts.map((artifact) => ({ id: `artifact:${artifact.id}` as const, label: artifact.title }))]} value={tab} onChange={setTab} />

          <section className="meeting-panel">
            {tab === 'brief' && <div className="meeting-brief"><div className="summary-kicker">Meeting brief</div><h2>{meeting.title}</h2><p>{meeting.summary?.overview || `Prepare for this ${Math.max(1, Math.round(meeting.durationSec / 60))}-minute conversation. Review your notes and open action items before continuing.`}</p><div className="nt-inline-actions"><Button onClick={() => void resumeMeeting()}>Start meeting</Button>{meetingTodos.some((todo) => todo.status === 'open') && <Button variant="outline" onClick={() => setTab('actions')}>Review open commitments</Button>}</div></div>}
            {tab === 'thoughts' && <MeetingNotesEditor html={notes} onChange={setNotes} onSave={(html) => api.meetings.updateNotes(meeting.id, html)} />}
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
            {tab === 'summary' && (activeSummary ? (
              <>
                <div className="transcript-tools">
                  <Input type="search" value={summarySearch} onChange={(event) => setSummarySearch(event.target.value)} placeholder="Search summary" aria-label="Search summary" />
                  <Select value={template} options={TEMPLATES.map((value) => ({ value, label: value === 'auto' ? 'Auto' : value.replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} onChange={setTemplate} ariaLabel="Summary template" />
                  <Button size="sm" variant="outline" loading={retrying} onClick={() => void regenerate()}>Regenerate</Button>
                  <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void api.app.copyText(summaryMarkdown).then(() => toast('Copied summary', { tone: 'success' }))}>Copy markdown</Button>
                  <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => void api.meetings.exportMarkdown(meeting.id)}>Export</Button>
                </div>
                <SummaryLanguagePicker meetingId={meeting.id} detectedLanguage={meeting.language} original={meeting.summary ?? activeSummary} translations={translations} onTranslationsChange={setTranslations} onSummaryChange={(summary, language) => { setDisplayedSummary(summary); setSummaryLanguage(language); }} />
                {meeting.audioUpdatedAt && meeting.summaryUpdatedAt && meeting.audioUpdatedAt > meeting.summaryUpdatedAt && <div className="recorder-banner warning">New audio since this summary. Regenerate when you're ready.</div>}
                <div className="summary-kicker">Enhanced Summary · {summaryLanguage} · Summary refined · {Math.max(1, Math.round(summaryMarkdown.split(/\s+/).length / 220))} min read</div>
                <p className="summary-overview">{activeSummary.overview}</p>
                {visibleSummarySections.map((section) => <section className="summary-section" key={section.heading}><h2>{section.heading}</h2><ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></section>)}
                <div className="summary-feedback"><span>Was this summary useful?</span><IconButton label="Helpful summary" size="sm" onClick={() => setFeedback({ rating: 'up', note: '' })}><ThumbsUp size={14} /></IconButton><IconButton label="Not helpful summary" size="sm" onClick={() => setFeedback({ rating: 'down', note: '' })}><ThumbsDown size={14} /></IconButton><Button size="sm" variant="ghost" onClick={() => void api.meetings.rateSummary(meeting.id, null).then(() => toast('Feedback removed'))}>Remove feedback</Button></div>
              </>
            ) : (
              <div role={meeting.summaryStatus === 'pending' ? 'status' : undefined} aria-live="polite">
                <EmptyState
                  title={meeting.summaryStatus === 'pending' ? meeting.processingPhase === 'refining' ? 'Identifying speakers and refining your transcript…' : meeting.processingPhase === 'summarizing' ? 'Finding action items, decisions, and next steps…' : 'Getting every word…' : meeting.summaryStatus === 'failed' ? 'We couldn’t finish your meeting note' : meeting.importSource ? 'This meeting came without a summary.' : meeting.durationSec < 15 ? 'This meeting was too short to summarize.' : 'No summary yet'}
                  body={meeting.summaryStatus === 'pending' ? meeting.processingPhase === 'refining' ? `Step 2 of 3 · ${speakerCount} speaker${speakerCount === 1 ? '' : 's'} identified` : meeting.processingPhase === 'summarizing' ? 'Step 3 of 3 · Turning the conversation into a two-minute read' : `Step 1 of 3 · ${Math.max(1, Math.round(meeting.durationSec / 60))} min meeting · ${wordCount} words · ${speakerCount} speaker${speakerCount === 1 ? '' : 's'}` : 'Generate a structured summary from this transcript.'}
                  action={meeting.transcript.length ? <Button loading={retrying} onClick={() => void regenerate()}>{meeting.summaryStatus === 'failed' ? retrying ? 'Retrying…' : 'Retry' : 'Generate summary'}</Button> : undefined}
                />
              </div>
            ))}
            {tab === 'actions' && <section className="summary-section"><div className="section-heading-row"><h2>Action items</h2><div className="nt-inline-actions"><Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => { const value = window.prompt('Add action item'); if (value?.trim()) void api.todos.add(value, meeting.id).then(refreshMeetingTodos); }}>Add action item</Button>{!!meetingTodos.length && <Button size="sm" variant="ghost" icon={<CheckCircle2 size={14} />} onClick={() => void Promise.all(meetingTodos.map((todo) => api.todos.update(todo.id, { status: 'done' }))).then(refreshMeetingTodos)}>Mark all as completed</Button>}{!!meetingTodos.length && <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => { if (window.confirm(`Archive ${meetingTodos.length === 1 ? 'this action item' : `all ${meetingTodos.length} action items`}? You can restore ${meetingTodos.length === 1 ? 'it' : 'them'} from Archived.`)) void api.todos.archiveMany(meetingTodos.map((todo) => todo.id), true).then(refreshMeetingTodos); }}>Archive all</Button>}<Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>View all in Tasks</Button></div></div>{(meeting.summary?.actionItems ?? []).map((item) => { const todo = meetingTodos.find((entry) => entry.title === item.text); return <div className="action-row" key={item.text}><span className="nt-grow">{item.text}{item.owner && <span className="nt-subtle"> · {item.owner}</span>}</span>{todo ? <Checkbox checked={todo.status === 'done'} label={todo.status === 'done' ? `Mark ${todo.title} open` : `Mark ${todo.title} completed`} onChange={(checked) => void api.todos.update(todo.id, { status: checked ? 'done' : 'open' }).then(refreshMeetingTodos)} /> : <Button size="sm" variant="outline" onClick={() => void api.todos.add(item.text, meeting.id).then(refreshMeetingTodos)}>Add to My Tasks</Button>}</div>; })}{!(meeting.summary?.actionItems.length || meetingTodos.length) && <p className="nt-subtle">No remaining action items for this meeting.</p>}</section>}
            {activeArtifact && <article className="meeting-artifact"><div className="section-heading-row"><div><div className="summary-kicker">Generated artifact</div><h2>{activeArtifact.title}</h2></div><Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => { if (window.confirm(`Delete “${activeArtifact.title}”?`)) void api.meetings.deleteArtifact(meeting.id, activeArtifact.id).then(load); }}>Delete</Button></div><div className="artifact-content">{activeArtifact.content}</div></article>}
          </section>
        </main>

        <aside className="meeting-rail">
          <MeetingChatRail meetingId={meeting.id} notes={notes} onNotesChange={setNotes} onArtifactCreated={() => void api.meetings.listArtifacts(meeting.id).then(setArtifacts)} />
          <h3>Folders</h3>
          <MeetingFolderPicker meetingId={meeting.id} folders={folders} selectedIds={meeting.folderIds} onChange={(folderIds, nextFolders) => { setMeeting((current) => current ? { ...current, folderIds } : current); if (nextFolders) setFolders(nextFolders); }} />
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => { if (window.confirm('Delete this meeting? Its notes and transcript cannot be recovered.')) void api.meetings.remove(meeting.id).then(() => navigate('/notetaker')); }}>Delete meeting</Button>
        </aside>
      </div>
      <Dialog open={feedback !== null} onClose={() => setFeedback(null)} title={feedback?.rating === 'up' ? 'What worked well?' : 'What could be better?'} description={feedback?.rating === 'up' ? 'Your note is optional and helps you remember what made this summary useful.' : 'Your note is optional. Describe missing details, structure, or wording.'} footer={<><Button variant="ghost" onClick={() => setFeedback(null)}>Cancel</Button><Button onClick={() => { if (!feedback) return; void api.meetings.rateSummary(meeting.id, feedback.rating, feedback.note).then(() => { setFeedback(null); toast('Thanks for your feedback', { tone: 'success' }); }); }}>Send feedback</Button></>}><TextArea aria-label="Feedback note" placeholder="Add an optional note" value={feedback?.note ?? ''} onChange={(event) => setFeedback((current) => current ? { ...current, note: event.target.value } : current)} /></Dialog>
    </Page>
  );
}
