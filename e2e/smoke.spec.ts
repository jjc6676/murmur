import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('hub launches with sidebar navigation', async () => {
  const { app, hub } = await launchApp();
  await expect(hub.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  for (const label of ['Home', 'Notetaker', 'Insights', 'Dictionary', 'Snippets', 'Style', 'Transforms', 'Scratchpad']) {
    await expect(hub.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await hub.screenshot({ path: 'test-results/smoke-hub.png' });
  await app.close();
});
