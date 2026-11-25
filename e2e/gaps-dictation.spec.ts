import { expect, test } from '@playwright/test';
import { invoke, launchApp, waitForWindow } from './helpers';

test('app-specific raw format bypasses cleanup while other apps remain formatted', async () => {
  const { app, hub } = await launchApp({ settings: { appTranscriptionFormats: [{ app: 'notepad', format: 'raw' }] } });
  try {
    const raw = await invoke<string>(hub, 'dictation:formatText', 'um hello there', 'notepad');
    const formatted = await invoke<string>(hub, 'dictation:formatText', 'um hello there', 'winword');
    expect(raw).toBe('um hello there');
    expect(formatted).toBe('Hello there.');
  } finally {
    await app.close();
  }
});

test('Flow Bar context menu exposes microphone and auto-transform controls', async () => {
  const { app, hub } = await launchApp({ settings: { showFlowBar: true } });
  try {
    const bar = await waitForWindow(app, 'status.html');
    await bar.getByLabel('Murmur Flow Bar').click({ button: 'right' });
    await expect(bar.getByText('Microphone', { exact: true }).first()).toBeVisible();
    await expect(bar.getByText('Auto Apply After Dictation', { exact: true })).toBeVisible();
    await expect(bar.getByText('Configure transforms', { exact: true })).toBeVisible();
    await bar.getByRole('menuitemcheckbox', { name: 'Enabled' }).click();
    await expect.poll(async () => (await invoke<{ autoApplyAfterDictation: { active: boolean } }>(hub, 'settings:get')).autoApplyAfterDictation.active).toBe(true);
  } finally {
    await app.close();
  }
});
