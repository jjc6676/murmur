import { useMemo, useState } from 'react';
import { FolderPlus, Search, X } from 'lucide-react';
import type { Folder } from '@shared/types';
import { api, errorMessage } from '../../lib/api';
import { Button, Input } from '../../ui';
import { toast } from '../state';

interface Props {
  meetingId: string;
  folders: Folder[];
  selectedIds: string[];
  onChange(ids: string[], folders?: Folder[]): void;
}

export function MeetingFolderPicker({ meetingId, folders, selectedIds, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const selected = folders.filter((folder) => selectedIds.includes(folder.id));
  const visibleChips = expanded ? selected : selected.slice(0, 3);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return folders.filter((folder) => !needle || folder.name.toLowerCase().includes(needle) || folder.description.toLowerCase().includes(needle));
  }, [folders, query]);

  const setFolder = async (folderId: string, checked: boolean) => {
    const next = checked ? [...new Set([...selectedIds, folderId])] : selectedIds.filter((id) => id !== folderId);
    onChange(next);
    try {
      await api.meetings.setFolders(meetingId, next);
    } catch (error) {
      onChange(selectedIds);
      toast(errorMessage(error), { tone: 'error' });
    }
  };
  const create = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const folder = await api.meetings.createFolder(name);
      const nextFolders = [...folders, folder];
      const nextIds = [...selectedIds, folder.id];
      await api.meetings.setFolders(meetingId, nextIds);
      onChange(nextIds, nextFolders);
      setQuery('');
      toast(`Created and added “${folder.name}”`, { tone: 'success' });
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="meeting-folder-picker">
      <div className="folder-chips">
        {visibleChips.map((folder) => <span className="folder-chip" key={folder.id}>{folder.name}<button type="button" aria-label={`Remove ${folder.name}`} onClick={() => void setFolder(folder.id, false)}><X size={12} /></button></span>)}
        {selected.length > 3 && <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show less' : `+${selected.length - 3} more`}</Button>}
      </div>
      <div className="folder-search"><Search size={14} /><Input type="search" aria-label="Search folders" placeholder="Search folders" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="folder-results">
        {filtered.map((folder) => <label key={folder.id}><input type="checkbox" checked={selectedIds.includes(folder.id)} onChange={(event) => void setFolder(folder.id, event.target.checked)} /><span><strong>{folder.name}</strong>{folder.description && <small>{folder.description}</small>}</span></label>)}
        {!filtered.length && query.trim() && <Button size="sm" variant="outline" icon={<FolderPlus size={14} />} loading={creating} onClick={() => void create()}>Create “{query.trim()}”</Button>}
      </div>
    </div>
  );
}
