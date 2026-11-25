import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, Folder, MessageCircle, RotateCcw, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Folder as FolderType, Meeting, MeetingChatMessage } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Button, Checkbox, EmptyState, IconButton, Input, Page, Select, Tabs, TextArea } from '../../ui';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { toast } from '../state';
import '../notetaker/notetaker.css';

type MeetingTab = 'thoughts' | 'transcript' | 'summary';
const TEMPLATES = ['auto', '1:1', 'team meeting', 'sales call', 'interview', 'lecture', 'client call'];

export function MeetingPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const patchSettings = usePatchSettings();
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
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const [next, folderRows, history] = await Promise.all([api.meetings.get(id), api.meetings.listFolders(), api.meetings.chatHistory(id)]);
    setMeeting(next);
    setFolders(folderRows);
    setMessages(history);
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
          <div className="meeting-meta">{new Date(meeting.createdAt).toLocaleString()} · {Math.max(1, Math.round(meeting.durationSec / 60))} min</div>
          <Tabs tabs={[{ id: 'thoughts', label: 'My thoughts' }, { id: 'transcript', label: 'Transcript' }, { id: 'summary', label: 'Summary' }]} value={tab} onChange={setTab} />

          <section className="meeting-panel">
            {tab === 'thoughts' && (
              <TextArea className="thoughts-editor" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void api.meetings.updateNotes(meeting.id, notes).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' }))} placeholder="Write your notes here. We'll make a separate summary at the end." />
            )}
            {tab === 'transcript' && (
              <>
                <div className="transcript-tools"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transcript" aria-label="Search transcript" />{search && <><span className="nt-subtle">{filteredSegments.length ? matchIndex + 1 : 0}/{filteredSegments.length}</span><Button size="sm" variant="ghost" aria-label="Previous transcript match" icon={<ChevronLeft size={14} />} onClick={() => setMatchIndex((current) => filteredSegments.length ? (current - 1 + filteredSegments.length) % filteredSegments.length : 0)} /><Button size="sm" variant="ghost" aria-label="Next transcript match" icon={<ChevronRight size={14} />} onClick={() => setMatchIndex((current) => filteredSegments.length ? (current + 1) % filteredSegments.length : 0)} /></>}</div>
                {filteredSegments.map((segment) => (
                  <div className="transcript-line" key={segment.id}>
                    <button type="button" className="speaker-chip" onClick={() => { const name = window.prompt('Speaker name', segment.speakerName); if (name) void api.meetings.renameSpeaker(meeting.id, segment.speaker, name).then(setMeeting); }}>{segment.speakerName}</button>
                    <div className="segment-text">{segment.text}{segment.translatedText && <span className="segment-translation">{segment.translatedText} <button type="button" className="inline-link" onClick={() => void api.app.copyText(segment.originalText ?? segment.text)}>Copy original</button></span>}{segment.edited && <span className="nt-subtle"> · Edited</span>}</div>
                    <div className="nt-inline-actions"><Button size="sm" variant="ghost" onClick={() => { const text = window.prompt('Edit transcript', segment.text); if (text) void api.meetings.correctSegment(meeting.id, segment.id, segment.text, text).then(setMeeting).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' })); }}>Edit</Button>{segment.edited && <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => void api.meetings.revertSegment(meeting.id, segment.id).then(setMeeting)}>Revert</Button>}</div>
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
                <section className="summary-section"><h2>Action items</h2>{meeting.summary.actionItems.map((item) => <div className="action-row" key={item.text}><span className="nt-grow">{item.text}{item.owner && <span className="nt-subtle"> · {item.owner}</span>}</span><Button size="sm" variant="outline" onClick={() => void api.todos.add(item.text, meeting.id).then(() => toast('Added to My Tasks', { tone: 'success' }))}>Add to My Tasks</Button></div>)}</section>
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
            {messages.map((message) => <div className="chat-bubble" data-role={message.role} key={message.id}><div>{message.content}</div>{message.role === 'assistant' && <div className="chat-message-actions"><Button size="sm" variant="ghost" onClick={() => { const next = `${notes}${notes ? '\n\n' : ''}${message.content}`; setNotes(next); void api.meetings.updateNotes(meeting.id, next).then(() => toast('Updated meeting notes.')); }}>Add to notes</Button><Button size="sm" variant="ghost" onClick={() => void api.meetings.saveChatFact(meeting.id, message.id).then(() => toast('Saved to memory'))}>Save fact</Button></div>}</div>)}
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
