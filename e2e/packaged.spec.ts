// Smoke-test a packaged Murmur.exe (path via MURMUR_EXE) with an isolated profile.
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invoke, waitForWindow } from './helpers';

test('packaged app launches, loads speech model, formats text, exposes MCP script', async () => {
  const exe = process.env.MURMUR_EXE;
  test.skip(!exe, 'MURMUR_EXE not set');
  const userData = mkdtempSync(join(tmpdir(), 'murmur-pkg-'));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingComplete: true, postOnboardingCompleted: true, launchAtLogin: false, showFlowBar: true }));
  const app = await electron.launch({ executablePath: exe!, env: { ...process.env, MURMUR_USER_DATA: userData, MURMUR_NO_HOOK: '1' } as Record<string, string> });
  try {
    const hub = await waitForWindow(app, 'index.html');
    await expect(hub.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await waitForWindow(app, 'status.html');
    await expect.poll(async () => (await invoke<{ ready: boolean; error: string | null }>(hub, 'engines:asrStatus')).ready, { timeout: 60_000 }).toBe(true);
    expect(await invoke<string>(hub, 'dictation:formatText', 'um so i think it works')).toBe('So I think it works.');
    const mcp = await invoke<{ args: string[] }>(hub, 'mcp:serverCommand');
    console.log('mcp', JSON.stringify(mcp.args));
    const info = await invoke<{ isPackaged: boolean }>(hub, 'app:getPlatformInfo');
    expect(info.isPackaged).toBe(true);
    await hub.screenshot({ path: 'test-results/packaged-hub.png' });
  } finally {
    await app.close();
  }
});
