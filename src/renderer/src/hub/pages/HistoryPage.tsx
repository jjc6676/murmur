import { useCallback, useEffect, useState } from 'react';
import type { HistoryEntry } from '@shared/types';
import { History } from 'lucide-react';
import { api, useEvent } from '../../lib/api';
import { Checkbox, EmptyState, Page, PageHeader, SearchInput } from '../../ui';
import { DictationList } from '../home/DictationList';
import s from '../home/Home.module.css';

export function HistoryPage() {
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const refresh = useCallback(() => {
    void api.history.list({ query: query || undefined, includeArchived, limit: 500 }).then(setEntries);
  }, [includeArchived, query]);
  useEffect(refresh, [refresh]);
  useEvent('history:changed', refresh);
  return (
    <Page wide>
      <PageHeader title="History" />
      <div className={s.historyTools}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search past transcripts" />
        <Checkbox checked={includeArchived} onChange={setIncludeArchived} label="Include archived" />
      </div>
      {entries.length ? (
        <DictationList entries={entries} onChanged={refresh} />
      ) : (
        <EmptyState icon={<History size={32} />} title={query ? 'No matching dictations' : 'No dictations yet'} body={query ? `Nothing matched “${query}”.` : 'Your full dictation archive will appear here.'} />
      )}
    </Page>
  );
}
