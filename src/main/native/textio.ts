// Text insertion/extraction in the foreground app via the clipboard + synthetic keystrokes.
import { clipboard, ClipboardItem } from 'electron';
import { focusWindow, getForegroundApp, releaseModifiers, sendChord, VK, type ForegroundApp } from './win32';

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

/** Insert text at the caret of the focused (or target) window. */
export async function pasteText(text: string, opts: PasteOptions = {}): Promise<void> {
  const prev = opts.restoreClipboard === false ? null : await snapshot();
  if (opts.html) await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': opts.html })]);
  else await clipboard.writeText(text);
  if (opts.target?.hwnd) {
    const fg = getForegroundApp();
    if (fg.hwnd !== opts.target.hwnd) {
      focusWindow(opts.target.hwnd);
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
  if (prev) {
    // give the target app time to read the clipboard before restoring the user's contents
    await sleep(450);
    if ((await clipboard.readText()) === text) await restore(prev);
  }
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
