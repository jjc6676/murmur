import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '@shared/types';
import { Archive, Copy, Download, MoreHorizontal, Pause, Play, RefreshCw, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, ConfirmDialog, IconButton, Menu } from '../../ui';
import { toast } from '../state';
import s from './Home.module.css';

const dayKey = (timestamp: string): string => {
  const date = new Date(timestamp);
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
  const [deleting, setDeleting] = useState(false);
  const [playing, setPlaying] = useState(false);
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
      toast('Transcript copied', { tone: 'success' });
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
  return (
    <article className={s.dictationRow} data-status={entry.status}>
      <time className={s.dictationTime}>{new Date(entry.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
      <div className={s.dictationBody}>
        <p className={s.transcript}>{displayText(entry)}</p>
        <span className={s.appLabel}>{entry.appTitle || entry.app || 'Unknown app'}{entry.isArchived ? ' · Archived' : ''}</span>
      </div>
      <div className={s.rowActions}>
        <IconButton label="Copy transcript" onClick={() => void copy()}><Copy size={16} /></IconButton>
        {entry.hasAudio && <IconButton label={playing ? 'Pause audio' : 'Play audio'} onClick={() => void toggleAudio()}>{playing ? <Pause size={16} /> : <Play size={16} />}</IconButton>}
        {(entry.hasAudio || entry.status === 'failed' || entry.status === 'cancelled' || entry.status === 'void') && (
          <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => void retry()}>{entry.status === 'cancelled' || entry.status === 'void' ? 'Recover' : 'Retry'}</Button>
        )}
        <Menu
          trigger={(props) => <IconButton label="More actions" {...props}><MoreHorizontal size={16} /></IconButton>}
          items={[
            entry.hasRevertedAI
              ? { label: 'Redo AI edit', icon: <RotateCw size={15} />, onSelect: () => void mutate(() => api.history.redoAiEdit(entry.id), 'AI edit restored') }
              : { label: 'Undo AI edit', icon: <RotateCcw size={15} />, disabled: entry.asrText === entry.formattedText, onSelect: () => void mutate(() => api.history.undoAiEdit(entry.id), 'AI edit undone') },
            ...(entry.hasAudio ? [{ label: 'Download audio', icon: <Download size={15} />, onSelect: () => void mutate(() => api.history.saveAudioAs(entry.id), 'Audio saved') }] : []),
            { label: entry.isArchived ? 'Restore from archive' : 'Archive', icon: <Archive size={15} />, onSelect: () => void mutate(() => api.history.archive(entry.id, !entry.isArchived), entry.isArchived ? 'Transcript restored' : 'Transcript archived') },
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
    </article>
  );
}

export function DictationList({ entries, onChanged }: { entries: HistoryEntry[]; onChanged: () => void }) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.timestamp);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return (
    <div className={s.dictationGroups}>
      {[...groups.entries()].map(([label, rows]) => (
        <section key={label} aria-labelledby={`dictations-${label}`}>
          <h2 id={`dictations-${label}`} className={s.groupTitle}>{label === 'Today' ? "TODAY'S DICTATIONS" : `${label.toUpperCase()}'S DICTATIONS`}</h2>
          <div className={s.dictationList}>{rows.map((entry) => <DictationRow key={entry.id} entry={entry} onChanged={onChanged} />)}</div>
        </section>
      ))}
    </div>
  );
}
