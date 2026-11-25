import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, FileAudio, Folder, Import, Search, Settings, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CalendarEvent, Folder as FolderType, MeetingListItem } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Button, ConfirmDialog, Dialog, EmptyState, IconButton, Input, Page, PageHeader, Tabs } from '../../ui';
import { toast, useHubUi } from '../state';
import '../notetaker/notetaker.css';

type View = 'past' | 'shared' | 'folders';

export function NotetakerPage() {
  const openSettings = useHubUi((state) => state.openSettings);
  const [view, setView] = useState<View>('past');
  const [query, setQuery] = useState('');
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [folderEditor, setFolderEditor] = useState<{ id: string | null; name: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderType | null>(null);

  const refresh = useCallback(async () => {
    const [meetingRows, folderRows, calendarRows] = await Promise.all([
      api.meetings.list({ query, limit: 200 }),
      api.meetings.listFolders(),
      api.meetings.upcoming(),
    ]);
    setMeetings(meetingRows);
    setFolders(folderRows);
    setUpcoming(calendarRows);
  }, [query]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEvent('meetings:changed', () => void refresh());

  const importMeetings = async () => {
    const path = await api.app.pickFile([{ name: 'Meetings', extensions: ['wav', 'mp3', 'm4a', 'txt', 'vtt', 'srt'] }]);
    if (!path) return;
    try {
      const imported = await api.meetings.importFiles([path]);
      toast(`Imported ${imported.length} meeting${imported.length === 1 ? '' : 's'}`, { tone: 'success' });
      await refresh();
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
    }
  };

  const saveFolder = async () => {
    if (!folderEditor?.name.trim()) return;
    try {
      if (folderEditor.id) await api.meetings.renameFolder(folderEditor.id, folderEditor.name);
      else await api.meetings.createFolder(folderEditor.name);
      setFolderEditor(null);
      await refresh();
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
    }
  };

  return (
    <Page wide>
      <div className="nt-page">
        <PageHeader
          title="Notetaker"
          actions={
            <>
              <IconButton label="Notetaker settings" onClick={() => openSettings('notetaker')}><Settings size={20} /></IconButton>
              <Button variant="secondary" icon={<Video size={15} />} onClick={() => void api.recorder.start().then((next) => { if (next.meetingId) return api.recorder.openNotepad(next.meetingId); })}>Start Notetaker</Button>
            </>
          }
        />

        <section className="nt-schedule" aria-label="Meeting schedule">
          <div className="nt-label">Today</div>
          <div className="nt-schedule-row">
            <div className="nt-schedule-icon"><Video size={18} /></div>
            <div className="nt-grow"><div className="nt-title">Start your first meeting</div><div className="nt-subtle">2-minute guided tour</div></div>
            <Button size="sm" onClick={() => void api.recorder.start({ title: 'Notetaker guided tour' })}>Start</Button>
          </div>
          <div className="nt-label">Upcoming</div>
          {upcoming.length ? upcoming.slice(0, 3).map((event) => (
            <div className="nt-schedule-row" key={event.id}>
              <div className="nt-schedule-icon"><CalendarDays size={18} /></div>
              <div className="nt-grow"><div className="nt-title">{event.title}</div><div className="nt-subtle">{new Date(event.start).toLocaleString()}</div></div>
              {event.conferenceUrl && <Button size="sm" variant="outline" onClick={() => void api.app.openExternal(event.conferenceUrl!)}>Join</Button>}
              <Button size="sm" onClick={() => void api.recorder.start({ title: event.title, calendarEventId: event.id })}>Start notes</Button>
            </div>
          )) : (
            <div className="nt-schedule-row">
              <div className="nt-schedule-icon"><CalendarDays size={18} /></div>
              <div className="nt-grow"><div className="nt-title">Connect your calendar</div><div className="nt-subtle">Get richer summaries and on-time meeting reminders</div></div>
              <Button size="sm" variant="outline" onClick={() => openSettings('connectors')}>Connect</Button>
            </div>
          )}
        </section>

        <div className="nt-tabbar">
          <Tabs tabs={[{ id: 'past', label: 'Past notes' }, { id: 'shared', label: 'Shared with me' }, { id: 'folders', label: 'Folders' }]} value={view} onChange={setView} />
          {view !== 'folders' && <Input className="nt-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meetings" aria-label="Search meetings" />}
        </div>

        {view === 'shared' && <EmptyState title="Nothing shared with you" body="Murmur runs fully offline, so shared notes are unavailable." />}
        {view === 'past' && (meetings.length ? (
          <div className="nt-list" role="list">
            {meetings.map((meeting) => (
              <Link className="nt-row" to={`/notetaker/${meeting.id}`} key={meeting.id}>
                <div><div className="nt-row-title">{meeting.title}</div><div className="nt-subtle">{meeting.importSource ? `Imported from ${meeting.importSource}` : 'Meeting note'}</div></div>
                <div className="nt-subtle">{new Date(meeting.createdAt).toLocaleDateString()}</div>
                <div className="nt-subtle">{Math.max(1, Math.round(meeting.durationSec / 60))} min</div>
                <div className="nt-subtle">{meeting.summaryStatus === 'ready' ? meeting.preview || 'Summary ready' : meeting.summaryStatus === 'pending' ? 'Generating summary…' : 'No summary yet'}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="nt-empty">
            <div className="nt-empty-art"><FileAudio size={26} /></div>
            <strong>No meeting notes</strong>
            <span className="nt-subtle">Pick up where you left off — import from other tools</span>
            <div className="nt-inline-actions">
              <Button variant="outline" icon={<Import size={16} />} onClick={() => void importMeetings()}>Import meetings</Button>
              <Button variant="ghost" onClick={() => void api.meetings.importGranola().then(({ imported }) => toast(`Imported ${imported} Granola meetings`)).catch((error: unknown) => toast(errorMessage(error), { tone: 'error' }))}>Import Granola</Button>
            </div>
          </div>
        ))}

        {view === 'folders' && (
          <div className="nt-folders">
            <div><Button size="sm" icon={<Folder size={16} />} onClick={() => setFolderEditor({ id: null, name: '' })}>New folder</Button></div>
            {folders.map((folder) => (
              <div className="nt-folder" key={folder.id}>
                <Folder size={18} />
                <button type="button" className="nt-grow" onClick={() => { setView('past'); setQuery(''); void api.meetings.list({ folderId: folder.id }).then(setMeetings); }}>
                  <div className="nt-title">{folder.name}</div><div className="nt-subtle">{folder.meetingCount} meetings</div>
                </button>
                <div className="nt-folder-actions">
                  <Button size="sm" variant="ghost" onClick={() => setFolderEditor({ id: folder.id, name: folder.name })}>Rename</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletingFolder(folder)}>Delete</Button>
                </div>
              </div>
            ))}
            {!folders.length && <EmptyState icon={<Search />} title="No folders" body="Create folders to keep related meetings together." />}
          </div>
        )}
        <Dialog
          open={folderEditor !== null}
          onClose={() => setFolderEditor(null)}
          title={folderEditor?.id ? 'Rename folder' : 'New folder'}
          footer={<><Button variant="ghost" onClick={() => setFolderEditor(null)}>Cancel</Button><Button onClick={() => void saveFolder()} disabled={!folderEditor?.name.trim()}>Save</Button></>}
        >
          <Input autoFocus aria-label="Folder name" placeholder="Folder name" value={folderEditor?.name ?? ''} onChange={(event) => setFolderEditor((current) => current ? { ...current, name: event.target.value } : current)} onKeyDown={(event) => { if (event.key === 'Enter') void saveFolder(); }} />
        </Dialog>
        <ConfirmDialog
          open={deletingFolder !== null}
          title="Delete folder?"
          body={`Meetings in “${deletingFolder?.name ?? ''}” will stay in your library.`}
          confirmLabel="Delete folder"
          danger
          onClose={() => setDeletingFolder(null)}
          onConfirm={() => {
            if (deletingFolder) void api.meetings.deleteFolder(deletingFolder.id).then(refresh);
            setDeletingFolder(null);
          }}
        />
      </div>
    </Page>
  );
}
