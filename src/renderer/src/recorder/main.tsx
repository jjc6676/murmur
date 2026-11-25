import { createRoot } from 'react-dom/client';
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AudioLines, Columns2, Copy, Expand, Maximize2, Minus, Pause, Play, RotateCw, Square, X } from 'lucide-react';
import type { Meeting, MeetingListItem, RecorderState, TranscriptSegment } from '@shared/types';
import '../styles/base.css';
import '../hub/notetaker/notetaker.css';
import { api, useEvent } from '../lib/api';
import { initSettings, usePatchSettings, useSettings } from '../lib/settings';
import { Button, Dialog, IconButton, Select, Tabs, TextArea } from '../ui';

type RecorderTab = 'thoughts' | 'transcript' | 'summary';
const IDLE: RecorderState = { phase: 'idle', meetingId: null, startedAt: null, elapsedSec: 0, micLevel: 0, systemLevel: 0, liveSegments: [], error: null, hasCapturedAudio: false, systemAudioAvailable: true, micSilentSec: 0, storageLow: false, sleepGapSec: 0, processingPhase: null };

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}
class RecorderErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Recorder renderer crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return <div className="recorder-crash"><h1>Something went wrong</h1><p>Reload to keep recording. Your audio is still being saved safely.</p><Button icon={<RotateCw size={16} />} onClick={() => window.location.reload()}>Reload</Button></div>;
  }
}


