// Background behaviors driven by the foreground app and keyboard activity:
// Focus Mode (block distracting apps/sites) and the typing reminder (nudge to dictate after sustained typing).
import { categorizeApp } from '@shared/apps';
import { comboLabelParts } from '@shared/hotkeys';
import { getCtx } from './context';
import { broadcast } from './ipc';
import { getForegroundApp, minimizeWindow } from './native/win32';
import { showNudge, showToast } from './toasts';
import { isDictating, refreshAppBlockedState } from './features/dictation';

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

function compatibilityTick(): void {
  const fg = getForegroundApp();
  if (/^(1password|onepassword)$/i.test(fg.processName))
    showNudge('SecureInputBlockingShortcuts', { title: 'Secure Keyboard Entry can block shortcuts', body: 'If Murmur shortcuts stop working, restart 1Password or turn off Secure Keyboard Entry.', target: 'bar' }, { max: 1 });
  if (/granola/i.test(fg.processName))
    showNudge('FnConflictNotice', { title: 'Granola voice typing may conflict with Murmur', body: 'Turn off voice typing in Granola settings to use the same shortcut.', target: 'bar' }, { max: 1 });
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
  setInterval(() => {
    focusModeTick();
    compatibilityTick();
    refreshAppBlockedState();
  }, 1000);
  const { hotkeys, settings } = getCtx();
  hotkeys.on('key', (_id, down) => onKey(down));
  settings.onChange((next, previous) => {
    if (previous.typingReminder.mode === 'disabled' && next.typingReminder.mode !== 'disabled') {
      showToast({ key: 'TypingReminderEnabled', title: 'Typing reminders enabled', body: 'Murmur will remind you when dictation could save time.', target: 'bar', tone: 'success' });
      showNudge('TypingReminderConfigure', { title: 'Choose where reminders appear', body: 'Adjust reminder apps and categories in Settings.', target: 'bar', actions: [{ id: 'settings', label: 'Configure' }] }, { max: 1 }, (action) => {
        if (action !== 'settings') return;
        settings.patch({ contextualNudge: { mode: 'categories' } });
        broadcast('settings:open', { section: 'system' });
      });
    }
  });
  setTimeout(() => {
    if (!settings.get().onboardingComplete) return;
    const latest = getCtx().db.get<{ timestamp: string }>('SELECT timestamp FROM history ORDER BY timestamp DESC LIMIT 1');
    if (!latest) {
      if (!showNudge('RuxNudgeNeverActivated', { title: 'Ready to try Murmur?', body: 'Hold your shortcut and speak anywhere you can type.', target: 'bar' }, { max: 1 }))
        showNudge('WelcomeBackNeverActivated', { title: 'Welcome back — try your first dictation', target: 'bar' }, { max: 1 });
      return;
    }
    if (Date.now() - new Date(latest.timestamp).getTime() > 14 * 24 * 3600_000) {
      if (!showNudge('RuxNudgeFallenChampion', { title: 'Your voice shortcut is ready', body: 'Welcome back — dictate your next message with Murmur.', target: 'bar' }, { max: 1 }))
        showNudge('WelcomeBackFallenChampion', { title: 'Welcome back to Murmur', target: 'bar' }, { max: 1 });
    }
  }, 5000);
}
