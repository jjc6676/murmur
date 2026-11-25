import { expect, test } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoke, launchApp, ROOT, waitForWindow } from './helpers';

function rpc(proc: ChildProcessWithoutNullStreams, id: number, method: string, params: unknown = {}): Promise<Record<string, unknown>> {
  const { promise, resolve, reject } = Promise.withResolvers<Record<string, unknown>>();
  const onData = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      const value: unknown = JSON.parse(line);
      if (value && typeof value === 'object' && 'id' in value && value.id === id) {
        proc.stdout.off('data', onData);
        resolve(value as Record<string, unknown>);
      }
    }
  };
  proc.stdout.on('data', onData);
  proc.once('error', reject);
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return promise;
}
test('records, summarizes, organizes, imports, chats, and exposes MCP', async () => {
  test.setTimeout(180_000);
  const fixture = join(ROOT, 'tests', 'fixtures', 'dictation-sample.wav');
  const { app, hub, userData } = await launchApp({ settings: { postOnboardingCompleted: true }, env: { MURMUR_FAKE_MIC_WAV: fixture } });
  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  await expect(hub.getByRole('heading', { name: 'Notetaker' })).toBeVisible();
  await hub.screenshot({ path: 'docs/parity/murmur-notetaker.png' });

  await hub.getByRole('button', { name: 'Start Notetaker' }).click();
  const notepad = await waitForWindow(app, 'recorder.html');
  await notepad.getByRole('tab', { name: 'Transcript' }).click();
  await notepad.waitForTimeout(15_000);
  await expect(notepad.getByText(/meeting/i).first()).toBeVisible({ timeout: 45_000 });
  await notepad.screenshot({ path: 'docs/parity/murmur-notepad.png' });
  await notepad.getByRole('button', { name: 'Stop listening' }).click();
  await expect(notepad.getByText('Discussion')).toBeVisible({ timeout: 45_000 });

  await hub.bringToFront();
  await hub.reload();
  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  const row = hub.getByRole('link', { name: /Test meeting/ }).first();
  await expect(row).toBeVisible();
  await row.click();
  await hub.screenshot({ path: 'docs/parity/murmur-meeting.png' });
  const todos = await invoke<{ title: string }[]>(hub, 'todos:list', { archived: false });
  expect(todos.some((todo) => todo.title === 'Follow up')).toBe(true);

  const title = hub.getByLabel('Meeting title');
  await title.fill('Weekly product sync');
  await title.press('Enter');
  await expect(title).toHaveValue('Weekly product sync');

  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  await hub.getByRole('tab', { name: 'Folders' }).click();
  hub.once('dialog', (dialog) => dialog.accept('Product'));
  await hub.getByRole('button', { name: 'New folder' }).click();
  await expect(hub.getByText('Product', { exact: true })).toBeVisible();
  await hub.getByRole('tab', { name: 'Past notes' }).click();
  await hub.getByRole('link', { name: /Weekly product sync/ }).click();
  await hub.getByLabel('Product').check();

  const transcriptPath = join(userData, 'import-me.txt');
  writeFileSync(transcriptPath, 'You: This imported meeting covers the launch plan.\nAlex: I will prepare the checklist.');
  const imported = await invoke(hub, 'meetings:importFiles', [transcriptPath]);
  expect(imported).toBeTruthy();
  await hub.reload();
  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  await hub.getByRole('link', { name: /import me/i }).click();
  await hub.getByPlaceholder('Ask anything, or type / for Skills').fill('What is this meeting about?');
  await hub.getByRole('button', { name: 'Send' }).click();
  await expect(hub.getByText(/\[ai\]/)).toBeVisible();

  const mcp = spawn(process.execPath, [join(ROOT, 'scripts', 'murmur-mcp.mjs'), join(userData, 'murmur.sqlite')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const initialized = await rpc(mcp, 1, 'initialize', { protocolVersion: '2025-06-18' });
  expect(initialized.result).toBeTruthy();
  const listed = await rpc(mcp, 2, 'tools/list');
  expect(JSON.stringify(listed)).toContain('search_meetings');
  const searched = await rpc(mcp, 3, 'tools/call', { name: 'search_meetings', arguments: { query: 'launch' } });
  expect(JSON.stringify(searched)).toContain('import me');
  mcp.kill();
  await app.close();
});
