import type { Meeting, MeetingSummary } from '@shared/types';
import { getCtx } from '../context';
import { newId, nowIso } from '../db';
import { getMeeting, updateSearchable } from './store';

const TEMPLATE_PROMPTS: Record<string, string> = {
  auto: 'Choose concise headings appropriate for the conversation.',
  '1:1': 'Emphasize feedback, decisions, growth topics, and commitments from each person.',
  'team meeting': 'Emphasize updates, decisions, blockers, owners, and next steps.',
  'sales call': 'Emphasize customer needs, objections, buying signals, commitments, and follow-ups.',
  interview: 'Emphasize questions, evidence, strengths, concerns, and hiring follow-ups.',
  lecture: 'Organize concepts, definitions, examples, and study takeaways.',
  'client call': 'Emphasize client goals, decisions, risks, deliverables, owners, and dates.',
};

function cleanJson(output: string): string {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? output).trim();
}

function isSummary(value: unknown): value is Omit<MeetingSummary, 'generatedAt' | 'provider' | 'template'> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.title === 'string' && typeof candidate.overview === 'string' && Array.isArray(candidate.sections) && Array.isArray(candidate.actionItems);
}

export async function generateMeetingSummary(id: string, requestedTemplate?: string): Promise<Meeting> {
  const meeting = getMeeting(id);
  if (!meeting) throw new Error('Meeting not found');
  if (!meeting.transcript.length) throw new Error('A transcript is required to generate a summary');
  const template = requestedTemplate || getCtx().settings.get().notetaker.summaryTemplate || 'auto';
  getCtx().db.update('meetings', id, { summaryStatus: 'pending' });
  const transcript = meeting.transcript.map((segment) => `${segment.speakerName}: ${segment.text}`).join('\n');
  try {
    const raw = await getCtx().llm({
      system: `Create a meeting summary as JSON only. Return exactly {"title":string,"overview":string,"sections":[{"heading":string,"bullets":string[]}],"actionItems":[{"text":string,"owner":string|null}]}. ${TEMPLATE_PROMPTS[template] ?? TEMPLATE_PROMPTS.auto}`,
      input: transcript,
    });
    const parsed: unknown = JSON.parse(cleanJson(raw));
    if (!isSummary(parsed)) throw new Error('The summary response was not valid');
    const settings = getCtx().settings.get();
    const summary: MeetingSummary = {
      title: parsed.title.trim() || meeting.title,
      overview: parsed.overview,
      sections: parsed.sections,
      actionItems: parsed.actionItems,
      generatedAt: nowIso(),
      provider: settings.llm.provider,
      template,
    };
    const title = /^Untitled (meeting|note)$/i.test(meeting.title) ? summary.title : meeting.title;
    if (meeting.summary) getCtx().db.insert('meeting_versions', { id: newId(), meetingId: id, content: JSON.stringify(meeting.summary), source: 'previous_summary', transformId: null, prompt: template, createdAt: nowIso() });
    getCtx().db.insert('meeting_versions', { id: newId(), meetingId: id, content: JSON.stringify(summary), source: 'generated_summary', transformId: null, prompt: template, createdAt: nowIso() });
    getCtx().db.update('meetings', id, { title, summary: JSON.stringify(summary), deliveredSummary: JSON.stringify(meeting.deliveredSummary ?? summary), summaryStatus: 'ready', summaryUpdatedAt: summary.generatedAt, processingPhase: null });
    updateSearchable(id);
    return getMeeting(id)!;
  } catch (error) {
    getCtx().db.update('meetings', id, { summaryStatus: 'failed' });
    throw error;
  }
}

export function summaryMarkdown(meeting: Meeting): string {
  const lines = [`# ${meeting.title}`, '', meeting.summary?.overview ?? '', ''];
  for (const section of meeting.summary?.sections ?? []) lines.push(`## ${section.heading}`, '', ...section.bullets.map((bullet) => `- ${bullet}`), '');
  if (meeting.summary?.actionItems.length) lines.push('## Action items', '', ...meeting.summary.actionItems.map((item) => `- [ ] ${item.text}${item.owner ? ` — ${item.owner}` : ''}`), '');
  if (meeting.myNotes) lines.push('## My thoughts', '', meeting.myNotes.replace(/<[^>]+>/g, ''), '');
  lines.push('## Transcript', '', ...meeting.transcript.map((segment) => `**${segment.speakerName}:** ${segment.text}`));
  return lines.join('\n').trim();
}
