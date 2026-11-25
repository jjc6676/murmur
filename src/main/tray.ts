// System tray icon and menu.
import { app, dialog, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import type { CalendarEvent } from '@shared/types';
import { getCtx } from './context';
import { broadcast } from './ipc';
import { paths } from './paths';
import { ensureHub, ensureRecorder } from './windows';
import { copyLast, isDictating, pasteLast, startDictation, stopDictation } from './features/dictation';
import { openScratchpad } from './features/notes';
import { toggleRecording } from './features/recorder';

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

function buildMenu(): Menu {
  const { db, settings } = getCtx();
  const counts = db.get<{ w: number; s: number }>('SELECT SUM(isSnippet = 0) AS w, SUM(isSnippet = 1) AS s FROM dictionary');
  const recent = db.all<{ id: string; title: string }>('SELECT id, title FROM meetings WHERE isDeleted = 0 ORDER BY createdAt DESC LIMIT 5');
  return Menu.buildFromTemplate([
    { label: 'Open Murmur', click: () => ensureHub(true) },
    { type: 'separator' },
    { label: isDictating() ? 'Stop dictation' : 'Start dictation', click: () => (isDictating() ? stopDictation() : startDictation('popo')) },
    { label: 'Paste last transcript', click: () => void pasteLast() },
    { label: 'Copy last transcript', click: () => copyLast() },
    { type: 'separator' },
    { label: 'Start Notetaker', click: () => void toggleRecording() },
    { label: 'Open Notetaker', click: () => ensureRecorder(true) },
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
      click: (item) => { settings.patch({ showNextMeetingInTray: item.checked }); updateTrayLabel(); },
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
  const tooltipTimer = setInterval(updateTrayLabel, 60_000);
  tooltipTimer.unref();
  tray.on('click', () => ensureHub(true));
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu()));
}
