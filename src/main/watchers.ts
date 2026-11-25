// Background behaviors driven by the foreground app and keyboard activity:
// Focus Mode (block distracting apps/sites) and the typing reminder (nudge to dictate after sustained typing).
import { categorizeApp } from '@shared/apps';
import { comboLabelParts } from '@shared/hotkeys';
import { getCtx } from './context';
import { getForegroundApp, minimizeWindow } from './native/win32';
import { showNudge, showToast } from './toasts';
import { isDictating } from './features/dictation';

const BROWSERS = /^(chrome|msedge|firefox|brave|opera|arc|vivaldi|zen)$/;
const TYPING_WINDOW_MS = 60_000;
const TYPING_THRESHOLD = 120; // keystrokes within the window

function focusModeTick(): void {
  const s = getCtx().settings.get().focusMode;
  if (!s.enabled) return;
  const fg = getForegroundApp();
  if (!fg.hwnd || !fg.processName) return;
  const title = fg.title.toLowerCase();
  const blockedApp = s.blockedApps.some((a) => a.toLowerCase() === fg.processName);
  const blockedSite = BROWSERS.test(fg.processName) && s.blockedUrls.some((u) => title.includes(u.toLowerCase().replace(/^www\./, '').split('.')[0]));
  if (!blockedApp && !blockedSite) return;
  minimizeWindow(fg.hwnd);
  showToast({ key: 'FocusModeBlocked', title: "You're in a Flow state", body: `${blockedApp ? fg.processName : 'This site'} is blocked by Focus Mode.`, target: 'bar' });
}

let keyTimes: number[] = [];

function onKey(down: boolean): void {
  if (!down || isDictating()) return;
  const s = getCtx().settings.get();
  const tr = s.typingReminder;
  if (tr.mode === 'disabled' || tr.mutedUntil > Date.now()) return;
  const now = Date.now();
  keyTimes.push(now);
  keyTimes = keyTimes.filter((t) => now - t < TYPING_WINDOW_MS);
  if (keyTimes.length < TYPING_THRESHOLD) return;
  const fg = getForegroundApp();
  const category = categorizeApp(fg.processName, fg.title);
  if (tr.mode === 'categories' && !tr.categories.includes(category)) return;
  if (tr.mode === 'previously_used') {
    const used = getCtx().db.get<{ n: number }>('SELECT COUNT(*) AS n FROM history WHERE app = ?', fg.processName);
    if (!used?.n) return;
  }
  keyTimes = [];
  const combo = s.shortcuts.ptt[0];
  showNudge(
    'TypingReminder',
    { title: 'Save time — dictate instead', body: combo ? `Hold ${comboLabelParts(combo).join(' + ')} and speak.` : 'Click the Flow Bar to dictate.', target: 'bar', actions: [{ id: 'mute', label: 'Mute for 12 hours' }] },
    { minIntervalMs: 15 * 60_000 },
    (a) => {
      if (a === 'mute') {
        getCtx().settings.patch({ typingReminder: { mutedUntil: Date.now() + 12 * 3600_000 } });
        showToast({ key: 'TypingReminderMuted', title: 'Dictation reminder muted for 12 hours', target: 'bar' });
      }
    },
  );
}

export function startWatchers(): void {
  setInterval(focusModeTick, 1000);
  getCtx().hotkeys.on('key', (_id, down) => onKey(down));
}
