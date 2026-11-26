import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../../src/main/settingsStore';
import type { DeepPartial, Settings } from '../../src/shared/settings';

vi.mock('../../src/main/ipc', () => ({ broadcast: vi.fn() }));

const legacyButtons = { dictateButton: 4, enterButton: 5 };
const unassigned = { dictateButton: null, enterButton: null };

describe('Mouse Flow settings migration', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'murmur-mouse-flow-'));
    file = join(dir, 'settings.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function load(stored: DeepPartial<Settings>) {
    writeFileSync(file, JSON.stringify(stored));
    return new SettingsStore(file).get();
  }

  it.each([undefined, false])('removes untouched legacy bindings (configured: %s) and persists the upgrade', (mouseFlowConfigured) => {
    const upgraded = load({ version: 1, mouseFlow: legacyButtons, mouseFlowConfigured, zoom: 1.2 });
    expect(upgraded).toMatchObject({ version: 2, mouseFlow: unassigned, mouseFlowConfigured: false, zoom: 1.2 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(upgraded);
    expect(new SettingsStore(file).get()).toEqual(upgraded);
  });

  it('keeps explicitly configured Back and Forward buttons', () => {
    expect(load({ version: 1, mouseFlow: legacyButtons, mouseFlowConfigured: true }))
      .toMatchObject({ mouseFlow: legacyButtons, mouseFlowConfigured: true });
  });

  it.each([
    unassigned,
    { dictateButton: 7, enterButton: null },
    { dictateButton: null, enterButton: 5 },
  ])('preserves explicit unbindings and non-default legacy choices: %o', (mouseFlow) => {
    expect(load({ mouseFlow })).toMatchObject({ version: 2, mouseFlow, mouseFlowConfigured: true });
  });

  it('does not infer a choice when the old file has no Mouse Flow settings', () => {
    expect(load({ version: 1 })).toMatchObject({ mouseFlow: unassigned, mouseFlowConfigured: false });
  });
});
