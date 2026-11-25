import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { launchApp } from './helpers';

const dismissedBanners = ['home-redesign', 'default-hold-to-dictate', 'snippets', 'microphone-quiz', 'mouse-flow'];

test('hub gap features work with local data', async () => {
  const { app, hub, userData } = await launchApp({
    onboarded: true,
    fakeLlm: true,
    settings: { postOnboardingCompleted: true, dismissedBanners },
  });
  try {
    const db = new DatabaseSync(join(userData, 'murmur.sqlite'));
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO history (
      id, timestamp, asrText, formattedText, status, app, appTitle, duration, speechDuration,
      numWords, language, mode, cleanupLevel, styleContext, hasRevertedAI, isArchived,
      numDictionaryReplacements, numWordsCorrected, latencyMs, accessibilityContext
    ) VALUES ('gap-feedback', ?, 'rough launch update', 'Polished launch update.', 'success',
      'notepad', 'Notepad', 10, 8, 3, 'en', 'ptt', 'light', 'other', 0, 0, 0, 1, 50,
      'Window: Notepad\nControl: Edit')`).run(now);
    db.close();
    await hub.reload();
    const welcomeBack = hub.getByRole('dialog', { name: 'Welcome back' });
    if (await welcomeBack.isVisible()) await welcomeBack.getByRole('button', { name: 'Not now' }).click();

    const row = hub.locator('article').filter({ hasText: 'Polished launch update.' });
    await row.getByLabel('More actions').click();
    await hub.getByRole('menuitem', { name: 'Send feedback' }).click();
    await expect(hub.getByRole('dialog', { name: 'Report to Improve Model' })).toBeVisible();
    await hub.getByLabel('Expected output').fill('Concise launch update.');
    await hub.getByLabel('Bug comments').fill('Keep the original meaning.');
    await hub.getByRole('button', { name: 'Save report' }).click();
    await expect(hub.getByText('Report saved locally')).toBeVisible();

    await row.getByLabel('More actions').click();
    await hub.getByRole('menuitem', { name: 'Open AX inspector' }).click();
    await expect(hub.getByText('Window: Notepad')).toBeVisible();
    await hub.getByRole('dialog', { name: 'Accessibility context' }).getByRole('button', { name: 'Close' }).click();

    await hub.evaluate("location.hash = '#/insights'");
    await expect(hub.getByText('You’ve been Murmuring. Hard.')).toBeVisible();
    await expect(hub.getByText(/usage/).first()).toBeVisible();
    await expect(hub.getByText('For you · Meetings')).toBeVisible();

    await hub.evaluate("location.hash = '#/tasks'");
    await hub.getByLabel('Add task').fill('Prepare customer follow-up');
    await hub.getByLabel('Add task').press('Enter');
    await hub.getByLabel('More actions for Prepare customer follow-up').click();
    await hub.getByRole('menuitem', { name: 'High priority' }).click();
    await hub.getByRole('tab', { name: 'By priority' }).click();
    await expect(hub.getByText('High', { exact: true })).toBeVisible();
    await hub.getByLabel('More actions for Prepare customer follow-up').click();
    await hub.getByRole('menuitem', { name: 'Send email…' }).click();
    await expect(hub.getByRole('dialog', { name: 'Send email' })).toBeVisible();
    await expect(hub.getByLabel('Subject')).toHaveValue('Prepare customer follow-up');
    await hub.getByRole('button', { name: 'Cancel' }).click();

    await hub.evaluate("location.hash = '#/memory'");
    await expect(hub.getByText('Meeting agent · Notetaker meetings')).toBeVisible();
    await expect(hub.getByText('Dreamer · Nightly tidy-up (1–5 a.m.)')).toBeVisible();

    await hub.evaluate("location.hash = '#/style'");
    await expect(hub.getByLabel('Custom instructions for Personal messages')).toBeVisible();
    await hub.getByLabel('Custom instructions for Personal messages').fill('Keep messages short and warm.');
  } finally {
    await app.close();
  }
});
