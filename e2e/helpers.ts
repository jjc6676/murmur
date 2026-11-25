// Launch Murmur under Playwright with an isolated profile.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Launched {
  app: ElectronApplication;
  hub: Page;
  userData: string;
}

export const ROOT = resolve(__dirname, '..');

export async function launchApp(opts: { onboarded?: boolean; settings?: Record<string, unknown>; env?: Record<string, string>; fakeLlm?: boolean; hook?: boolean } = {}): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'murmur-e2e-'));
  const settings = { onboardingComplete: opts.onboarded ?? true, showFlowBar: false, launchAtLogin: false, sounds: false, ...opts.settings };
  writeFileSync(join(userData, 'settings.json'), JSON.stringify(settings));
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      MURMUR_USER_DATA: userData,
      MURMUR_FAKE_LLM: opts.fakeLlm === false ? '0' : '1',
      MURMUR_NO_HOOK: opts.hook ? '0' : '1',
      ...opts.env,
    } as Record<string, string>,
  });
  const hub = await waitForWindow(app, 'index.html');
  await hub.waitForLoadState('domcontentloaded');
  return { app, hub, userData };
}

export async function waitForWindow(app: ElectronApplication, urlPart: string, timeoutMs = 20_000): Promise<Page> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const w = app.windows().find((p) => p.url().includes(urlPart));
    if (w) return w;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`window ${urlPart} did not open`);
}

/** Invoke a Murmur API method from a renderer page. */
export function invoke<T>(page: Page, channel: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([ch, a]) => (window as unknown as { murmur: { invoke(c: string, ...x: unknown[]): Promise<unknown> } }).murmur.invoke(ch as string, ...(a as unknown[])), [channel, args] as const) as Promise<T>;
}
