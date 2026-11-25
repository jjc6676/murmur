import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { launchApp, ROOT, waitForWindow } from './helpers';

test('introduces first-time Notetaker and explains calendar enrichment', async () => {
  const { app, hub } = await launchApp({ settings: { postOnboardingCompleted: true } });
  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();

  await expect(hub.getByRole('heading', { name: 'Welcome to Murmur Notetaker' })).toBeVisible();
  await expect(hub.getByText(/local transcript, creates a clear summary/i)).toBeVisible();
  await hub.getByRole('button', { name: 'Maybe later' }).click();
  await expect(hub.getByText(/Add participant names, accurate speaker labels, action items, and a full summary/i)).toBeVisible();

  await app.close();
});

test('offers auto-start and plays the first local speaker segment', async () => {
  test.setTimeout(120_000);
  const fixture = join(ROOT, 'tests', 'fixtures', 'dictation-sample.wav');
  const { app, hub } = await launchApp({
    settings: {
      postOnboardingCompleted: true,
      dismissedBanners: ['notetaker:welcome'],
      notetaker: { meetingCount: 1, autoStart: false, autoStartOptInState: 'none', translationLanguage: 'Spanish' },
    },
    env: { MURMUR_FAKE_MIC_WAV: fixture },
  });
  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  await expect(hub.getByText('Start Notetaker automatically')).toBeVisible();

  await hub.getByRole('button', { name: 'Start Notetaker' }).click();
  const notepad = await waitForWindow(app, 'recorder.html');
  await notepad.getByRole('tab', { name: 'Transcript' }).click();
  await notepad.waitForTimeout(15_000);
  await notepad.getByRole('button', { name: 'Stop listening' }).click();
  await expect(notepad.getByText('Enhanced Summary')).toBeVisible({ timeout: 45_000 });

  await hub.bringToFront();
  await hub.reload();
  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  await hub.getByRole('link', { name: /Test meeting/ }).first().click();
  await hub.getByRole('tab', { name: 'Transcript' }).click();
  await expect(hub.getByText(/Translated from EN\. Original available\./).first()).toBeVisible();
  const play = hub.getByRole('button', { name: /Play Speaker 1 clip/ }).first();
  await play.click();
  await expect(hub.getByRole('button', { name: /Stop Speaker 1 clip/ }).first()).toBeVisible();

  await app.close();
});
