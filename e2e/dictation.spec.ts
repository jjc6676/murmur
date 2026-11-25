// End-to-end dictation on the real desktop: global push-to-talk hotkey -> fake mic (WAV) -> whisper -> paste into Notepad.
// Uses real synthetic keyboard input, so it briefly takes over the keyboard focus.
import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findWindows, focusWindow, getForegroundApp, keyDown, keyUp, sendChord, VK } from '../src/main/native/win32';
import { invoke, launchApp, ROOT } from './helpers';
import type { HistoryEntry } from '../src/shared/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs: number, what: string): Promise<T> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

test('hold Ctrl+Win in Notepad: dictation is cleaned, pasted, listed on Home and counted in stats', async () => {
  test.setTimeout(150_000);
  const fixture = join(ROOT, 'tests', 'fixtures', 'dictation-ptt.wav');
  const { app, hub } = await launchApp({ hook: true, env: { MURMUR_FAKE_MIC_WAV: fixture }, settings: { postOnboardingCompleted: true } });
  try {
    await waitFor(async () => (await invoke<{ ready: boolean }>(hub, 'engines:asrStatus')).ready, 60_000, 'speech model to load');

    const dir = mkdtempSync(join(tmpdir(), 'murmur-notepad-'));
    const file = join(dir, 'murmur-dictation-e2e.txt');
    writeFileSync(file, '');
    spawn('notepad.exe', [file], { detached: true, stdio: 'ignore' }).unref();
    const win = await waitFor(async () => findWindows('murmur-dictation-e2e')[0], 20_000, 'Notepad window');
    await sleep(800);
    focusWindow(win.hwnd);
    await waitFor(async () => {
      const fg = getForegroundApp();
      return fg.processName === 'notepad' && fg.title.includes('murmur-dictation-e2e') ? fg : null;
    }, 10_000, 'Notepad to be focused');

    // Hold the default push-to-talk shortcut while the fake microphone plays the sample.
    // Always release: a failure while held would leave Ctrl+Win stuck down for the whole desktop.
    keyDown(VK.CONTROL);
    keyDown(VK.LWIN);
    try {
      await waitFor(async () => (await invoke<{ phase: string }>(hub, 'dictation:getState')).phase === 'active_ptt', 5_000, 'recording to start');
      await sleep(8_000);
    } finally {
      keyUp(VK.LWIN);
      keyUp(VK.CONTROL);
    }

    const entry = await waitFor(async () => {
      const list = await invoke<HistoryEntry[]>(hub, 'history:list', { limit: 1 });
      return list[0]?.status === 'success' ? list[0] : null;
    }, 60_000, 'dictation to be processed');
    await waitFor(async () => (await invoke<{ phase: string }>(hub, 'dictation:getState')).phase !== 'processing', 20_000, 'paste');
    await sleep(1_500);

    // Save Notepad and read what was inserted.
    focusWindow(win.hwnd);
    await sleep(300);
    sendChord([VK.CONTROL], 0x53 /* S */);
    const pasted = await waitFor(async () => {
      const t = existsSync(file) ? readFileSync(file, 'utf8') : '';
      return t.trim() ? t : null;
    }, 10_000, 'Notepad to save');
    sendChord([VK.CONTROL], 0x57 /* W: close our tab only */);

    expect(pasted).toMatch(/move the meeting to thursday/i);
    expect(pasted).not.toMatch(/\b(um|uh)\b/i);
    expect(pasted.trim()).toMatch(/^[A-Z]/);
    expect(pasted.trim()).toMatch(/[.!?]$/);
    expect(entry.formattedText.trim()).toBe(pasted.trim());
    expect(entry.app).toBe('notepad');

    // Listed on Home with the same text, and stats updated.
    await hub.bringToFront();
    await hub.evaluate("location.hash = '#/'");
    await expect(hub.getByText(entry.formattedText.trim().slice(0, 30), { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    const stats = await invoke<{ totalWords: number; averageWpm: number; dayStreak: number }>(hub, 'stats:get');
    expect(stats.totalWords).toBeGreaterThanOrEqual(entry.numWords);
    expect(stats.averageWpm).toBeGreaterThan(0);
    expect(stats.dayStreak).toBe(1);
    await hub.screenshot({ path: 'docs/parity/murmur-home-after-dictation.png' });
  } finally {
    await app.close();
  }
});
