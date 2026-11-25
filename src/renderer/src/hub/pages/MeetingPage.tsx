import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Copy, Download, Folder, MessageCircle, Search, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Folder as FolderType, Meeting, MeetingChatMessage } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Button, Checkbox, EmptyState, Input, Page, Select, Tabs, TextArea } from '../../ui';
import { toast } from '../state';
import '../notetaker/notetaker.css';

type MeetingTab = 'thoughts' | 'transcript' | 'summary';
const TEMPLATES = ['auto', '1:1', 'team meeting', 'sales call', 'interview', 'lecture', 'client call'];

export function MeetingPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [tab, setTab] = useState<MeetingTab>('summary');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [template, setTemplate] = useState('auto');
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

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

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim() || asking) return;
    const text = question;
    setQuestion('');
    setAsking(true);
    try {
      const next = await api.meetings.chat(id, text);
      setMessages((current) => [...current, ...next]);
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
    } finally {
      setAsking(false);
    }
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
                <div className="transcript-tools"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transcript" aria-label="Search transcript" /></div>
                {filteredSegments.map((segment) => (
                  <div className="transcript-line" key={segment.id}>
                    <button type="button" className="speaker-chip" onClick={() => { const name = window.prompt('Speaker name', segment.speakerName); if (name) void api.meetings.renameSpeaker(meeting.id, segment.speaker, name).then(setMeeting); }}>{segment.speakerName}</button>
                    <div className="segment-text">{segment.text}{segment.translatedText && <span className="segment-translation">{segment.translatedText}</span>}{segment.edited && <span className="nt-subtle"> · Edited</span>}</div>
                    <Button size="sm" variant="ghost" onClick={() => { const text = window.prompt('Edit transcript', segment.text); if (text) void api.meetings.editSegment(meeting.id, segment.id, text).then(setMeeting); }}>Edit</Button>
                  </div>
                ))}
                {!filteredSegments.length && <EmptyState icon={<Search />} title="No transcript matches" />}
              </>
            )}
            {tab === 'summary' && (meeting.summary ? (
              <>
                <div className="transcript-tools">
                  <Select value={template} options={TEMPLATES.map((value) => ({ value, label: value === 'auto' ? 'Auto' : value.replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} onChange={setTemplate} ariaLabel="Summary template" />
                  <Button size="sm" variant="outline" onClick={() => void api.meetings.regenerateSummary(meeting.id, template).then(setMeeting).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' }))}>Regenerate</Button>
                  <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void api.app.copyText(summaryMarkdown).then(() => toast('Copied summary', { tone: 'success' }))}>Copy markdown</Button>
                  <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => void api.meetings.exportMarkdown(meeting.id)}>Export</Button>
                </div>
                <p className="summary-overview">{meeting.summary.overview}</p>
                {meeting.summary.sections.map((section) => <section className="summary-section" key={section.heading}><h2>{section.heading}</h2><ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></section>)}
                <section className="summary-section"><h2>Action items</h2>{meeting.summary.actionItems.map((item) => <div className="action-row" key={item.text}><span className="nt-grow">{item.text}{item.owner && <span className="nt-subtle"> · {item.owner}</span>}</span><Button size="sm" variant="outline" onClick={() => void api.todos.add(item.text, meeting.id).then(() => toast('Added to My Tasks', { tone: 'success' }))}>Add to My Tasks</Button></div>)}</section>
              </>
            ) : (
              <EmptyState title={meeting.summaryStatus === 'pending' ? 'Generating summary…' : 'No summary yet'} body="Generate a structured summary from this transcript." action={meeting.transcript.length ? <Button onClick={() => void api.meetings.regenerateSummary(meeting.id).then(setMeeting)}>Generate summary</Button> : undefined} />
            ))}
          </section>
        </main>

        <aside className="meeting-rail">
          <h2><MessageCircle size={17} /> Ask anything</h2>
          <div className="chat-log" aria-live="polite">
            {!messages.length && <span className="nt-subtle">Ask about decisions, next steps, or type / for Skills.</span>}
            {messages.map((message) => <div className="chat-bubble" data-role={message.role} key={message.id}>{message.content}</div>)}
          </div>
          <form className="chat-form" onSubmit={(event) => void ask(event)}><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything, or type / for Skills" aria-label="Ask about this meeting" /><Button type="submit" loading={asking}>Send</Button></form>
          <div className="skill-hints">Try /follow-up-email · /decision-log · /open-questions</div>
          <h3><Folder size={16} /> Folders</h3>
          {folders.map((folder) => <Checkbox key={folder.id} checked={meeting.folderIds.includes(folder.id)} label={folder.name} onChange={(checked) => { const next = checked ? [...meeting.folderIds, folder.id] : meeting.folderIds.filter((folderId) => folderId !== folder.id); void api.meetings.setFolders(meeting.id, next).then(() => setMeeting({ ...meeting, folderIds: next })); }} />)}
          {!folders.length && <span className="nt-subtle">Create folders from the Notetaker library.</span>}
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => { if (window.confirm('Delete this meeting? Its notes and transcript cannot be recovered.')) void api.meetings.remove(meeting.id).then(() => navigate('/notetaker')); }}>Delete meeting</Button>
        </aside>
      </div>
    </Page>
  );
}