function RecorderApp() {
  const settings = useSettings();
  const patchSettings = usePatchSettings();
  const [state, setState] = useState<RecorderState>(IDLE);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [recent, setRecent] = useState<MeetingListItem[]>([]);
  const [tab, setTab] = useState<RecorderTab>('thoughts');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(true);
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [shortCaptureOpen, setShortCaptureOpen] = useState(true);
  const [autoHidePrompt, setAutoHidePrompt] = useState<'offer' | 'accepted' | null>(null);
  const [summarySuppressionPrompt, setSummarySuppressionPrompt] = useState<'offer' | 'accepted' | null>(null);
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
  useEffect(() => {
    let timer: number | undefined;
    const persistSize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void api.recorder.setWindowSize(window.outerWidth, window.outerHeight), 250);
    };
    window.addEventListener('resize', persistSize);
    return () => {
      window.removeEventListener('resize', persistSize);
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!audioOpen) return;
    void navigator.mediaDevices.enumerateDevices().then((devices) => setAudioInputs(devices.filter((device) => device.kind === 'audioinput')));
  }, [audioOpen]);
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

  const active = ['awaiting_audio', 'recording', 'paused', 'finalizing'].includes(state.phase);
  const segments: TranscriptSegment[] = meeting?.transcript.length ? meeting.transcript : state.liveSegments;
  const capturedWordCount = segments.reduce((total, segment) => total + segment.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const closeNotepad = async () => {
    if (active && settings.notetaker.notepadView !== 'hidden' && !settings.notetaker.autoHidePromptShown) {
      const closeCount = settings.notetaker.earlyNotepadCloseCount + 1;
      await patchSettings({ notetaker: { earlyNotepadCloseCount: closeCount } });
      if (closeCount >= 3) {
        setAutoHidePrompt('offer');
        return;
      }
    }
    await api.app.closeWindow();
  };
  const closeCompletion = async () => {
    setCompletionOpen(false);
    const closeCount = settings.notetaker.autoOpenSummaryCloseCount + 1;
    await patchSettings({ notetaker: { autoOpenSummaryCloseCount: closeCount } });
    if (closeCount >= 3 && settings.notetaker.openSummaryWhenReady) setSummarySuppressionPrompt('offer');
  };

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
          <IconButton label="Audio input and output" size="sm" onClick={() => setAudioOpen(true)}><AudioLines size={15} /></IconButton>
          {state.phase === 'recording' && <IconButton label="Pause" size="sm" onClick={() => void api.recorder.pause()}><Pause size={15} /></IconButton>}
          {state.phase === 'paused' && <IconButton label="Resume" size="sm" onClick={() => void api.recorder.resume()}><Play size={15} /></IconButton>}
          {active && <IconButton label="Stop listening" size="sm" onClick={() => void api.recorder.stop()}><Square size={15} /></IconButton>}
          {active && <IconButton label="Split screen with meeting" size="sm" onClick={() => void api.recorder.splitScreen()}><Columns2 size={15} /></IconButton>}
          <IconButton label="Maximize or restore" size="sm" onClick={() => void api.recorder.toggleMaximize()}><Maximize2 size={15} /></IconButton>
          <IconButton label="Full screen" size="sm" onClick={() => void api.recorder.toggleFullScreen()}><Expand size={15} /></IconButton>
          <IconButton label="Minimize" size="sm" onClick={() => void api.app.minimizeWindow()}><Minus size={15} /></IconButton>
          <IconButton label="Close" size="sm" onClick={() => void closeNotepad()}><X size={15} /></IconButton>
        </div>
      </header>
      {state.phase === 'awaiting_audio' && <div className="recorder-banner" role="status"><strong>Waiting for audio…</strong><span>Notetaker will start the timer when your first audio arrives.</span></div>}
      {active && settings.notetaker.meetingCount === 0 && !settings.notetaker.hideInScreenCapture && <div className="recorder-banner" role="status"><span><strong>Sharing your screen?</strong> The Flow Bar and Notepad can appear in screen shares and screenshots.</span><Button size="sm" variant="outline" onClick={() => void patchSettings({ notetaker: { hideInScreenCapture: true } })}>Hide in screen shares</Button></div>}
      {!state.systemAudioAvailable && active && <div className="recorder-banner warning" role="alert"><span><strong>Only your microphone is recording.</strong> Remote participants may be missing.</span><Button size="sm" variant="outline" onClick={() => void api.recorder.retrySystemAudio()}>Turn on system audio</Button></div>}
      {state.micSilentSec >= 180 && active && <div className="recorder-banner warning" role="alert"><strong>Microphone unavailable</strong><span>Stop and resume the meeting to reconnect your microphone.</span></div>}
      {state.storageLow && <div className="recorder-banner warning" role="alert"><strong>Storage almost full</strong><span>Free up space on your computer to keep recording.</span></div>}
      {settings.notetaker.translationLanguage && <div className="recorder-banner"><span>Translating to {settings.notetaker.translationLanguage}. Your original transcript is preserved.</span><Button size="sm" variant="ghost" onClick={() => void patchSettings({ notetaker: { translationLanguage: null } })}>Turn off</Button></div>}
      {settings.notetaker.consentChatNotice && <div className="consent">Always get consent when transcribing others. <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => { setCopyStatus(null); void api.app.copyText(settings.notetaker.consentMessage).then(() => setCopyStatus('Consent message copied')).catch(() => setCopyStatus('Couldn’t copy consent message')); }}>Copy consent message</Button>{copyStatus && <span role="status">{copyStatus}</span>}</div>}
      {state.error && <div className="recorder-banner warning" role="alert"><span>{state.error}</span><div className="nt-inline-actions"><Button size="sm" variant="outline" onClick={() => void api.recorder.retrySystemAudio()}>Try again</Button>{meeting && <Button size="sm" variant="ghost" onClick={() => void api.recorder.stop().then(() => api.meetings.remove(meeting.id)).then(() => api.app.closeWindow())}>Discard</Button>}</div></div>}
      <div className="recorder-tabs"><Tabs tabs={[{ id: 'thoughts', label: 'My thoughts' }, ...(settings.notetaker.showLiveTranscript ? [{ id: 'transcript' as const, label: 'Transcript' }] : []), { id: 'summary', label: 'Summary' }]} value={tab} onChange={setTab} /></div>
      {tab === 'thoughts' && !settings.dismissedBanners.includes('notetaker:first-notes') && <div className="recorder-banner" role="status"><span><strong>Take your own notes here.</strong> They stay private and separate from Murmur’s generated summary.</span><Button size="sm" variant="ghost" onClick={() => void patchSettings({ dismissedBanners: [...settings.dismissedBanners, 'notetaker:first-notes'] })}>Got it</Button></div>}
      <div className="recorder-body" ref={scrollRef}>
        {tab === 'thoughts' && <><TextArea className="thoughts-editor" value={notes} onChange={(event) => { setNotes(event.target.value); setSaveFailed(false); }} onBlur={() => { if (meeting) void api.meetings.updateNotes(meeting.id, notes).catch(() => setSaveFailed(true)); }} placeholder="Write your notes here. We'll make a separate summary at the end." />{saveFailed && <span className="save-failed" role="alert">Couldn't save changes.</span>}{meeting?.summary && <button type="button" className="summary-ready-link" onClick={() => setTab('summary')}>Your summary is ready. Check it out →</button>}</>}
        {tab === 'transcript' && <div className="recorder-transcript">{segments.length ? <><p className="nt-subtle">After the meeting, Murmur improves the transcript and adds speaker names.</p>{segments.map((segment, index) => <div className="recorder-segment" key={segment.id}><span className="speaker-chip" title="Speaker names will be added after the meeting" style={{ color: `var(--speaker-${index % 8 + 1})` }}>{segment.speakerName}</span><div>{segment.text}{segment.translatedText && <span className="segment-translation">{segment.translatedText}</span>}</div></div>)}</> : <div className="nt-empty"><strong>Welcome to Notetaker!</strong><span className="nt-subtle">Try saying “Hi Notetaker”.</span><span className="nt-subtle">You're offline? Don’t worry, we’re still saving audio locally.</span></div>}</div>}
        {tab === 'summary' && (meeting?.summary ? <><div className="summary-kicker">Enhanced Summary</div><p className="summary-overview">{meeting.summary.overview}</p>{meeting.summary.sections.map((section) => <section className="summary-section" key={section.heading}><h2>{section.heading}</h2><ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></section>)}</> : <div className="nt-empty"><strong>{state.processingPhase === 'transcribing' ? 'Transcribing audio…' : state.processingPhase === 'refining' ? 'Refining transcript…' : state.processingPhase === 'summarizing' ? 'Summarizing meeting…' : state.phase === 'finalizing' ? 'Finishing up…' : 'Summary appears after you stop'}</strong><span className="nt-subtle">Murmur turns your meeting into a quick read with decisions and next steps.</span></div>)}
      </div>
      <Dialog open={completionOpen && state.phase === 'done' && Boolean(meeting?.summary) && settings.notetaker.meetingCount === 1} onClose={() => void closeCompletion()} title="Your first meeting note is ready!" description="Murmur captured the conversation and created a quick summary." footer={<><Button variant="ghost" onClick={() => void closeCompletion()}>Not now</Button><Button onClick={() => { setTab('summary'); setCompletionOpen(false); }}>Open meeting note</Button></>}><div className="completion-celebration"><strong>2 min read</strong></div></Dialog>
      <Dialog open={audioOpen} onClose={() => setAudioOpen(false)} title="Audio" description="Choose what Murmur records for this meeting." footer={<Button onClick={() => setAudioOpen(false)}>Done</Button>}>
        <div className="audio-selector">
          <label>Input</label>
          <Select value={settings.micDeviceId} options={[{ value: 'default', label: 'System default microphone' }, ...audioInputs.filter((device) => device.deviceId !== 'default').map((device, index) => ({ value: device.deviceId, label: device.label || `Microphone ${index + 1}` }))]} onChange={(value) => void patchSettings({ micDeviceId: value }).then(() => { if (active) return api.recorder.retrySystemAudio(); })} ariaLabel="Input device" />
          <label>Output</label>
          <Select value="system" options={[{ value: 'system', label: 'Windows system audio' }]} onChange={() => undefined} ariaLabel="Output device" />
          <span className="nt-subtle">Output capture follows the device selected in Windows.</span>
        </div>
      </Dialog>
      <Dialog open={shortCaptureOpen && state.phase === 'done' && Boolean(meeting) && !meeting?.isTourDemo && capturedWordCount > 0 && capturedWordCount <= 10} onClose={() => setShortCaptureOpen(false)} title="Started by mistake?" description="This meeting only captured a few words. Keep it in your notes or discard it now." footer={<><Button variant="ghost" onClick={() => setShortCaptureOpen(false)}>Keep</Button><Button variant="danger" onClick={() => { if (meeting) void api.meetings.remove(meeting.id).then(() => api.app.closeWindow()); }}>Discard</Button></>} />
      <Dialog open={autoHidePrompt !== null} onClose={() => setAutoHidePrompt(null)} title={autoHidePrompt === 'accepted' ? 'Notepad hidden by default' : 'Hide Notepad when meetings start?'} description={autoHidePrompt === 'accepted' ? 'You can still open the live meeting note whenever you need it.' : 'You’ve closed Notepad soon after starting several meetings. Murmur can keep it hidden by default.'} footer={autoHidePrompt === 'accepted' ? <><Button variant="ghost" onClick={() => { void patchSettings({ notetaker: { notepadView: 'open', autoHidePromptShown: false } }); setAutoHidePrompt(null); }}>Undo</Button><Button onClick={() => setAutoHidePrompt(null)}>Done</Button></> : <><Button variant="ghost" onClick={() => { void patchSettings({ notetaker: { autoHidePromptShown: true } }); setAutoHidePrompt(null); void api.app.closeWindow(); }}>Keep showing</Button><Button onClick={() => { void patchSettings({ notetaker: { notepadView: 'hidden', autoHidePromptShown: true } }); setAutoHidePrompt('accepted'); }}>Hide by default</Button></>} />
      <Dialog open={summarySuppressionPrompt !== null} onClose={() => setSummarySuppressionPrompt(null)} title={summarySuppressionPrompt === 'accepted' ? 'Summary auto-open turned off' : "Don't open summary after meetings?"} description={summarySuppressionPrompt === 'accepted' ? 'Your summaries remain available in Notetaker.' : 'You’ve closed several auto-opened summaries. Murmur can leave them in Notetaker without opening this window.'} footer={summarySuppressionPrompt === 'accepted' ? <><Button variant="ghost" onClick={() => { void patchSettings({ notetaker: { openSummaryWhenReady: true, autoOpenSummaryCloseCount: 0 } }); setSummarySuppressionPrompt(null); }}>Undo</Button><Button onClick={() => setSummarySuppressionPrompt(null)}>Done</Button></> : <><Button variant="ghost" onClick={() => setSummarySuppressionPrompt(null)}>Keep opening</Button><Button onClick={() => { void patchSettings({ notetaker: { openSummaryWhenReady: false } }); setSummarySuppressionPrompt('accepted'); }}>Don’t open summaries</Button></>} />
    </div>
  );
}

void initSettings().then(() => createRoot(document.getElementById('root')!).render(<RecorderErrorBoundary><RecorderApp /></RecorderErrorBoundary>));
