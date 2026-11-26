import { expect, test } from '@playwright/test';
import { validateCombo } from '../src/shared/hotkeys';
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

test('rich snippets retain HTML with a plain-text formatting fallback', async () => {
  const { app, hub } = await launchApp();
  try {
    await invoke(hub, 'dictionary:add', { phrase: 'project signature', replacement: 'Best,\nJason', replacementHtml: '<p><strong>Best,</strong><br>Jason</p>', isSnippet: true });
    const snippets = await invoke<{ phrase: string; replacement: string | null; replacementHtml: string | null }[]>(hub, 'dictionary:list', { snippets: true });
    expect(snippets[0]).toMatchObject({ phrase: 'project signature', replacement: 'Best,\nJason' });
    expect(snippets[0].replacementHtml).toContain('<strong>Best,</strong>');
    expect(await invoke<string>(hub, 'dictation:formatText', 'project signature')).toContain('Best,\nJason');
  } finally {
    await app.close();
  }
});

test('custom voice profiles override built-in app cleanup', async () => {
  const now = new Date().toISOString();
  const { app, hub } = await launchApp({ settings: { cleanupLevel: 'light', customStyles: [{ id: 'slack-brief', name: 'Slack brief', tone: 'casual', cleanupLevel: 'none', instructions: 'Keep it brief.', apps: ['slack'], createdAt: now, modifiedAt: now }] } });
  try {
    expect(await invoke<string>(hub, 'dictation:formatText', 'um hello there', 'slack')).toBe('um hello there');
    expect(await invoke<string>(hub, 'dictation:formatText', 'um hello there', 'notepad')).toBe('Hello there.');
  } finally {
    await app.close();
  }
});

test('Mouse Flow is opt-in and side buttons remain available as shortcuts', async () => {
  const { app, hub } = await launchApp();
  try {
    const settings = await invoke<{ mouseFlow: { dictateButton: number | null; enterButton: number | null }; mouseFlowConfigured: boolean }>(hub, 'settings:get');
    expect(settings.mouseFlow).toEqual({ dictateButton: null, enterButton: null });
    expect(settings.mouseFlowConfigured).toBe(false);
    expect(validateCombo('Ctrl+CtrlRight+K', 'ptt', {})).toContain('left or right');
    expect(validateCombo('Mouse 10', 'ptt', {})).toBeNull();
    expect(validateCombo('Aux Button', 'ptt', {})).toBeNull();
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
    await expect(bar.getByText('Mute reminder for 12 hours', { exact: true })).toBeVisible();
    await expect(bar.getByText('Reminder controls', { exact: true })).toBeVisible();
    await bar.getByRole('menuitemcheckbox', { name: 'Enabled' }).click();
    await expect.poll(async () => (await invoke<{ autoApplyAfterDictation: { active: boolean } }>(hub, 'settings:get')).autoApplyAfterDictation.active).toBe(true);
  } finally {
    await app.close();
  }
});
