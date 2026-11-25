// Text insertion/extraction in the foreground app via the clipboard + synthetic keystrokes.
import { clipboard, ClipboardItem } from 'electron';
import { focusWindow, getForegroundApp, isWindowElevated, releaseModifiers, sendChord, VK, type ForegroundApp } from './win32';
import { readFocusedText } from './uia';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Snapshot every clipboard format so the user's clipboard survives our paste. */
async function snapshot(): Promise<ClipboardItem[]> {
  try {
    return await clipboard.read();
  } catch {
    return [];
  }
}

async function restore(items: ClipboardItem[]): Promise<void> {
  try {
    if (items.length) await clipboard.write(items);
    else await clipboard.clear();
  } catch {
    // clipboard owned by another process right now; leave our text in place
  }
}

/** Wait until no modifier key is physically held (user still releasing the hotkey), max `maxMs`. */
export async function waitForModifiersReleased(isHeld: (k: string) => boolean, maxMs = 600): Promise<void> {
  const until = Date.now() + maxMs;
  while (Date.now() < until && ['Ctrl', 'Alt', 'Shift', 'Win'].some(isHeld)) await sleep(15);
}

export interface PasteOptions {
  target?: ForegroundApp | null; // window to refocus before pasting
  html?: string;
  pressEnter?: boolean;
  restoreClipboard?: boolean;
}

export interface PasteResult {
  outcome: 'verified' | 'unverified' | 'blocked';
  delayed: boolean;
  before: string | null;
  after: string | null;
}

/** Insert text at the caret and verify the resulting field through UI Automation when supported. */
export async function pasteText(text: string, opts: PasteOptions = {}): Promise<PasteResult> {
  const target = opts.target ?? getForegroundApp();
  if (isWindowElevated(target.hwnd)) {
    await clipboard.writeText(text);
    return { outcome: 'blocked', delayed: false, before: null, after: null };
  }
  const beforeRead = await readFocusedText(500);
  const before = beforeRead.ok ? beforeRead.value : null;
  const prev = opts.restoreClipboard === false ? null : await snapshot();
  if (opts.html) await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': opts.html })]);
  else await clipboard.writeText(text);
  if (target.hwnd) {
    const fg = getForegroundApp();
    if (fg.hwnd !== target.hwnd) {
      focusWindow(target.hwnd);
      await sleep(60);
    }
  }
  releaseModifiers();
  await sleep(20);
  sendChord([VK.CONTROL], VK.V);
  if (opts.pressEnter) {
    await sleep(120);
    sendChord([], VK.RETURN);
  }
  let afterRead = await readFocusedText(500);
  let delayed = false;
  if (afterRead.ok && !afterRead.value.includes(text) && !opts.pressEnter) {
    await sleep(350);
    afterRead = await readFocusedText(500);
    delayed = true;
  }
  if (prev) {
    // give the target app time to read the clipboard before restoring the user's contents
    await sleep(100);
    if ((await clipboard.readText()) === text) await restore(prev);
  }
  const after = afterRead.ok ? afterRead.value : null;
  return {
    outcome: after === null ? 'unverified' : after.includes(text) || after !== before ? 'verified' : 'unverified',
    delayed,
    before,
    after,
  };
}

/** Copy the current selection in the foreground app; returns '' when nothing is selected. */
export async function copySelection(): Promise<string> {
  const prev = await snapshot();
  const marker = `\u2063murmur-${Date.now()}`;
  await clipboard.writeText(marker);
  releaseModifiers();
  await sleep(20);
  sendChord([VK.CONTROL], VK.C);
  let text = '';
  for (let i = 0; i < 20; i++) {
    await sleep(25);
    const t = await clipboard.readText();
    if (t !== marker) {
      text = t;
      break;
    }
  }
  await restore(prev);
  return text;
}
