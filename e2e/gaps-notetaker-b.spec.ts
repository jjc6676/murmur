import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoke, launchApp } from './helpers';

interface ImportedMeeting { id: string; title: string }
interface ChatSession { id: string }
interface ChatMessage { id: string; role: string }

test('meeting sections, chat sessions, artifacts, folders, and cross-meeting Ask work locally', async () => {
  const { app, hub, userData } = await launchApp({ settings: { postOnboardingCompleted: true, dismissedBanners: ['notetaker:welcome'] } });
  const transcript = join(userData, 'notetaker-b.txt');
  writeFileSync(transcript, 'You: We decided to ship the desktop release Friday.\nAlex: I will prepare the launch checklist.');
  const [meeting] = await invoke<ImportedMeeting[]>(hub, 'meetings:importFiles', [transcript]);

  const firstSession = await invoke<ChatSession>(hub, 'meetings:createChatSession', meeting.id, 'Launch questions');
  const messages = await invoke<ChatMessage[]>(hub, 'meetings:chat', meeting.id, firstSession.id, 'List the release decision', 'e2e-request');
  const assistant = messages.find((message) => message.role === 'assistant');
  expect(assistant).toBeTruthy();
  await invoke(hub, 'meetings:createArtifact', meeting.id, assistant!.id, 'Release plan');

  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  await hub.getByRole('link', { name: /notetaker b/i }).click();
  await expect(hub.getByRole('tab', { name: 'Brief' })).toBeVisible();
  await expect(hub.getByRole('tab', { name: 'My Notes' })).toBeVisible();
  await expect(hub.getByRole('tab', { name: 'Action Items' })).toBeVisible();
  await expect(hub.getByRole('tab', { name: 'Release plan' })).toBeVisible();
  await expect(hub.getByLabel('Chat session')).toContainText('Launch questions');

  await hub.getByLabel('Search folders').fill('Launch');
  await hub.getByRole('button', { name: 'Create “Launch”' }).click();
  await expect(hub.getByRole('checkbox', { name: 'Launch', exact: true })).toBeChecked();

  await hub.getByRole('link', { name: 'Notetaker', exact: true }).click();
  await hub.getByRole('button', { name: 'Ask about your meetings' }).click();
  await hub.getByRole('textbox', { name: 'Ask about your meetings' }).fill('What ships Friday?');
  await hub.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(hub.getByText(/\[ai\]/)).toBeVisible();
  await app.close();
});

test('summary translations are versioned against the original summary', async () => {
  const { app, hub, userData } = await launchApp({ settings: { postOnboardingCompleted: true, dismissedBanners: ['notetaker:welcome'] } });
  const transcript = join(userData, 'translated-summary.txt');
  writeFileSync(transcript, 'You: This meeting reviews the quarterly launch.\nSam: I own the follow-up.');
  const [meeting] = await invoke<ImportedMeeting[]>(hub, 'meetings:importFiles', [transcript]);
  await invoke(hub, 'meetings:regenerateSummary', meeting.id);
  const translated = await invoke<{ language: string; sourceGeneratedAt: string }>(hub, 'meetings:translateSummary', meeting.id, 'Spanish');
  expect(translated.language).toBe('Spanish');
  const versions = await invoke<{ language: string; sourceGeneratedAt: string }[]>(hub, 'meetings:summaryTranslations', meeting.id);
  expect(versions).toContainEqual(expect.objectContaining({ language: 'Spanish', sourceGeneratedAt: translated.sourceGeneratedAt }));
  await app.close();
});
