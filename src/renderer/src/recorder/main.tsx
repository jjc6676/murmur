import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { Copy, Minus, Pause, Play, Square, X } from 'lucide-react';
import type { Meeting, MeetingListItem, RecorderState, TranscriptSegment } from '@shared/types';
import '../styles/base.css';
import '../hub/notetaker/notetaker.css';
import { api, useEvent } from '../lib/api';
import { initSettings, useSettings } from '../lib/settings';
import { Button, IconButton, Tabs, TextArea } from '../ui';

type RecorderTab = 'thoughts' | 'transcript' | 'summary';
const IDLE: RecorderState = { phase: 'idle', meetingId: null, startedAt: null, elapsedSec: 0, micLevel: 0, systemLevel: 0, liveSegments: [], error: null };

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function RecorderApp() {
  const settings = useSettings();
  const [state, setState] = useState<RecorderState>(IDLE);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [recent, setRecent] = useState<MeetingListItem[]>([]);
  const [tab, setTab] = useState<RecorderTab>('thoughts');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMeeting = async (meetingId: string | null) => {
    if (!meetingId) return;
    const next = await api.meetings.get(meetingId);
    setMeeting(next);
    if (next) {
      setTitle(next.title);
      setNotes(next.myNotes);
      if (next.summary) setTab('summary');
    }
  };

  useEffect(() => {
    void Promise.all([api.recorder.getState(), api.meetings.list({ limit: 8 })]).then(([nextState, rows]) => {
      setState(nextState);
      setRecent(rows);
      void loadMeeting(nextState.meetingId);
    });
  }, []);
  useEvent('recorder:state', (next) => {
    setState(next);
    if (next.meetingId && next.meetingId !== meeting?.id) void loadMeeting(next.meetingId);
    if (next.phase === 'done' && next.meetingId) void loadMeeting(next.meetingId);
  });
  useEvent('recorder:segment', (segment) => {
    setMeeting((current) => current ? { ...current, transcript: [...current.transcript, segment].sort((a, b) => a.start - b.start) } : current);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
  });
  useEvent('notepad:open', ({ meetingId }) => void loadMeeting(meetingId));

  const active = ['recording', 'paused', 'finalizing'].includes(state.phase);
  const segments: TranscriptSegment[] = meeting?.transcript.length ? meeting.transcript : state.liveSegments;

  if (!active && !meeting) {
    return (
      <div className="recorder-root">
        <header className="recorder-header"><strong className="nt-grow">Notepad</strong><IconButton label="Close" size="sm" onClick={() => void api.app.closeWindow()}><X size={15} /></IconButton></header>
        <div className="idle-recorder">
          <div><h1>Ready for your next meeting?</h1><p className="nt-subtle">Murmur transcribes locally and turns conversations into clear notes.</p></div>
          <Button onClick={() => void api.recorder.start()}>Start Notetaker</Button>
          <section><h2>Recent notes</h2>{recent.map((item) => <button type="button" className="recent-note" key={item.id} onClick={() => void loadMeeting(item.id)}><strong>{item.title}</strong><div className="nt-subtle">{new Date(item.createdAt).toLocaleString()}</div></button>)}</section>
        </div>
      </div>
    );
  }

  return (
    <div className="recorder-root">
      <header className="recorder-header">
        <input className="recorder-title" aria-label="Meeting title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (meeting && title.trim()) void api.meetings.rename(meeting.id, title).then(setMeeting); }} />
        <span className="recorder-timer">{formatTime(state.elapsedSec || meeting?.durationSec || 0)}</span>
        <div className="levels" aria-label={`Microphone ${Math.round(state.micLevel * 100)}%, system ${Math.round(state.systemLevel * 100)}%`}>
          <span className="level"><span style={{ height: `${Math.min(100, state.micLevel * 100)}%` }} /></span>
          <span className="level"><span style={{ height: `${Math.min(100, state.systemLevel * 100)}%` }} /></span>
        </div>
        <div className="recorder-actions">
          {state.phase === 'recording' && <IconButton label="Pause" size="sm" onClick={() => void api.recorder.pause()}><Pause size={15} /></IconButton>}
          {state.phase === 'paused' && <IconButton label="Resume" size="sm" onClick={() => void api.recorder.resume()}><Play size={15} /></IconButton>}
          {active && <IconButton label="Stop listening" size="sm" onClick={() => void api.recorder.stop()}><Square size={15} /></IconButton>}
          <IconButton label="Minimize" size="sm" onClick={() => void api.app.minimizeWindow()}><Minus size={15} /></IconButton>
          <IconButton label="Close" size="sm" onClick={() => void api.app.closeWindow()}><X size={15} /></IconButton>
        </div>
      </header>
      {settings.notetaker.consentChatNotice && <div className="consent">Always get consent when transcribing others. <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => void api.app.copyText(settings.notetaker.consentMessage)}>Copy consent message</Button></div>}
      {state.error && <div className="consent">{state.error}</div>}
      <div className="recorder-tabs"><Tabs tabs={[{ id: 'thoughts', label: 'My thoughts' }, { id: 'transcript', label: 'Transcript' }, { id: 'summary', label: 'Summary' }]} value={tab} onChange={setTab} /></div>
      <div className="recorder-body" ref={scrollRef}>
        {tab === 'thoughts' && <TextArea className="thoughts-editor" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => { if (meeting) void api.meetings.updateNotes(meeting.id, notes); }} placeholder="Write your notes here. We'll make a separate summary at the end." />}
        {tab === 'transcript' && <div className="recorder-transcript">{segments.length ? segments.map((segment, index) => <div className="recorder-segment" key={segment.id}><span className="speaker-chip" style={{ color: `var(--speaker-${index % 8 + 1})` }}>{segment.speakerName}</span><div>{segment.text}{segment.translatedText && <span className="segment-translation">{segment.translatedText}</span>}</div></div>) : <div className="nt-empty"><strong>Welcome to Notetaker!</strong><span className="nt-subtle">Try saying “Hi Notetaker”.</span></div>}</div>}
        {tab === 'summary' && (meeting?.summary ? <><p className="summary-overview">{meeting.summary.overview}</p>{meeting.summary.sections.map((section) => <section className="summary-section" key={section.heading}><h2>{section.heading}</h2><ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></section>)}</> : <div className="nt-empty"><strong>{state.phase === 'finalizing' ? 'Finishing up…' : 'Summary appears after you stop'}</strong><span className="nt-subtle">Murmur will find decisions and next steps.</span></div>)}
      </div>
    </div>
  );
}

void initSettings().then(() => createRoot(document.getElementById('root')!).render(<RecorderApp />));
