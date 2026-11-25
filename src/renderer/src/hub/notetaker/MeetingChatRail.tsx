import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, FilePlus2, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MeetingChatMessage, MeetingChatSession } from '@shared/types';
import { api, errorMessage } from '../../lib/api';
import { Button, IconButton, Input, Select } from '../../ui';
import { toast } from '../state';

interface Props {
  meetingId: string;
  notes: string;
  onNotesChange(notes: string): void;
  onArtifactCreated(): void;
}
const SUGGESTED_PROMPTS = [
  { label: 'What did I miss?', prompt: 'What did I miss?' },
  { label: 'Write a follow-up email', prompt: 'Write a concise follow-up email summarizing the meeting, decisions, owners, and next steps.' },
  { label: 'Identify blind spots', prompt: 'Identify blind spots, unstated assumptions, risks, and unresolved issues in this meeting.' },
  { label: 'Make notes longer', prompt: 'Expand the meeting notes with useful context and detail from the transcript without inventing facts.' },
  { label: 'Make me sound smart', prompt: 'Rewrite the key takeaways as clear, polished, insightful notes while preserving the meeting facts.' },
  { label: 'Suggest questions', prompt: 'Suggest thoughtful follow-up questions based on unresolved topics and decisions in this meeting.' },
] as const;


export function MeetingChatRail({ meetingId, notes, onNotesChange, onArtifactCreated }: Props) {
  const [sessions, setSessions] = useState<MeetingChatSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [incompleteQuestion, setIncompleteQuestion] = useState<string | null>(null);
  const [artifactMessageId, setArtifactMessageId] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  const loadSessions = useCallback(async () => {
    const rows = await api.meetings.chatSessions(meetingId);
    setSessions(rows);
    setSessionId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '');
  }, [meetingId]);
  useEffect(() => { void loadSessions(); }, [loadSessions]);
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    void api.meetings.chatHistory(meetingId, sessionId).then(setMessages).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' }));
  }, [meetingId, sessionId]);

  const runQuestion = async (text: string) => {
    if (!text.trim() || !sessionId || asking) return;
    const id = crypto.randomUUID();
    requestId.current = id;
    setQuestion('');
    setIncompleteQuestion(null);
    setAsking(true);
    try {
      const next = await api.meetings.chat(meetingId, sessionId, text, id);
      setMessages((current) => [...current, ...next]);
      await loadSessions();
    } catch (error) {
      setIncompleteQuestion(text);
      toast(errorMessage(error), { tone: 'error' });
    } finally {
      if (requestId.current === id) {
        requestId.current = null;
        setAsking(false);
      }
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runQuestion(question);
  };
  const addArtifact = async (message: MeetingChatMessage) => {
    const title = window.prompt('Section name', 'Artifact');
    if (title === null) return;
    setArtifactMessageId(message.id);
    try {
      const artifact = await api.meetings.createArtifact(meetingId, message.id, title);
      toast(`Created artifact: ${artifact.title}`, { tone: 'success' });
      onArtifactCreated();
    } catch (error) {
      toast(`Couldn’t create section: ${errorMessage(error)}`, { tone: 'error' });
    } finally {
      setArtifactMessageId(null);
    }
  };
  const newChat = async () => {
    const session = await api.meetings.createChatSession(meetingId);
    await loadSessions();
    setSessionId(session.id);
  };
  const renameChat = async () => {
    const current = sessions.find((session) => session.id === sessionId);
    if (!current) return;
    const title = window.prompt('Rename chat', current.title);
    if (!title?.trim()) return;
    await api.meetings.renameChatSession(meetingId, current.id, title);
    await loadSessions();
  };
  const deleteChat = async () => {
    const current = sessions.find((session) => session.id === sessionId);
    if (!current || !window.confirm(`Delete “${current.title}” and its entire chat history? This can’t be undone.`)) return;
    try {
      await api.meetings.deleteChatSession(meetingId, current.id);
      setSessionId('');
      await loadSessions();
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
    }
  };

  return (
    <div className="meeting-chat">
      <div className="chat-session-heading"><h2><MessageCircle size={17} /> Ask anything</h2><Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => void newChat()}>New chat</Button></div>
      <div className="chat-session-controls">
        <Select value={sessionId} options={sessions.map((session) => ({ value: session.id, label: session.title }))} onChange={setSessionId} ariaLabel="Chat session" />
        <IconButton size="sm" label="Rename chat" onClick={() => void renameChat()}><Pencil size={13} /></IconButton>
        <IconButton size="sm" label="Delete chat" onClick={() => void deleteChat()}><Trash2 size={13} /></IconButton>
      </div>
      <div className="chat-log" aria-live="polite" aria-busy={asking}>
        {!messages.length && <div className="chat-suggestions">{SUGGESTED_PROMPTS.map(({ label, prompt }) => <Button key={label} size="sm" variant="outline" onClick={() => void runQuestion(prompt)}>{label}</Button>)}</div>}
        {messages.map((message) => <div className="chat-bubble" data-role={message.role} key={message.id}><div>{message.content}</div>{message.role === 'assistant' && message.status !== 'stopped' && <div className="chat-message-actions"><Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => void api.app.copyText(message.content).then(() => toast('Response copied', { tone: 'success' }))}>Copy</Button><Button size="sm" variant="ghost" onClick={() => { const next = `${notes}${notes ? '\n\n' : ''}${message.content}`; onNotesChange(next); void api.meetings.updateNotes(meetingId, next).then(() => toast('Updated meeting notes.')); }}>Add to notes</Button><Button size="sm" variant="ghost" icon={<FilePlus2 size={13} />} loading={artifactMessageId === message.id} onClick={() => void addArtifact(message)}>{artifactMessageId === message.id ? 'Generating…' : 'Create section'}</Button><Button size="sm" variant="ghost" onClick={() => void api.meetings.saveChatFact(meetingId, message.id).then(() => toast('Saved to Memory', { tone: 'success' }))}>Save fact</Button></div>}</div>)}
        {incompleteQuestion && <div className="chat-bubble incomplete"><strong>This response did not complete</strong><Button size="sm" variant="ghost" onClick={() => void runQuestion(incompleteQuestion)}>Retry</Button></div>}
      </div>
      <form className="chat-form" onSubmit={submit}><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything, or type / for Skills" aria-label="Ask about this meeting" />{asking ? <Button type="button" variant="outline" onClick={() => { if (requestId.current) void api.meetings.cancelChat(requestId.current); }}>Stop</Button> : <Button type="submit">Send</Button>}</form>
      <div className="skill-hints">Try /follow-up-email · /decision-log · /open-questions</div>
    </div>
  );
}
