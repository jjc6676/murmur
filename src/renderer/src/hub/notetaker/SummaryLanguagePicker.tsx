import { useState } from 'react';
import type { MeetingSummary } from '@shared/types';
import { api, errorMessage } from '../../lib/api';
import { Button, Select } from '../../ui';
import { toast } from '../state';

export interface SummaryTranslationRow {
  language: string;
  sourceGeneratedAt: string;
  createdAt: string;
  summary: MeetingSummary | null;
}

interface Props {
  meetingId: string;
  detectedLanguage: string;
  original: MeetingSummary;
  translations: SummaryTranslationRow[];
  onTranslationsChange(rows: SummaryTranslationRow[]): void;
  onSummaryChange(summary: MeetingSummary, language: string): void;
}

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Korean', 'Mandarin Chinese'];

export function SummaryLanguagePicker({ meetingId, detectedLanguage, original, translations, onTranslationsChange, onSummaryChange }: Props) {
  const [selected, setSelected] = useState('original');
  const [state, setState] = useState<'idle' | 'switching' | 'generating' | 'updating'>('idle');
  const active = translations.find((row) => row.language === selected);
  const stale = Boolean(active && active.sourceGeneratedAt !== original.generatedAt);

  const choose = async (language: string, forceUpdate = false) => {
    setSelected(language);
    if (language === 'original' || language === 'auto') {
      setState('switching');
      onSummaryChange(original, language === 'auto' ? `Auto (${detectedLanguage || 'detected'})` : 'Original');
      setState('idle');
      return;
    }
    const latest = translations.find((row) => row.language === language);
    const existing = translations.find((row) => row.language === language && row.sourceGeneratedAt === original.generatedAt);
    if (existing?.summary) {
      setState('switching');
      onSummaryChange(existing.summary, language);
      setState('idle');
      return;
    }
    if (latest && !forceUpdate) {
      onSummaryChange(original, 'Original');
      return;
    }
    setState(latest ? 'updating' : 'generating');
    onSummaryChange(original, 'Original');
    try {
      const created = await api.meetings.translateSummary(meetingId, language);
      const next = [created, ...translations.filter((row) => row.language !== language || row.sourceGeneratedAt !== created.sourceGeneratedAt)];
      onTranslationsChange(next);
      if (created.summary) onSummaryChange(created.summary, language);
    } catch (error) {
      setSelected('original');
      toast(errorMessage(error), { tone: 'error' });
    } finally {
      setState('idle');
    }
  };

  return (
    <div className="summary-language">
      <Select value={selected} options={[{ value: 'auto', label: `Auto (${detectedLanguage || 'detected language'})` }, { value: 'original', label: 'Original' }, ...LANGUAGES.map((language) => ({ value: language, label: language }))]} onChange={(value) => void choose(value)} ariaLabel="Summary language" />
      {state !== 'idle' && <span role="status" aria-live="polite" className="nt-subtle">{state === 'generating' ? `Generating ${selected} summary…` : state === 'updating' ? `Updating ${selected} summary…` : `Switching to ${selected}…`}</span>}
      {stale && state === 'idle' && selected !== 'original' && <span className="summary-language-stale">This translation needs regeneration. Showing Original. <Button size="sm" variant="ghost" onClick={() => void choose(selected, true)}>Update translation</Button></span>}
    </div>
  );
}
