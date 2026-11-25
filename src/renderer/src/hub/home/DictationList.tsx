import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '@shared/types';
import { Archive, Copy, Download, MessageSquare, MoreHorizontal, Pause, Play, RefreshCw, RotateCcw, RotateCw, ScanText, Trash2 } from 'lucide-react';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Button, ConfirmDialog, Dialog, Field, IconButton, Menu, TextArea } from '../../ui';
import { toast } from '../state';
import { useSettings } from '../../lib/settings';
import s from './Home.module.css';

const dayKey = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

function displayText(entry: HistoryEntry): string {
  if (entry.status === 'empty') return 'No words were detected in this dictation.';
  if (entry.status === 'cancelled' || entry.status === 'void') return 'This transcription was dismissed. You can recover it while audio is available.';
  if (entry.status === 'failed') return entry.error ? `Transcription failed: ${entry.error}` : 'This transcription failed. Try it again.';
  return entry.editedText || entry.formattedText || entry.asrText || 'Empty transcript';
}

function DictationRow({ entry, onChanged }: { entry: HistoryEntry; onChanged: () => void }) {
  const settings = useSettings();
  const [dictating, setDictating] = useState(false);
  useEvent('dictation:state', (state) => setDictating(!['hidden', 'resting', 'completed', 'error'].includes(state.phase)));
  const [deleting, setDeleting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [expectedText, setExpectedText] = useState(displayText(entry));
  const [comments, setComments] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      URL.revokeObjectURL(audio.src);
    }
  }, []);
  const copy = async () => {
    const text = displayText(entry);
    if (!text) return toast('Nothing to copy', { tone: 'warning' });
    try {
      await navigator.clipboard.writeText(text);
      const pasteShortcut = settings.shortcuts.pasteLast[0];
      toast('Transcript copied', { body: pasteShortcut ? `You can also paste your last transcript with ${pasteShortcut}.` : undefined, tone: 'success' });
    } catch (error) {
      toast('Couldn’t copy transcript', { body: errorMessage(error), tone: 'error' });
    }
  };
  const toggleAudio = async () => {
    if (audioRef.current) {
      if (playing) audioRef.current.pause();
      else await audioRef.current.play();
      setPlaying(!playing);
      return;
    }
    const bytes = await api.history.getAudio(entry.id);
    if (!bytes) return toast('Audio is no longer available', { tone: 'warning' });
    const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
    audio.onended = () => setPlaying(false);
    audioRef.current = audio;
    await audio.play();
    setPlaying(true);
  };
  const retry = async () => {
    try {
      await api.dictation.retry(entry.id);
      toast('Transcript recovered', { tone: 'success' });
      onChanged();
    } catch (error) {
      toast('Retry failed', { body: errorMessage(error), tone: 'error' });
    }
  };
  const mutate = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      toast(message, { tone: 'success' });
      onChanged();
    } catch (error) {
      toast('Couldn’t update transcript', { body: errorMessage(error), tone: 'error' });
    }
  };
  const submitReport = async () => {
    try {
      await api.history.report(entry.id, { expectedText, comments });
      toast('Report saved locally', {
        body: 'Your feedback stays on this device and can be exported.',
        tone: 'success',
        actions: [{ label: 'Export', onClick: () => void api.history.exportFeedback() }],
      });
      setReportOpen(false);
      onChanged();
    } catch (error) {
      toast('Couldn’t save report', { body: errorMessage(error), tone: 'error' });
    }
  };
  let sourceHost = '';
  if (entry.appUrl) {
    try { sourceHost = new URL(entry.appUrl).host; }
    catch { sourceHost = entry.appUrl; }
  }
  return (
    <article className={s.dictationRow} data-status={entry.status}>
      <time className={s.dictationTime}>{Number.isFinite(new Date(entry.timestamp).getTime()) ? new Date(entry.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '12:00 AM'}</time>
      <div className={s.dictationBody}>
        <p className={s.transcript}>{displayText(entry)}</p>
        <span className={s.appLabel} title={entry.appUrl ?? undefined}>{entry.appTitle || entry.app || 'Unknown app'}{sourceHost ? ` · ${sourceHost}` : ''}{entry.isArchived ? ' · Archived' : ''}</span>
      </div>
      <div className={s.rowActions}>
        <IconButton label="Copy transcript" onClick={() => void copy()}><Copy size={16} /></IconButton>
        {entry.hasAudio && <IconButton label={playing ? 'Pause audio' : 'Play audio'} onClick={() => void toggleAudio()}>{playing ? <Pause size={16} /> : <Play size={16} />}</IconButton>}
        {(entry.hasAudio || entry.status === 'failed' || entry.status === 'cancelled' || entry.status === 'void') && (
          <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} disabled={dictating} title={dictating ? 'Finish dictating before retrying a transcript' : undefined} onClick={() => void retry()}>{entry.status === 'cancelled' || entry.status === 'void' ? 'Recover' : `Retry · ${entry.duration < 60 ? `${Math.max(1, Math.ceil(entry.duration))} sec` : `${Math.ceil(entry.duration / 60)} min`}`}</Button>
        )}
        <Menu
          trigger={(props) => <IconButton label="More actions" {...props}><MoreHorizontal size={16} /></IconButton>}
          items={[
            entry.hasRevertedAI
              ? { label: 'Redo AI edit', icon: <RotateCw size={15} />, onSelect: () => void mutate(() => api.history.redoAiEdit(entry.id), 'AI edit restored') }
              : { label: 'Undo AI edit', icon: <RotateCcw size={15} />, disabled: entry.asrText === entry.formattedText, onSelect: () => void mutate(() => api.history.undoAiEdit(entry.id), 'AI edit undone') },
            ...(entry.hasAudio ? [{ label: 'Download audio', icon: <Download size={15} />, onSelect: () => void mutate(() => api.history.saveAudioAs(entry.id), 'Audio saved') }] : []),
            { label: entry.isArchived ? 'Restore from archive' : 'Archive', icon: <Archive size={15} />, onSelect: () => void mutate(() => api.history.archive(entry.id, !entry.isArchived), entry.isArchived ? 'Transcript restored' : 'Transcript archived') },
            { label: 'Send feedback', icon: <MessageSquare size={15} />, onSelect: () => setReportOpen(true) },
            { label: 'Open AX inspector', icon: <ScanText size={15} />, onSelect: () => setInspectorOpen(true) },
            { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => setDeleting(true) },
          ]}
        />
      </div>
      <ConfirmDialog
        open={deleting}
        title="Delete transcript?"
        body="Once deleted, this transcript and its audio cannot be recovered."
        confirmLabel="Yes, delete it"
        danger
        onClose={() => setDeleting(false)}
        onConfirm={() => void mutate(() => api.history.delete(entry.id), 'Transcript deleted').then(() => setDeleting(false))}
      />
      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report to Improve Model"
        description="Describe what Murmur should have produced. This report is saved locally."
        footer={<><Button variant="ghost" onClick={() => setReportOpen(false)}>Cancel</Button><Button onClick={() => void submitReport()}>Save report</Button></>}
      >
        <div className={s.reportForm}>
          <Field label="Original transcription"><TextArea value={entry.asrText} readOnly rows={4} /></Field>
          <Field label="Expected output"><TextArea aria-label="Expected output" value={expectedText} onChange={(event) => setExpectedText(event.target.value)} rows={5} /></Field>
          <Field label="Bug comments"><TextArea aria-label="Bug comments" value={comments} onChange={(event) => setComments(event.target.value)} rows={4} /></Field>
        </div>
      </Dialog>
      <Dialog open={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Accessibility context">
        {entry.accessibilityContext ? <pre className={s.contextDump}>{entry.accessibilityContext}</pre> : <p>No accessibility context was captured for this dictation.</p>}
      </Dialog>
    </article>
  );
}

export function DictationList({ entries, onChanged, hideFirstHeading = false }: { entries: HistoryEntry[]; onChanged: () => void; hideFirstHeading?: boolean }) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.timestamp);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return (
    <div className={s.dictationGroups}>
      {[...groups.entries()].map(([label, rows], index) => {
        const heading = label === 'Today' ? "TODAY'S DICTATIONS" : `${label.toUpperCase()}'S DICTATIONS`;
        const showHeading = !hideFirstHeading || index > 0;
        return (
          <section key={label} aria-label={showHeading ? undefined : heading} aria-labelledby={showHeading ? `dictations-${label}` : undefined}>
            {showHeading && <h2 id={`dictations-${label}`} className={s.groupTitle}>{heading}</h2>}
            <div className={s.dictationList}>{rows.map((entry) => <DictationRow key={entry.id} entry={entry} onChanged={onChanged} />)}</div>
          </section>
        );
      })}
    </div>
  );
}
