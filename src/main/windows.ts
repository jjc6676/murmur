// BrowserWindow factory and registry for every Murmur window.
import { BrowserWindow, ipcMain, nativeTheme, screen, shell } from 'electron';
import { join } from 'node:path';
import { getCtx } from './context';
import { paths } from './paths';
import { getForegroundWindowRect } from './native/win32';
import { eventChannel } from '@shared/ipc';

export type WindowKind = 'hub' | 'status' | 'scratchpad' | 'recorder' | 'capture' | 'transformPicker';

const registry = new Map<WindowKind, BrowserWindow>();
const STATUS_W = 440;
const STATUS_H = 260;
const PICKER_W = 420;
const PICKER_H = 520;

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
  startStatusTracking(win);
  return win;
}

/** Display the user is working on: the one holding the foreground window, else the one under the cursor. */
function activeDisplay(): Electron.Display {
  const rect = process.platform === 'win32' ? getForegroundWindowRect() : null;
  if (rect) return screen.getDisplayMatching(screen.screenToDipRect(null, rect));
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

let statusDisplayId: number | null = null;

export function positionStatus(display = activeDisplay()): void {
  const win = getWindow('status');
  if (!win) return;
  statusDisplayId = display.id;
  const dock = getCtx().settings.get().flowBarDock;
  const area = display.workArea;
  if (dock === 'left') win.setBounds({ x: area.x + 8, y: Math.round(area.y + area.height / 2 - STATUS_H / 2), width: STATUS_W, height: STATUS_H });
  else if (dock === 'right') win.setBounds({ x: area.x + area.width - STATUS_W - 8, y: Math.round(area.y + area.height / 2 - STATUS_H / 2), width: STATUS_W, height: STATUS_H });
  else win.setBounds({ x: Math.round(area.x + area.width / 2 - STATUS_W / 2), y: area.y + area.height - STATUS_H, width: STATUS_W, height: STATUS_H });
}

// Flow bar hit testing. The window is transparent and click-through; the renderer reports the rectangles of its
// visible controls (pill, toasts, menu) and main polls the cursor, turning click-through off only over them.
// Polling replaces Electron's `forward` hover detection, whose low-level mouse hook Windows can silently drop.
type HitRect = { x: number; y: number; width: number; height: number };
let statusHitRects: HitRect[] = [];
let statusForceInteractive = false;
let statusInteractive = false;
const HIT_POLL_MS = 50;
const DISPLAY_POLL_MS = 500;

function startStatusTracking(win: BrowserWindow): void {
  let lastDisplayCheck = 0;
  const timer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(timer);
    if (!win.isVisible()) return;
    const now = Date.now();
    // Follow the display the user is working on (not while they are interacting with the bar itself).
    if (!statusInteractive && now - lastDisplayCheck >= DISPLAY_POLL_MS) {
      lastDisplayCheck = now;
      const display = activeDisplay();
      if (display.id !== statusDisplayId) positionStatus(display);
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    // Renderer reports rects in physical pixels (CSS px × devicePixelRatio), independent of the hub zoom level.
    const scale = screen.getDisplayMatching(bounds).scaleFactor;
    const x = (cursor.x - bounds.x) * scale;
    const y = (cursor.y - bounds.y) * scale;
    const inside = statusForceInteractive || statusHitRects.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
    if (inside !== statusInteractive) {
      statusInteractive = inside;
      win.setIgnoreMouseEvents(!inside, { forward: true });
      win.webContents.send(eventChannel('status:hover'), { inside });
    }
  }, HIT_POLL_MS);
}

export function ensureTransformPicker(): BrowserWindow {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const area = display.workArea;
  const x = Math.min(Math.max(cursor.x - Math.round(PICKER_W / 2), area.x + 8), area.x + area.width - PICKER_W - 8);
  const y = Math.min(Math.max(cursor.y + 12, area.y + 8), area.y + area.height - PICKER_H - 8);
  let win = getWindow('transformPicker');
  if (!win) {
    win = base('transformPicker', {
      width: PICKER_W,
      height: PICKER_H,
      x,
      y,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'Apply transform',
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    load(win, 'transform-picker');
    win.once('ready-to-show', () => {
      win?.show();
      win?.focus();
    });
  } else {
    win.setPosition(x, y);
    win.show();
    win.focus();
  }
  return win;
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

ipcMain.on('status:hitRects', (_e, rects: HitRect[]) => {
  statusHitRects = Array.isArray(rects) ? rects : [];
});
// Context menu open: keep the whole bar window interactive so the menu can be used.
ipcMain.on('status:interactive', (_e, interactive: boolean) => {
  statusForceInteractive = interactive;
});
