// BrowserWindow factory and registry for every Murmur window.
import { BrowserWindow, ipcMain, nativeTheme, screen, shell } from 'electron';
import { join } from 'node:path';
import { getCtx } from './context';
import { paths } from './paths';

export type WindowKind = 'hub' | 'status' | 'scratchpad' | 'recorder' | 'capture';

const registry = new Map<WindowKind, BrowserWindow>();
const STATUS_W = 440;
const STATUS_H = 260;

function load(win: BrowserWindow, page: string, hash = ''): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void win.loadURL(`${dev}/${page}.html${hash ? `#${hash}` : ''}`);
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`), hash ? { hash } : undefined);
}

function base(kind: WindowKind, opts: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    backgroundColor: kind === 'status' || kind === 'capture' ? '#00000000' : nativeTheme.shouldUseDarkColors && getCtx().settings.get().theme !== 'light' ? '#1a1a1a' : '#f5f4f0',
    icon: join(paths.resources, 'icon.png'),
    ...opts,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      additionalArguments: [`--murmur-window=${kind}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: kind !== 'capture' && kind !== 'status',
      ...opts.webPreferences,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:') && !url.startsWith(process.env.ELECTRON_RENDERER_URL ?? '\0')) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.webContents.setZoomFactor(getCtx().settings.get().zoom);
  registry.set(kind, win);
  win.on('closed', () => registry.get(kind) === win && registry.delete(kind));
  return win;
}

export function getWindow(kind: WindowKind): BrowserWindow | null {
  const w = registry.get(kind);
  return w && !w.isDestroyed() ? w : null;
}

export function ensureHub(show = true, route?: string): BrowserWindow {
  let win = getWindow('hub');
  if (!win) {
    win = base('hub', { width: 1350, height: 850, minWidth: 960, minHeight: 640, frame: false, title: 'Murmur' });
    load(win, 'index', route);
    if (show) win.once('ready-to-show', () => win?.show());
  } else if (show) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  return win;
}

/** Bottom-center (or docked) always-on-top Flow bar; transparent and click-through except over its content. */
export function ensureStatus(): BrowserWindow {
  let win = getWindow('status');
  if (win) return win;
  win = base('status', {
    width: STATUS_W,
    height: STATUS_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'Murmur Flow Bar',
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  positionStatus();
  load(win, 'status');
  win.once('ready-to-show', () => win?.showInactive());
  return win;
}

export function positionStatus(): void {
  const win = getWindow('status');
  if (!win) return;
  const dock = getCtx().settings.get().flowBarDock;
  const area = screen.getPrimaryDisplay().workArea;
  if (dock === 'left') win.setBounds({ x: area.x + 8, y: Math.round(area.y + area.height / 2 - STATUS_H / 2), width: STATUS_W, height: STATUS_H });
  else if (dock === 'right') win.setBounds({ x: area.x + area.width - STATUS_W - 8, y: Math.round(area.y + area.height / 2 - STATUS_H / 2), width: STATUS_W, height: STATUS_H });
  else win.setBounds({ x: Math.round(area.x + area.width / 2 - STATUS_W / 2), y: area.y + area.height - STATUS_H, width: STATUS_W, height: STATUS_H });
}

export function ensureScratchpad(show = true): BrowserWindow {
  let win = getWindow('scratchpad');
  if (!win) {
    win = base('scratchpad', { width: 880, height: 620, minWidth: 420, minHeight: 360, frame: false, title: 'Scratchpad' });
    load(win, 'scratchpad');
    if (show) win.once('ready-to-show', () => win?.show());
  } else if (show) {
    win.show();
    win.focus();
  }
  return win;
}

/** Notetaker "Notepad" window shown while recording / reviewing a meeting. */
export function ensureRecorder(show = true): BrowserWindow {
  let win = getWindow('recorder');
  if (!win) {
    const area = screen.getPrimaryDisplay().workArea;
    win = base('recorder', {
      width: 460,
      height: Math.min(760, area.height - 40),
      x: area.x + area.width - 480,
      y: area.y + 20,
      minWidth: 360,
      minHeight: 420,
      frame: false,
      title: 'Notepad',
    });
    win.setContentProtection(getCtx().settings.get().notetaker.hideInScreenCapture);
    load(win, 'recorder');
    if (show) win.once('ready-to-show', () => win?.show());
  } else if (show) {
    win.show();
    win.focus();
  }
  return win;
}

/** Hidden window that owns getUserMedia / desktop loopback capture for dictation and meetings. */
export function ensureCapture(): BrowserWindow {
  let win = getWindow('capture');
  if (win) return win;
  win = base('capture', { width: 200, height: 100, show: false, skipTaskbar: true, focusable: false });
  load(win, 'capture');
  return win;
}

export function applyZoomToAll(zoom: number): void {
  for (const w of registry.values()) if (!w.isDestroyed()) w.webContents.setZoomFactor(zoom);
}

export function setContentProtectionForMeeting(on: boolean): void {
  for (const k of ['recorder', 'status'] as const) getWindow(k)?.setContentProtection(on);
}

// Flow bar hover: renderer toggles click-through so the bar is clickable but the rest stays transparent.
ipcMain.on('status:interactive', (_e, interactive: boolean) => {
  getWindow('status')?.setIgnoreMouseEvents(!interactive, { forward: true });
});
