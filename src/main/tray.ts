// System tray icon and menu.
import { app, dialog, Menu, nativeImage, shell, Tray } from 'electron';
import { join } from 'node:path';
import type { CalendarEvent } from '@shared/types';
import { getCtx } from './context';
import { broadcast, onEvent } from './ipc';
import { paths } from './paths';
import { ensureHub, ensureRecorder } from './windows';
import { copyLast, isDictating, pasteLast, startDictation, stopDictation } from './features/dictation';
import { openScratchpad } from './features/notes';
import { getRecordingMeetingId, startNextMeeting, stopRecording } from './features/recorder';

let tray: Tray | null = null;

function nextMeeting(): CalendarEvent | null {
  const events = getCtx().db.kvGet<CalendarEvent[]>('notetaker.calendar', []);
  const now = Date.now();
  return events.find((event) => new Date(event.end).getTime() > now) ?? null;
}

function meetingCountdown(event: CalendarEvent): string {
  const minutes = Math.ceil((new Date(event.start).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours}h ${minutes % 60}m`;
}

function updateTrayLabel(): void {
  if (!tray) return;
  const settings = getCtx().settings.get();
  const event = settings.showNextMeetingInTray ? nextMeeting() : null;
  const label = event ? `${event.title} ${meetingCountdown(event)}` : '';
  tray.setToolTip(label ? `Murmur — ${label}` : 'Murmur');
  tray.setTitle(label);
}

function openHubAt(route: string): void {
  ensureHub(true);
  broadcast('hub:navigate', { route });
}

function openSettings(section: string): void {
  ensureHub(true);
  broadcast('settings:open', { section });
}

function meetingTimeLabel(event: CalendarEvent): string {
  const start = new Date(event.start);
  const now = new Date();
  if (start.getTime() <= now.getTime() && new Date(event.end).getTime() > now.getTime()) return 'Now';
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day = start.toDateString() === now.toDateString()
    ? 'Today'
    : start.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : start.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day}, ${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function buildMenu(dictating: boolean, meetingId: string | null): Menu {
  const { db, settings } = getCtx();
  const counts = db.get<{ w: number; s: number }>('SELECT SUM(isSnippet = 0) AS w, SUM(isSnippet = 1) AS s FROM dictionary');
  const recent = db.all<{ id: string; title: string }>('SELECT id, title FROM meetings WHERE isDeleted = 0 ORDER BY createdAt DESC LIMIT 5');
  const now = Date.now();
  const upcoming = db.kvGet<CalendarEvent[]>('notetaker.calendar', [])
    .filter((event) => new Date(event.end).getTime() > now)
    .slice(0, 5);
  return Menu.buildFromTemplate([
    { label: 'Open Murmur', click: () => ensureHub(true) },
    { type: 'separator' },
    dictating
      ? { label: 'Stop dictation', click: () => stopDictation() }
      : { label: 'Start dictation', click: () => startDictation('popo', 'tray') },
    { label: 'Paste last transcript', click: () => void pasteLast() },
    { label: 'Copy last transcript', click: () => copyLast() },
    { type: 'separator' },
    meetingId
      ? { label: 'Stop Notetaker', click: () => { if (getRecordingMeetingId() === meetingId) void stopRecording(); } }
      : { label: 'Start Notetaker', click: () => void startNextMeeting() },
    { label: 'Open Notetaker', click: () => ensureRecorder(true) },
    {
      label: 'Upcoming meetings',
      submenu: upcoming.length
        ? [
            ...upcoming.map((event) => ({
              label: `${event.title} — ${meetingTimeLabel(event)}`,
              click: () => event.conferenceUrl
                ? void shell.openExternal(event.conferenceUrl)
                : openHubAt('/notetaker'),
            })),
            { type: 'separator' as const },
            { label: 'See all upcoming meetings', click: () => openHubAt('/notetaker') },
          ]
        : [{ label: 'No upcoming meetings', enabled: false }],
    },
    {
      label: 'Past notes',
      submenu: recent.length
        ? [...recent.map((m) => ({ label: m.title || 'Untitled note', click: () => openHubAt(`/notetaker/${m.id}`) })), { type: 'separator' as const }, { label: 'See all notes', click: () => openHubAt('/notetaker') }]
        : [{ label: 'No notes yet', enabled: false }],
    },
    { label: 'Open Scratchpad', click: () => openScratchpad() },
    {
      label: 'Show next meeting',
      type: 'checkbox',
      checked: settings.get().showNextMeetingInTray,
      click: (item) => { settings.patch({ showNextMeetingInTray: item.checked }); },
    },
    { type: 'separator' },
    { label: `Dictionary (${counts?.w ?? 0} words)`, click: () => openHubAt('/dictionary') },
    { label: `Snippets (${counts?.s ?? 0})`, click: () => openHubAt('/snippets') },
    { label: 'Style', click: () => openHubAt('/style') },
    { label: 'Microphone…', click: () => openSettings('general') },
    { label: 'Languages…', click: () => openSettings('general') },
    { label: 'Shortcuts…', click: () => openSettings('shortcuts') },
    { label: 'Settings', click: () => openSettings('general') },
    { type: 'separator' },
    { label: 'Share feedback', click: () => void dialog.showMessageBox({ type: 'info', title: 'Share feedback', message: 'Murmur runs fully offline.', detail: 'Feedback, Help Center, and support links are unavailable in this offline build.' }) },
    { label: 'Help and support', click: () => void dialog.showMessageBox({ type: 'info', title: 'Help and support', message: 'Murmur runs fully offline.', detail: 'Use the in-app tutorials and local settings for help.' }) },
    {
      label: 'View',
      submenu: [
        { label: 'Actual size', role: 'resetZoom' },
        { label: 'Zoom in', role: 'zoomIn' },
        { label: 'Zoom out', role: 'zoomOut' },
      ],
    },
    { label: 'Hide Murmur', role: 'hide' },
    { label: 'Close window', role: 'close' },
    { label: 'Check for updates', click: () => void dialog.showMessageBox({ type: 'info', title: 'Murmur updates', message: `Updates are installed manually — you're on v${app.getVersion()}.` }) },
    { type: 'separator' },
    { label: `About Murmur ${app.getVersion()}`, role: 'about' },
    { label: 'Quit Murmur', click: () => app.quit() },
  ]);
}

export function createTray(): void {
  if (tray) return;
  const icon = nativeImage.createFromPath(join(paths.resources, 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  updateTrayLabel();
  let dictating = isDictating();
  let meetingId = getRecordingMeetingId();
  tray.setContextMenu(buildMenu(dictating, meetingId));
  // Rebuild outside the capture/hotkey handler, not on every microphone-level event.
  let scheduled = false;
  const refreshMenu = () => {
    if (scheduled) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      tray?.setContextMenu(buildMenu(dictating, meetingId));
    });
  };
  onEvent('dictation:state', () => {
    const active = isDictating();
    if (active === dictating) return;
    dictating = active;
    refreshMenu();
  });
  onEvent('recorder:state', () => {
    const active = getRecordingMeetingId();
    if (active === meetingId) return;
    meetingId = active;
    refreshMenu();
  });
  onEvent('dictionary:changed', refreshMenu);
  onEvent('meetings:changed', refreshMenu);
  getCtx().settings.onChange((next, previous) => {
    if (next.showNextMeetingInTray !== previous.showNextMeetingInTray) {
      updateTrayLabel();
      refreshMenu();
    }
  });
  const tooltipTimer = setInterval(() => { updateTrayLabel(); refreshMenu(); }, 60_000);
  tooltipTimer.unref();
  tray.on('click', () => ensureHub(true));
}
