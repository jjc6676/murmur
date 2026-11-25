import { expect, test } from '@playwright/test';
import { launchApp, waitForWindow } from './helpers';

test('scratchpad notes and tasks work end to end', async () => {
  const { app, hub } = await launchApp({ onboarded: true, fakeLlm: true });
  try {
    await hub.evaluate("location.hash = '#/scratchpad'");
    await expect(hub.getByRole('heading', { name: 'Scratchpad' })).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-scratchpad.png' });

    await hub.getByRole('button', { name: 'Start new note' }).click();
    const scratchpad = await waitForWindow(app, 'scratchpad.html');
    await scratchpad.waitForLoadState('domcontentloaded');
    const title = scratchpad.getByLabel('Note title');
    await expect(title).toBeVisible();
    await title.fill('Project launch thoughts');
    const editor = scratchpad.getByLabel('Note body');
    await editor.fill('Polish the launch message before Friday.');
    await editor.press('Control+A');
    await scratchpad.getByRole('button', { name: 'Bold' }).click();
    await expect(editor.locator('strong')).toContainText('Polish the launch message');
    await scratchpad.waitForTimeout(700);
    await scratchpad.screenshot({ path: 'docs/parity/murmur-scratchpad-window.png' });

    await hub.bringToFront();
    await expect(hub.getByText('Project launch thoughts')).toBeVisible();
    await hub.getByRole('button', { name: 'Pin Project launch thoughts' }).click();

    await scratchpad.bringToFront();
    await scratchpad.getByRole('button', { name: 'Transforms' }).click();
    await scratchpad.getByLabel('Transform prompt').fill('Make it concise');
    await scratchpad.getByLabel('Transform prompt').press('Enter');
    await expect(scratchpad.getByText('Custom transform')).toBeVisible();
    await hub.bringToFront();
    await hub.getByRole('button', { name: 'Delete Project launch thoughts' }).click();
    await expect(hub.getByText('Once deleted it cannot be recovered.')).toBeVisible();
    await hub.getByRole('button', { name: 'Delete note' }).click();
    await expect(hub.getByText('Project launch thoughts')).toHaveCount(0);

    await hub.evaluate("location.hash = '#/tasks'");
    await expect(hub.getByRole('heading', { name: 'My Tasks' })).toBeVisible();
    await hub.getByLabel('Add task').fill('Send launch brief');
    await hub.getByLabel('Add task').press('Enter');
    await expect(hub.locator('input[value="Send launch brief"]')).toBeVisible();
    await hub.getByLabel('Mark Send launch brief complete').check();
    await expect(hub.locator('input[value="Send launch brief"]')).toHaveCSS('text-decoration-line', 'line-through');
    await hub.getByRole('button', { name: 'Archive Send launch brief' }).click();
    await hub.getByRole('tab', { name: 'Archived' }).click();
    await expect(hub.locator('input[value="Send launch brief"]')).toBeVisible();
    await hub.getByLabel('Search tasks').fill('missing');
    await expect(hub.getByText('No tasks match your search')).toBeVisible();
    await hub.getByLabel('Search tasks').fill('launch');
    await expect(hub.locator('input[value="Send launch brief"]')).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-tasks.png' });
  } finally {
    await app.close();
  }
});
