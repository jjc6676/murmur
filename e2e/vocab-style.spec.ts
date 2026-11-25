import { expect, test, type Page } from '@playwright/test';
import type { DictionaryEntry } from '../src/shared/types';
import type { Settings } from '../src/shared/settings';
import { invoke, launchApp } from './helpers';

async function route(page: Page, path: string) {
  await page.evaluate((next) => {
    const browserGlobal = globalThis as unknown as { location: { hash: string } };
    browserGlobal.location.hash = `#${next}`;
  }, path);
  const title = path.slice(1).replace(/^./, (letter) => letter.toUpperCase());
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

test('dictionary and snippets support their complete editing flows', async () => {
  const { app, hub } = await launchApp();
  await hub.setViewportSize({ width: 1350, height: 850 });
  try {
    await route(hub, '/dictionary');
    await hub.locator('.m-page-header').getByRole('button', { name: 'Add new', exact: true }).click();
    await hub.getByLabel('Word').fill('Murmur');
    await hub.getByRole('button', { name: 'Add word' }).click();
    await expect(hub.getByRole('gridcell').filter({ hasText: 'Murmur' })).toBeVisible();

    await hub.locator('.m-page-header').getByRole('button', { name: 'Add new', exact: true }).click();
    await hub.getByRole('switch', { name: 'Correct a misspelling' }).click();
    await hub.getByRole('textbox', { name: 'Misspelling', exact: true }).fill('murmer');
    await hub.getByLabel('Replacement').fill('Murmur');
    await hub.getByRole('button', { name: 'Add word' }).click();
    await expect(hub.getByText('murmer → Murmur')).toBeVisible();
    expect(await invoke<string>(hub, 'dictation:formatText', 'i love murmer')).toBe('I love Murmur.');

    const murmurRow = hub.getByRole('row').filter({ hasText: /^Murmur/ });
    await murmurRow.getByRole('button', { name: 'Star' }).click();
    await hub.getByRole('button', { name: /Sort:/ }).click();
    await hub.getByRole('menuitem', { name: 'Starred first' }).click();
    await expect(hub.getByRole('row').nth(0)).toContainText('Murmur');

    await murmurRow.getByRole('button', { name: 'Edit' }).click();
    await hub.getByRole('textbox', { name: 'Word', exact: true }).fill('Murmur app');
    await hub.getByRole('button', { name: 'Save changes' }).click();
    await expect(hub.getByText('Murmur app')).toBeVisible();
    await hub.getByRole('row').filter({ hasText: 'Murmur app' }).getByRole('button', { name: 'Delete' }).click();
    await hub.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(hub.getByText('Murmur app')).toHaveCount(0);
    await hub.screenshot({ path: 'docs/parity/murmur-dictionary.png' });

    await route(hub, '/snippets');
    await hub.locator('.m-page-header').getByRole('button', { name: 'Add new', exact: true }).click();
    await hub.getByRole('textbox', { name: 'Snippet', exact: true }).fill('my intro');
    await hub.getByRole('button', { name: 'Add snippet' }).click();
    await expect(hub.getByText('Expansion is required')).toBeVisible();
    await hub.getByLabel('Expansion').fill('Hi, I am Jason. Great to meet you!');
    await hub.getByRole('button', { name: 'Add snippet' }).click();
    await expect(hub.getByText(/my intro → Hi, I am Jason/)).toBeVisible();
    await hub.locator('.m-page-header').getByRole('button', { name: 'Add new', exact: true }).click();
    await hub.getByRole('textbox', { name: 'Snippet', exact: true }).fill('formatted intro');
    await hub.getByRole('switch', { name: 'Enable rich formatting' }).click();
    await hub.getByRole('textbox', { name: 'Rich text expansion' }).fill('Hello formatted world');
    await hub.getByRole('button', { name: 'Bold' }).click();
    await hub.getByRole('button', { name: 'Add snippet' }).click();
    const snippets = await invoke<DictionaryEntry[]>(hub, 'dictionary:list', { snippets: true });
    expect(snippets.find((entry) => entry.phrase === 'formatted intro')?.replacementHtml).toContain('Hello formatted world');
    await hub.screenshot({ path: 'docs/parity/murmur-snippets.png' });
  } finally { await app.close(); }
});

test('style personalization and automatic cleanup persist', async () => {
  const { app, hub } = await launchApp();
  await hub.setViewportSize({ width: 1350, height: 850 });
  try {
    await route(hub, '/style');
    await hub.getByRole('button', { name: /Casual/ }).first().click();
    let settings = await invoke<Settings>(hub, 'settings:get');
    expect(settings.styles.personal.tone).toBe('casual');

    await hub.getByRole('button', { name: 'Start now' }).click();
    for (let step = 0; step < 4; step++) await hub.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(hub.getByText("You're all set!")).toBeVisible();
    await hub.getByRole('button', { name: 'Done' }).click();
    settings = await invoke<Settings>(hub, 'settings:get');
    expect(settings.personalizationComplete).toBe(true);

    await hub.getByRole('tab', { name: /Auto cleanup/ }).click();
    await hub.getByRole('radio', { name: /Medium/ }).check();
    settings = await invoke<Settings>(hub, 'settings:get');
    expect(settings.cleanupLevel).toBe('medium');
    await hub.getByRole('tab', { name: 'My Voice' }).click();
    await hub.getByRole('button', { name: 'Create style' }).click();
    await hub.getByLabel('Style name').fill('Customer updates');
    await hub.getByLabel('Style instructions').fill('Keep updates concise and end with a next step.');
    await hub.getByRole('button', { name: 'Save style' }).click();
    await expect(hub.getByRole('button', { name: /Customer updates/ })).toBeVisible();
    settings = await invoke<Settings>(hub, 'settings:get');
    expect(settings.customStyles[0]?.name).toBe('Customer updates');
    await hub.screenshot({ path: 'docs/parity/murmur-style.png' });
  } finally { await app.close(); }
});

test('custom transforms run, show changes, and reset', async () => {
  const { app, hub } = await launchApp({ fakeLlm: true });
  await hub.setViewportSize({ width: 1350, height: 850 });
  try {
    await route(hub, '/transforms');
    await hub.getByRole('button', { name: 'Create New' }).click();
    await hub.getByLabel('Transform name').fill('Boss Mode');
    await hub.getByLabel('Transformation prompt').fill('Rewrite as a decisive executive update.');
    await hub.getByRole('button', { name: 'Save transform' }).click();
    await expect(hub.getByRole('heading', { name: 'Boss Mode' })).toBeVisible();

    await hub.getByRole('button', { name: 'Try it out' }).click();
    await hub.getByLabel('Text to transform').fill('we should probably launch tomorrow');
    await hub.getByLabel('Transform picker').selectOption({ label: 'Boss Mode' });
    await hub.getByRole('button', { name: 'Run' }).click();
    await expect(hub.getByText('[ai] we should probably launch tomorrow', { exact: true })).toBeVisible();
    await hub.getByRole('button', { name: 'See changes' }).click();
    await expect(hub.getByRole('dialog', { name: 'Boss Mode changes' })).toBeVisible();
    await hub.getByRole('button', { name: 'Done' }).click();
    await hub.getByText('Close', { exact: true }).click();

    await hub.getByRole('button', { name: 'Reset to defaults' }).click();
    await hub.getByRole('dialog').getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(hub.getByRole('heading', { name: 'Boss Mode' })).toHaveCount(0);
    await hub.screenshot({ path: 'docs/parity/murmur-transforms.png' });
  } finally { await app.close(); }
});
