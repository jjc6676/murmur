// Flow bar window: informational hover hint, explicit menu start, live waveform, cancel.
// Also captures the post-onboarding dialog for parity.
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { invoke, launchApp, ROOT, waitForWindow } from './helpers';

test('flow bar hint is inert and its menu starts hands-free dictation', async () => {
  const { app, hub } = await launchApp({ settings: { showFlowBar: true }, env: { MURMUR_FAKE_MIC_WAV: join(ROOT, 'tests', 'fixtures', 'dictation-sample.wav') } });
  try {
    const bar = await waitForWindow(app, 'status.html');
    const pill = bar.getByLabel('Murmur Flow Bar');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-phase', 'resting');
    await bar.screenshot({ path: 'docs/parity/murmur-flow-bar.png' });

    await pill.hover();
    const hint = pill.getByText('to dictate');
    const menuButton = pill.getByRole('button', { name: 'Flow Bar menu' });
    const menu = bar.getByRole('menu');
    await expect(hint).toBeVisible();
    await expect(pill).toHaveAttribute('data-phase', 'resting');
    await expect(menu).toBeHidden();
    await hint.click();
    expect((await invoke<{ phase: string }>(bar, 'dictation:getState')).phase).toBe('resting');
    await expect(menu).toBeHidden();

    await hint.click({ button: 'right' });
    await expect(menu.getByRole('menuitem', { name: 'Start Notetaker' })).toBeVisible();
    await menuButton.click();
    await expect(menu).toBeHidden();
    await menuButton.click();
    await menu.getByRole('menuitem', { name: 'Start hands-free dictation' }).click();
    await expect(pill).toHaveAttribute('data-phase', 'active_popo');
    await expect(bar.getByLabel('Finish and paste')).toBeVisible();
    await bar.screenshot({ path: 'docs/parity/murmur-flow-bar-active.png' });

    await bar.getByLabel('Cancel').click();
    await expect(pill).toHaveAttribute('data-phase', 'resting');
    await expect(bar.getByText('Transcript cancelled')).toBeVisible();
    await expect.poll(async () => (await invoke<{ status: string }[]>(hub, 'history:list', { limit: 1 }))[0]?.status).toBe('cancelled');
  } finally {
    await app.close();
  }
});

test('post-onboarding dialog saves the chosen use cases', async () => {
  const { app, hub } = await launchApp({ settings: { postOnboardingCompleted: false } });
  try {
    await expect(hub.getByText('How would you like to use Murmur first?')).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-post-onboarding.png' });
    await hub.getByText('Chat with AI', { exact: true }).click();
    await hub.getByRole('button', { name: 'Try it now' }).click();
    await expect.poll(async () => (await invoke<{ postOnboardingCompleted: boolean }>(hub, 'settings:get')).postOnboardingCompleted).toBe(true);
  } finally {
    await app.close();
  }
});
