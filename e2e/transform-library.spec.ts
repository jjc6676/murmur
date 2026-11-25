import { expect, test, type Page } from '@playwright/test';
import { TRANSFORM_COLLECTIONS } from '../src/shared/transformLibrary';
import { invoke, launchApp, waitForWindow } from './helpers';

async function openTransforms(page: Page) {
  await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as { location: { hash: string } };
    browserGlobal.location.hash = '#/transforms';
  });
  await expect(page.getByRole('heading', { name: 'Transforms', level: 1 })).toBeVisible();
}

test('library transforms can be browsed, added, picked, searched, and removed', async () => {
  const collection = TRANSFORM_COLLECTIONS[0];
  const transform = collection?.transforms[0];
  expect(collection).toBeTruthy();
  expect(transform).toBeTruthy();
  if (!collection || !transform) return;

  const { app, hub } = await launchApp();
  await hub.setViewportSize({ width: 1350, height: 850 });
  try {
    await openTransforms(hub);
    const library = hub.getByRole('region', { name: 'Transform library' });
    await library.getByRole('tab', { name: new RegExp(`^${collection.name}`) }).click();
    await expect(library.getByRole('heading', { name: collection.name, level: 3 })).toBeVisible();
    await library.getByRole('textbox', { name: 'Search transform library' }).fill(transform.name);
    const libraryCard = library.getByRole('article').filter({ has: hub.getByRole('heading', { name: transform.name }) });
    await expect(libraryCard).toBeVisible();
    await libraryCard.getByRole('button', { name: 'Add', exact: true }).click();

    const mine = hub.getByRole('region', { name: 'My Transforms grouped by collection' });
    await expect(mine.getByRole('heading', { name: transform.name })).toBeVisible();
    await expect(libraryCard.getByRole('button', { name: 'Added', exact: true })).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-transform-library.png', fullPage: true });

    await invoke(hub, 'transforms:openPicker');
    const picker = await waitForWindow(app, 'transform-picker.html');
    await expect(picker.getByRole('heading', { name: 'Apply transform' })).toBeVisible();
    await expect(picker.getByRole('option', { name: new RegExp(transform.name) })).toBeVisible();
    const pickerSearch = picker.getByRole('textbox', { name: 'Search transforms' });
    await pickerSearch.fill('no transform has this phrase');
    await expect(picker.getByText('No transforms match')).toBeVisible();
    await pickerSearch.fill(transform.name);
    await expect(picker.getByRole('option', { name: new RegExp(transform.name) })).toBeVisible();
    await picker.screenshot({ path: 'docs/parity/murmur-transform-picker.png' });
    await invoke(hub, 'transforms:closePicker');

    await libraryCard.getByRole('button', { name: 'Added', exact: true }).click();
    await expect(mine.getByRole('heading', { name: transform.name })).toHaveCount(0);
    await expect(libraryCard.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});
