import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, FileAudio, Folder, Import, MoreHorizontal, Search, Settings, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CalendarEvent, Folder as FolderType, MeetingListItem, RecorderState } from '@shared/types';
import { api, errorMessage, useEvent } from '../../lib/api';
import { Button, ConfirmDialog, Dialog, EmptyState, IconButton, Input, Menu, Page, PageHeader, Select, Tabs, TextArea } from '../../ui';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { toast, useHubUi } from '../state';
import '../notetaker/notetaker.css';

type View = 'today' | 'past' | 'shared' | 'folders';

export function NotetakerPage() {
  const openSettings = useHubUi((state) => state.openSettings);
  const settings = useSettings();
  const patchSettings = usePatchSettings();
  const [view, setView] = useState<View>('past');
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState('any');
  const [loadedAt] = useState(() => Date.now());
  const [todayKey] = useState(() => new Date().toDateString());
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [recorder, setRecorder] = useState<RecorderState | null>(null);
  const [folderEditor, setFolderEditor] = useState<{ id: string | null; name: string; description: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderType | null>(null);
  const [switchPrompt, setSwitchPrompt] = useState(false);
  const [stopPrompt, setStopPrompt] = useState(false);
  const [brief, setBrief] = useState<{ title: string; content: string } | null>(null);
  const [cloudImport, setCloudImport] = useState<string | null>(null);
  const [granolaPrompt, setGranolaPrompt] = useState(false);
  const [granolaImporting, setGranolaImporting] = useState(false);
  const [granolaProgress, setGranolaProgress] = useState<{ current: number; total: number } | null>(null);

  const refresh = useCallback(async () => {
    const [meetingRows, folderRows, calendarRows, recorderState] = await Promise.all([
      api.meetings.list({ query, limit: 200 }),
      api.meetings.listFolders(),
      api.meetings.upcoming(),
      api.recorder.getState(),
    ]);
    setMeetings(meetingRows);
    setFolders(folderRows);
    setUpcoming(calendarRows);
    setRecorder(recorderState);
  }, [query]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEvent('meetings:changed', () => void refresh());
  useEvent('recorder:state', setRecorder);
  useEvent('meetings:importProgress', ({ current, total, done }) => {
    setGranolaProgress(done ? null : { current, total });
  });

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
  const importGranolaExport = async () => {
    const path = await api.app.pickFile([{ name: 'Granola export', extensions: ['csv', 'zip'] }]);
    if (!path) return;
    setGranolaImporting(true);
    setGranolaProgress({ current: 0, total: 0 });
    try {
      const { imported, total } = await api.meetings.importGranolaExport(path);
      toast(`Imported ${imported} of ${total} Granola meetings`, { tone: imported === total ? 'success' : 'warning' });
      await refresh();
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' });
    } finally {
      setGranolaImporting(false);
      setGranolaProgress(null);
    }
  };
  const startNotetaker = async (opts: { title?: string; calendarEventId?: string; isTourDemo?: boolean } = {}) => {
    if (recorder && ['awaiting_audio', 'recording', 'paused', 'finalizing'].includes(recorder.phase)) {
      setSwitchPrompt(true);
      return;
    }
    const next = await api.recorder.start(opts);
    if (next.meetingId) await api.recorder.openNotepad(next.meetingId);
  };
  const joinAndStart = async (event: CalendarEvent) => {
    if (event.conferenceUrl) await api.app.openExternal(event.conferenceUrl);
    await startNotetaker({ title: event.title, calendarEventId: event.id });
  };

  const filteredMeetings = meetings.filter((meeting) => {
    if (dateRange === 'any') return true;
    const ageDays = (loadedAt - new Date(meeting.createdAt).getTime()) / 86_400_000;
    return ageDays <= Number(dateRange);
  });
  const todayMeetings = filteredMeetings.filter((meeting) => new Date(meeting.createdAt).toDateString() === todayKey);

  const saveFolder = async () => {
    if (!folderEditor?.name.trim()) return;
    try {
      if (folderEditor.id) await api.meetings.renameFolder(folderEditor.id, folderEditor.name);
      else await api.meetings.createFolder(folderEditor.name, folderEditor.description);
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
              {recorder && ['awaiting_audio', 'recording', 'paused', 'finalizing'].includes(recorder.phase) ? <><Button variant="ghost" onClick={() => setStopPrompt(true)}>Stop Notetaker</Button><Button variant="secondary" onClick={() => void api.recorder.openNotepad(recorder.meetingId ?? undefined)}>Open live meeting note</Button></> : <Button variant="secondary" icon={<Video size={15} />} onClick={() => void startNotetaker()}>Start Notetaker</Button>}
            </>
          }
        />
        {granolaImporting && <div className="recorder-banner" role="status" aria-live="polite"><strong>Importing Granola meetings{granolaProgress?.total ? ` ${granolaProgress.current} of ${granolaProgress.total}` : ''}…</strong><span>Do not close Murmur. Imported meetings are kept if you cancel later.</span><Button size="sm" variant="ghost" onClick={() => void api.meetings.cancelGranolaImport()}>Cancel</Button></div>}

        {!settings.notetaker.autoDetectCalls && (
          <div className="recorder-banner warning">
            <div className="nt-grow"><strong>Never miss meeting notes</strong><div>Turn meeting detection back on so Murmur can remind you when a call starts.</div></div>
            <Button size="sm" variant="ghost" onClick={() => toast('You can turn reminders on any time in Notetaker settings.')}>Not now</Button>
            <Button size="sm" onClick={() => void patchSettings({ notetaker: { autoDetectCalls: true } }).then(() => toast('Meeting reminders are on.', { tone: 'success' }))}>Yes, remind me</Button>
          </div>
        )}
        <section className="nt-schedule" aria-label="Meeting schedule">
          <div className="nt-label">Today</div>
          <div className="nt-schedule-row">
            <div className="nt-schedule-icon"><Video size={18} /></div>
            <div className="nt-grow"><div className="nt-title">Start your first meeting</div><div className="nt-subtle">2-minute guided tour</div></div>
            <Button size="sm" onClick={() => void startNotetaker({ title: 'Notetaker guided tour', isTourDemo: true })}>Start</Button>
          </div>
          <div className="nt-label">Upcoming</div>
          {upcoming.length ? upcoming.slice(0, 3).map((event) => {
            const now = clock;
            const startsAt = new Date(event.start).getTime();
            const endsAt = new Date(event.end).getTime();
            const conflict = upcoming.some((other) => other.id !== event.id && new Date(other.start).getTime() < endsAt && new Date(other.end).getTime() > startsAt);
            const timing = startsAt <= now && endsAt >= now ? 'Now' : conflict ? 'Conflict' : undefined;
            const response = event.responseStatus === 'declined' ? 'Declined' : event.responseStatus === 'tentative' ? 'Maybe' : undefined;
            return (
              <div className="nt-schedule-row" key={event.id}>
                <div className="nt-schedule-icon" style={event.color ? { borderColor: event.color } : undefined}><CalendarDays size={18} /></div>
                <div className="nt-grow"><div className="nt-title">{event.title}</div><div className="nt-subtle">{new Date(event.start).toLocaleString()}{event.attendees?.length ? ` · ${event.attendees.join(', ')}` : ''}{timing || response ? ` · ${timing ?? response}` : ''}</div></div>
                {event.conferenceUrl && <Button size="sm" variant="outline" aria-label={`Join ${event.title}`} onClick={() => void api.app.openExternal(event.conferenceUrl!)}>Join meeting</Button>}
                {event.conferenceUrl && <Menu
                  trigger={(props) => <IconButton {...props} size="sm" label={`Open actions for ${event.title}`}><MoreHorizontal size={16} /></IconButton>}
                  items={[
                    { label: 'Join meeting', onSelect: () => void api.app.openExternal(event.conferenceUrl!) },
                    { label: 'Join + Start', onSelect: () => void joinAndStart(event) },
                    { label: 'Start notes', onSelect: () => void startNotetaker({ title: event.title, calendarEventId: event.id }) },
                    { label: 'Show brief', onSelect: () => void api.meetings.getBrief(event.id).then(setBrief) },
                  ]}
                />}
                <Button size="sm" variant="ghost" onClick={() => void api.meetings.snoozeCalendar(event.id).then(() => toast('Reminder snoozed for 2 minutes'))}>Remind later</Button>
                <Button size="sm" variant="ghost" onClick={() => void api.meetings.getBrief(event.id).then(setBrief)}>Brief</Button>
                <Button size="sm" variant="ghost" onClick={() => void startNotetaker({ title: event.title, calendarEventId: event.id })}>Start notes</Button>
                {event.conferenceUrl && <Button size="sm" onClick={() => void joinAndStart(event)}>Join + Start</Button>}
              </div>
            );
          }) : (
            <div className="nt-schedule-row">
              <div className="nt-schedule-icon"><CalendarDays size={18} /></div>
              <div className="nt-grow"><div className="nt-title">Connect your calendar</div><div className="nt-subtle">Get richer summaries and on-time meeting reminders</div></div>
              <Button size="sm" variant="outline" onClick={() => openSettings('connectors')}>Connect</Button>
            </div>
          )}
        </section>

        <div className="nt-tabbar">
          <Tabs tabs={[{ id: 'today', label: 'Today' }, { id: 'past', label: 'Past notes' }, { id: 'shared', label: 'Shared with me' }, { id: 'folders', label: 'Folders' }]} value={view} onChange={setView} />
          {(view === 'past' || view === 'today') && <><Select value={dateRange} options={[{ value: 'any', label: 'Any time' }, { value: '1', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '365', label: 'Last year' }]} onChange={setDateRange} ariaLabel="Meeting date range" /><Input className="nt-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meetings" aria-label="Search meetings" /></>}
        </div>

        {view === 'shared' && <EmptyState title="Nothing shared with you" body="Murmur runs fully offline, so shared notes are unavailable." />}
        {view === 'today' && <section className="nt-daily"><h2>Up next</h2>{upcoming.length ? upcoming.slice(0, 3).map((event) => <div className="nt-schedule-row" key={event.id}><CalendarDays size={17} /><span className="nt-grow">{event.title}</span><span className="nt-subtle">{new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>) : <p className="nt-subtle">No more meetings scheduled.</p>}<h2>Done for the day</h2>{todayMeetings.map((meeting) => <Link className="nt-row" to={`/notetaker/${meeting.id}`} key={meeting.id}><strong>{meeting.title}</strong><span className="nt-subtle">{Math.max(1, Math.round(meeting.durationSec / 60))} min</span><span className="nt-subtle">{meeting.participantCount ?? 0} people</span><span className="nt-subtle">{meeting.taskCount ?? 0} tasks</span></Link>)}</section>}
        {view === 'past' && (filteredMeetings.length ? (
          <div className="nt-list" role="list">
            {filteredMeetings.map((meeting) => (
              <Link className="nt-row" to={`/notetaker/${meeting.id}`} key={meeting.id}>
                <div><div className="nt-row-title">{meeting.title}</div><div className="nt-subtle">{meeting.importSource ? `Imported from ${meeting.importSource}` : `${meeting.noticePosted ? 'Consent posted' : 'Private meeting note'} · ${meeting.autoShareEnabled ? 'Auto-file on' : 'Auto-file off'}`}</div></div>
                <div className="nt-subtle">{new Date(meeting.createdAt).toLocaleDateString()}</div>
                <div className="nt-subtle">{Math.max(1, Math.round(meeting.durationSec / 60))} min · {meeting.participantCount ?? 0} people · {meeting.taskCount ?? 0} tasks</div>
                <div className="nt-subtle">{meeting.summaryStatus === 'ready' ? meeting.preview || 'Summary ready' : meeting.summaryStatus === 'pending' ? 'Generating summary…' : meeting.importSource ? 'This meeting came without a summary.' : 'Too short to summarize'}</div>
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
              <Button variant="ghost" onClick={() => setGranolaPrompt(true)}>Import Granola</Button>
              <Button variant="ghost" onClick={() => setCloudImport('Zoom')}>Import from Zoom</Button>
              <Button variant="ghost" onClick={() => setCloudImport('Fireflies')}>Import from Fireflies</Button>
            </div>
          </div>
        ))}

        {view === 'folders' && (
          <div className="nt-folders">
            <div><Button size="sm" icon={<Folder size={16} />} onClick={() => setFolderEditor({ id: null, name: '', description: '' })}>New folder</Button></div>
            {folders.map((folder) => (
              <div className="nt-folder" key={folder.id}>
                <Folder size={18} />
                <button type="button" className="nt-grow" onClick={() => { setView('past'); setQuery(''); void api.meetings.list({ folderId: folder.id }).then(setMeetings); }}>
                  <div className="nt-title">{folder.name}</div><div className="nt-subtle">{folder.description || 'No description'} · {folder.meetingCount} meetings · Only you</div>
                </button>
                <div className="nt-folder-actions">
                  <Button size="sm" variant="ghost" onClick={() => setFolderEditor({ id: folder.id, name: folder.name, description: folder.description })}>Rename</Button>
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
          {!folderEditor?.id && <TextArea aria-label="Folder description" placeholder="Description (optional) — used for filing suggestions" value={folderEditor?.description ?? ''} onChange={(event) => setFolderEditor((current) => current ? { ...current, description: event.target.value } : current)} />}
        </Dialog>
        <Dialog open={brief !== null} onClose={() => setBrief(null)} title={brief?.title ?? 'Meeting brief'} footer={<Button onClick={() => setBrief(null)}>Done</Button>}><pre className="nt-brief">{brief?.content}</pre></Dialog>
        <Dialog open={cloudImport !== null} onClose={() => setCloudImport(null)} title={`Import from ${cloudImport ?? ''}`} footer={<Button onClick={() => setCloudImport(null)}>Done</Button>}><p>Murmur runs fully offline, so cloud account imports are unavailable. Export your meetings from {cloudImport} and use Import meetings instead.</p>{cloudImport === 'Fireflies' && <Input aria-label="Fireflies API key" placeholder="Fireflies API key" disabled />}</Dialog>
        <Dialog open={switchPrompt} onClose={() => setSwitchPrompt(false)} title="Stop Notetaker?" description="The current recording will be saved and can be resumed later. Stop it before switching to a new meeting?" footer={<><Button variant="ghost" onClick={() => setSwitchPrompt(false)}>Cancel</Button><Button onClick={() => void api.recorder.start({ replaceActive: true }).then((next) => { setSwitchPrompt(false); if (next.meetingId) return api.recorder.openNotepad(next.meetingId); })}>Stop and switch</Button></>} />
        <ConfirmDialog open={stopPrompt} title="Stop Notetaker?" body="The current recording will stop and Murmur will finish the transcript and summary." confirmLabel="Stop Notetaker" danger onClose={() => setStopPrompt(false)} onConfirm={() => { setStopPrompt(false); void api.recorder.stop(); }} />
        <ConfirmDialog open={granolaPrompt} title="Import Granola export?" body="Choose a Granola .zip or .csv export. Murmur validates the file and imports meetings locally; already written meetings stay if you cancel." confirmLabel="Choose export" onClose={() => setGranolaPrompt(false)} onConfirm={() => { setGranolaPrompt(false); void importGranolaExport(); }} />
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
