import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { launchApp, invoke } from './helpers';

function insertHistory(db: DatabaseSync, id: string, timestamp: string, text: string, app: string, words: number, speechDuration: number): void {
  db.prepare(`INSERT INTO history (
    id, timestamp, asrText, formattedText, status, app, appTitle, duration, speechDuration,
    numWords, language, mode, cleanupLevel, styleContext, hasRevertedAI, isArchived,
    numDictionaryReplacements, numWordsCorrected, latencyMs
  ) VALUES (?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, 'en', 'ptt', 'light', 'other', 0, 0, 2, 4, 120)`)
    .run(id, timestamp, text, text, app, app === 'slack' ? 'Slack' : 'Notepad', speechDuration, speechDuration, words);
}

test('home, history, insights, notifications, skills, and memory work end to end', async () => {
  const { app, hub, userData } = await launchApp({ onboarded: true, fakeLlm: true, settings: { postOnboardingCompleted: true, profile: { firstName: 'Jason' } } });
  try {
    await hub.setViewportSize({ width: 1350, height: 850 });
    const db = new DatabaseSync(join(userData, 'murmur.sqlite'));
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 14, 30);
    insertHistory(db, 'home-seeded-one', now.toISOString(), 'A seeded home transcript for the launch plan.', 'notepad', 2400, 1200);
    insertHistory(db, 'history-seeded-two', yesterday.toISOString(), 'A searchable quarterly roadmap discussion.', 'slack', 320, 160);
    db.prepare("INSERT INTO notifications (id, type, key, title, text, isRead, isArchived, createdAt) VALUES ('notice-1', 'milestone', 'words-1000', 'One thousand words', 'Your voice is doing the heavy lifting.', 0, 0, ?)").run(now.toISOString());
    db.close();
    await hub.reload();

    await expect(hub.getByRole('heading', { name: 'Welcome back, Jason!' })).toBeVisible();
    await expect(hub.getByText('A seeded home transcript for the launch plan.')).toBeVisible();
    await expect(hub.getByText('2.7K')).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-home.png' });

    const firstRow = hub.locator('article').filter({ hasText: 'A seeded home transcript for the launch plan.' });
    await firstRow.hover();
    await firstRow.getByLabel('Copy transcript').click();
    await expect(hub.getByText('Transcript copied')).toBeVisible();
    await firstRow.getByLabel('More actions').click();
    await hub.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(hub.getByText('Once deleted, this transcript and its audio cannot be recovered.')).toBeVisible();
    await hub.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(hub.getByText('A seeded home transcript for the launch plan.')).toHaveCount(0);

    await hub.evaluate("location.hash = '#/history'");
    await expect(hub.getByRole('heading', { name: 'History' })).toBeVisible();
    await hub.getByPlaceholder('Search past transcripts').fill('quarterly roadmap');
    await expect(hub.getByText('A searchable quarterly roadmap discussion.')).toBeVisible();
    await hub.getByPlaceholder('Search past transcripts').fill('does-not-exist');
    await expect(hub.getByText('No matching dictations')).toBeVisible();
    await hub.getByPlaceholder('Search past transcripts').fill('quarterly');
    await hub.screenshot({ path: 'docs/parity/murmur-history.png' });

    await hub.evaluate("location.hash = '#/insights'");
    await expect(hub.getByRole('heading', { name: 'Insights' })).toBeVisible();
    await expect(hub.getByText('320', { exact: true }).first()).toBeVisible();
    await expect(hub.getByText('120', { exact: true }).first()).toBeVisible();
    await expect(hub.getByLabel('Activity heatmap')).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-insights.png' });

    await hub.getByLabel(/Notifications/).click();
    const notifications = hub.getByRole('dialog', { name: 'Notifications' });
    await expect(notifications).toBeVisible();
    await notifications.getByRole('button', { name: 'Mark all as read' }).click();
    await expect.poll(() => invoke<number>(hub, 'notifications:unreadCount')).toBe(0);
    await notifications.getByRole('button', { name: 'Close' }).click();

    await hub.evaluate("location.hash = '#/skills'");
    await expect(hub.getByRole('heading', { name: 'Skills' })).toBeVisible();
    await hub.getByRole('button', { name: 'Create Skill' }).click();
    await hub.getByLabel('Name').fill('Launch recap');
    await hub.getByLabel('One-line description').fill('Create a launch recap.');
    await hub.getByLabel('Instructions').fill('Summarize decisions and next steps.');
    await hub.getByLabel('Slash command').fill('Bad--Command');
    await hub.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(hub.getByText('Slash command must use lowercase letters, numbers, and single hyphens')).toBeVisible();
    await hub.getByLabel('Slash command').fill('launch-recap');
    await hub.getByRole('button', { name: 'Save', exact: true }).click();
    await hub.getByRole('tab', { name: 'My Skills' }).click();
    await expect(hub.getByRole('button', { name: /Launch recap/ })).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-skills.png' });

    await hub.evaluate("location.hash = '#/memory'");
    await expect(hub.getByRole('heading', { name: 'Build your memory' })).toBeVisible();
    await hub.getByRole('button', { name: 'Start' }).click();
    await expect(hub.getByRole('button', { name: 'Knowledge' })).toBeVisible({ timeout: 20_000 });
    await expect(hub.getByRole('button', { name: 'Dictation writing style' })).toBeVisible();
    await hub.screenshot({ path: 'docs/parity/murmur-memory.png' });
  } finally {
    await app.close();
  }
});
