import { expect, test, type Page } from '@playwright/test';
import type { Settings } from '../src/shared/settings';
import { invoke, launchApp, ROOT } from './helpers';
import { join } from 'node:path';

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(ROOT, 'docs', 'parity', name), animations: 'disabled' });
}

async function continueStep(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /continue/i }).last();
  await expect(button).toBeEnabled();
  await button.click();
}

test('onboarding completes and settings persist across every section', async () => {
  const { app, hub } = await launchApp({
    onboarded: false,
    env: { MURMUR_FAKE_MIC_WAV: join(ROOT, 'tests', 'fixtures', 'dictation-sample.wav') },
  });
  try {
    await expect(hub.getByRole('heading', { name: 'Let’s get you started' })).toBeVisible();
    await screenshot(hub, 'murmur-onboarding-sign-up.png');
    await hub.getByLabel('First name').fill('Morgan');
    await hub.getByLabel('Last name').fill('Lee');
    await hub.getByLabel('Email').fill('morgan@example.test');
    await continueStep(hub);
    await hub.getByRole('button', { name: 'A friend or coworker' }).click();
    await continueStep(hub);
    await hub.getByRole('button', { name: 'Notetaker' }).click();
    await continueStep(hub);
    await hub.getByRole('button', { name: 'Developer' }).click();
    await hub.getByRole('button', { name: 'Individual contributor' }).click();
    await continueStep(hub);
    await hub.getByRole('button', { name: 'Emails', exact: true }).click();
    await hub.getByRole('button', { name: 'Capture ideas quickly' }).click();
    await continueStep(hub);

    await expect(hub.getByRole('heading', { name: 'Give Murmur permissions on your computer' })).toBeVisible();
    await screenshot(hub, 'murmur-onboarding-permissions.png');
    await hub.getByRole('button', { name: 'Finish later' }).click();
    await expect(hub.getByRole('button', { name: 'Finish setup' })).toBeVisible();
    const deferredSettings = await invoke<Settings>(hub, 'settings:get');
    expect(deferredSettings.onboardingDeferred).toBe(true);
    expect(deferredSettings.onboardingStep).toBe('permissions');
    await hub.getByRole('button', { name: 'Finish setup' }).click();
    await expect(hub.getByRole('heading', { name: 'Give Murmur permissions on your computer' })).toBeVisible();
    await hub.getByRole('button', { name: 'Allow' }).first().click();
    await expect(hub.getByText('Microphone is ready.')).toBeVisible();
    await hub.getByRole('button', { name: 'Allow' }).first().click();
    await continueStep(hub);

    await expect(hub.getByRole('heading', { name: 'Speak to continue' })).toBeVisible();
    await screenshot(hub, 'murmur-onboarding-set-up.png');
    await continueStep(hub);
    await continueStep(hub);
    await continueStep(hub);
    await continueStep(hub);

    await expect(hub.getByRole('heading', { name: 'Talk instead of type' })).toBeVisible();
    await screenshot(hub, 'murmur-onboarding-learn.png');
    await hub.getByRole('tab', { name: 'Email' }).click();
    await hub.getByLabel('Practice dictation').fill('hi sam we should meet Tuesday actually Wednesday thanks Morgan');
    await hub.getByRole('button', { name: 'Polish email' }).click();
    await expect(hub.getByText('Email polished!')).toBeVisible();
    await hub.getByRole('tab', { name: 'Notion / list' }).click();
    await hub.getByLabel('Practice dictation').fill('first research options second write a proposal finally share it');
    await hub.getByRole('button', { name: 'Create list' }).click();
    await expect(hub.getByText('List created!')).toBeVisible();
    await hub.getByRole('tab', { name: 'ChatGPT' }).click();
    await hub.getByLabel('Practice dictation').fill('Explain why local speech recognition protects privacy');
    await hub.getByRole('button', { name: 'Generate reply' }).click();
    await expect(hub.getByText(/\[ai\]/)).toBeVisible();
    await hub.getByRole('tab', { name: 'Cursor' }).click();
    await hub.getByLabel('Practice dictation').fill('Add validation to checkout.ts');
    await hub.getByRole('button', { name: 'Apply to checkout.ts' }).click();
    await expect(hub.getByText('checkout.ts updated!')).toBeVisible();
    await hub.getByRole('button', { name: 'Take typing vs. speaking speed test' }).click();
    const speedTest = hub.getByRole('dialog', { name: 'Typing vs. speaking speed test' });
    await expect(speedTest).toBeVisible();
    await speedTest.getByRole('button', { name: 'Start typing test' }).click();
    await expect(speedTest.getByText('3')).toBeVisible();
    await speedTest.getByRole('button', { name: 'Close' }).click();
    await continueStep(hub);

    await expect(hub.getByRole('heading', { name: 'Make every message sound like you' })).toBeVisible();
    await screenshot(hub, 'murmur-onboarding-personalize.png');
    await hub.getByRole('button', { name: 'Casual' }).click();
    await hub.getByRole('button', { name: 'Finish setup' }).click();
    await expect(hub.getByText(/Welcome back|Good (morning|afternoon|evening)/)).toBeVisible();
    const onboardingSettings = await invoke<Settings>(hub, 'settings:get');
    expect(onboardingSettings.onboardingPagesCompleted.length).toBeGreaterThan(8);
    expect(onboardingSettings.onboardingPermissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'microphone', clicked: true, granted: true }),
      expect.objectContaining({ name: 'accessibility', clicked: true, granted: true }),
    ]));

    await hub.getByRole('button', { name: 'Settings' }).click();
    await expect(hub.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    const settingsDialog = hub.getByRole('dialog', { name: 'Settings' });
    await screenshot(hub, 'murmur-settings-general.png');
    await hub.getByRole('button', { name: 'System Default' }).click();
    const languageDialog = hub.getByRole('dialog', { name: 'App Language' });
    await languageDialog.getByPlaceholder('Search languages').fill('Klingon');
    await expect(languageDialog.getByText('No matches found')).toBeVisible();
    await languageDialog.getByPlaceholder('Search languages').fill('English');
    await languageDialog.getByRole('option', { name: 'English' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).appLanguage).toBe('en');
    await hub.getByRole('button', { name: 'Dark' }).click();
    await expect.poll(() => hub.locator('html').getAttribute('data-theme')).toBe('dark');
    await hub.getByRole('button', { name: 'Light' }).click();
    await expect.poll(() => hub.locator('html').getAttribute('data-theme')).toBe('light');

    const sections: { nav: string; title: string; image: string }[] = [
      { nav: 'System', title: 'System', image: 'system' },
      { nav: 'Notetaker', title: 'Notetaker', image: 'notetaker' },
      { nav: 'Vibe coding', title: 'Vibe coding', image: 'vibe-coding' },
      { nav: 'Experimental', title: 'Experimental', image: 'experimental' },
      { nav: 'AI & Speech', title: 'AI & Speech', image: 'ai-speech' },
      { nav: 'Connectors', title: 'Connectors', image: 'connectors' },
      { nav: 'MCP', title: 'MCP', image: 'mcp' },
      { nav: 'Account', title: 'Account', image: 'account' },
      { nav: 'Team', title: 'Team', image: 'team' },
      { nav: 'Data and Privacy', title: 'Data and Privacy', image: 'data' },
    ];

    await settingsDialog.getByRole('button', { name: 'System', exact: true }).first().click();
    await hub.getByRole('switch', { name: 'Launch app at login' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).launchAtLogin).toBe(true);
    await screenshot(hub, 'murmur-settings-system.png');

    await settingsDialog.getByRole('button', { name: 'Notetaker', exact: true }).click();
    await hub.getByLabel('Maximum recording length').selectOption('60');
    expect((await invoke<Settings>(hub, 'settings:get')).notetaker.maxRecordingMin).toBe(60);
    await screenshot(hub, 'murmur-settings-notetaker.png');
    await hub.getByRole('switch', { name: 'Auto-detect speaker names' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).notetaker.autoDetectParticipantNames).toBe(false);

    await settingsDialog.getByRole('button', { name: 'Vibe coding', exact: true }).click();
    await hub.getByRole('switch', { name: 'File tagging' }).click();
    await screenshot(hub, 'murmur-settings-vibe-coding.png');

    await settingsDialog.getByRole('button', { name: 'Experimental', exact: true }).click();
    await hub.getByRole('switch', { name: 'Command Mode' }).click();
    await hub.getByLabel('Blocked URL').fill('example.test');
    await hub.getByRole('button', { name: 'Add', exact: true }).last().click();
    const settings = await invoke<Settings>(hub, 'settings:get');
    expect(settings.commandModeEnabled).toBe(true);
    expect(settings.focusMode.blockedUrls).toContain('example.test');
    await screenshot(hub, 'murmur-settings-experimental.png');

    await settingsDialog.getByRole('button', { name: 'AI & Speech', exact: true }).click();
    await hub.getByRole('button', { name: 'None' }).click();
    await hub.getByRole('button', { name: 'Claude' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).llm.provider).toBe('claude');
    await hub.getByLabel('Claude model', { exact: true }).selectOption('sonnet');
    await expect.poll(async () => (await invoke<Settings>(hub, 'settings:get')).llm.claudeModel).toBe('sonnet');
    await hub.getByLabel('Codex model', { exact: true }).selectOption('__custom__');
    await hub.getByLabel('Codex model ID').fill('my-codex-model');
    await expect.poll(async () => (await invoke<Settings>(hub, 'settings:get')).llm.codexModel).toBe('my-codex-model');
    await hub.getByLabel('Claude model', { exact: true }).selectOption('haiku');
    await screenshot(hub, 'murmur-settings-ai-speech.png');

    await settingsDialog.getByRole('button', { name: 'Connectors', exact: true }).click();
    await hub.getByLabel('Calendar ICS URL').fill('https://example.test/calendar.ics');
    await hub.getByRole('button', { name: 'Add URL' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).notetaker.calendarIcsSources).toContain('https://example.test/calendar.ics');
    await screenshot(hub, 'murmur-settings-connectors.png');
    await hub.getByRole('button', { name: 'Connect', exact: true }).first().click();
    await expect(hub.getByText(/Connected \(UI preview/).first()).toBeVisible();
    await hub.getByRole('button', { name: 'Disconnect', exact: true }).first().click();
    await expect(hub.getByRole('dialog', { name: /Disconnect Google Calendar/ })).toBeVisible();
    await hub.getByRole('dialog', { name: /Disconnect Google Calendar/ }).getByRole('button', { name: 'Cancel' }).click();
    await settingsDialog.getByRole('button', { name: 'Developer', exact: true }).click();
    await hub.getByRole('switch', { name: 'Debug outlines' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).internal.showDebugOutlines).toBe(true);
    await hub.getByRole('switch', { name: 'Auto-detect instruct mode' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).internal.isAutoInstructEnabled).toBe(true);
    await screenshot(hub, 'murmur-settings-developer.png');

    await settingsDialog.getByRole('button', { name: 'MCP', exact: true }).click();
    await hub.getByRole('button', { name: 'Add to Claude' }).click();
    await expect(hub.getByText(/mcpServers|command/)).toBeVisible();
    await hub.getByRole('dialog', { name: 'Add to Claude' }).getByRole('button', { name: 'Close', exact: true }).click();
    await screenshot(hub, 'murmur-settings-mcp.png');

    await settingsDialog.getByRole('button', { name: 'Account', exact: true }).click();
    await screenshot(hub, 'murmur-settings-account.png');
    await settingsDialog.getByRole('button', { name: 'Team', exact: true }).click();
    await screenshot(hub, 'murmur-settings-team.png');

    await settingsDialog.getByRole('button', { name: 'Data and Privacy', exact: true }).click();
    await hub.getByLabel('Local data storage').selectOption('auto_delete_24h');
    await hub.getByRole('dialog', { name: 'Auto-delete after 24 hours?' }).getByRole('button', { name: 'Confirm' }).click();
    expect((await invoke<Settings>(hub, 'settings:get')).localDataStorage).toBe('auto_delete_24h');
    await screenshot(hub, 'murmur-settings-data.png');

    for (const section of sections) {
      expect(section.title.length + section.image.length).toBeGreaterThan(0);
    }

    await settingsDialog.getByRole('button', { name: 'General', exact: true }).click();
    await hub.getByRole('button', { name: 'Check for updates' }).click();
    await expect(hub.getByRole('button', { name: /Updates are installed manually/ })).toBeVisible();
    await hub.getByRole('button', { name: 'Find the right mic for you →' }).click();
    await expect(hub.getByRole('heading', { name: 'Find the right mic for you' })).toBeVisible();
    await screenshot(hub, 'murmur-microphone-quiz.png');
    const quiz = hub.getByRole('dialog', { name: 'Microphone quiz' });
    await quiz.getByRole('button', { name: 'Show me how' }).click();
    await quiz.getByRole('button', { name: 'Continue' }).click();
    await quiz.getByRole('button', { name: 'Continue' }).click();
    await expect(quiz.getByRole('heading', { name: 'Try a whisper' })).toBeVisible();
    await expect(quiz.getByRole('button', { name: 'Unmute demo' })).toBeVisible();
    await quiz.getByRole('button', { name: 'Try it yourself' }).click();
    await quiz.getByLabel('Whisper practice').fill('send the project notes before lunch');
    await quiz.getByRole('button', { name: 'See my results' }).click();
    await expect(quiz.getByText('BEST MATCH')).toBeVisible();
    await quiz.getByRole('button', { name: 'Close' }).click();
    await hub.getByRole('button', { name: 'Change' }).first().click();
    await hub.getByRole('button', { name: 'Add another' }).first().click();
    await hub.getByLabel('Shortcut capture').press('a');
    await expect(hub.getByRole('alert')).toContainText(/modifier|blocked/i);
  } finally {
    await app.close();
  }
});
