// System tray icon and menu.
import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { getCtx } from './context';
import { broadcast } from './ipc';
import { paths } from './paths';
import { ensureHub } from './windows';
import { copyLast, isDictating, pasteLast, startDictation, stopDictation } from './features/dictation';
import { openScratchpad } from './features/notes';
import { toggleRecording } from './features/recorder';

let tray: Tray | null = null;

function openHubAt(route: string): void {
  ensureHub(true);
  broadcast('hub:navigate', { route });
}

function openSettings(section: string): void {
  ensureHub(true);
  broadcast('settings:open', { section });
}

function buildMenu(): Menu {
  const { db } = getCtx();
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
    {
      label: 'Past notes',
      submenu: recent.length
        ? [...recent.map((m) => ({ label: m.title || 'Untitled note', click: () => openHubAt(`/notetaker/${m.id}`) })), { type: 'separator' as const }, { label: 'See all notes', click: () => openHubAt('/notetaker') }]
        : [{ label: 'No notes yet', enabled: false }],
    },
    { label: 'Open Scratchpad', click: () => openScratchpad() },
    { type: 'separator' },
    { label: `Dictionary (${counts?.w ?? 0} words)`, click: () => openHubAt('/dictionary') },
    { label: `Snippets (${counts?.s ?? 0})`, click: () => openHubAt('/snippets') },
    { label: 'Style', click: () => openHubAt('/style') },
    { label: 'Microphone…', click: () => openSettings('general') },
    { label: 'Languages…', click: () => openSettings('general') },
    { label: 'Shortcuts…', click: () => openSettings('shortcuts') },
    { label: 'Settings', click: () => openSettings('general') },
    { type: 'separator' },
    { label: `About Murmur ${app.getVersion()}`, role: 'about' },
    { label: 'Quit Murmur', click: () => app.quit() },
  ]);
}

export function createTray(): void {
  if (tray) return;
  const icon = nativeImage.createFromPath(join(paths.resources, 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Murmur');
  tray.on('click', () => ensureHub(true));
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu()));
}
