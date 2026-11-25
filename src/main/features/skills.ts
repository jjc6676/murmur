// Local meeting-skill gallery and LLM execution.
import type { Skill, TranscriptSegment } from '@shared/types';
import { getCtx } from '../context';
import { handle } from '../ipc';
import { newId, nowIso } from '../db';

interface SkillRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  command: string;
  category: Skill['category'];
  scope: Skill['scope'];
  builtIn: number;
  createdAt: string;
  modifiedAt: string;
}

const BUILT_INS: Pick<Skill, 'name' | 'description' | 'instructions' | 'command' | 'category' | 'scope'>[] = [
  { name: 'Action items', description: 'Turn commitments into a clear checklist.', instructions: 'Extract action items with owner and due date when known.', command: 'action-items', category: 'after', scope: 'both' },
  { name: 'Follow-up email', description: 'Draft a concise meeting follow-up.', instructions: 'Write a friendly follow-up email with decisions and next steps.', command: 'follow-up-email', category: 'after', scope: 'both' },
  { name: 'Project update', description: 'Summarize progress, risks, and next steps.', instructions: 'Create a structured project status update.', command: 'project-update', category: 'across', scope: 'multiple' },
  { name: 'Decision log', description: 'Capture decisions and their rationale.', instructions: 'List decisions, context, rationale, and owners.', command: 'decision-log', category: 'after', scope: 'both' },
  { name: 'Open questions', description: 'Find unresolved questions.', instructions: 'List open questions and who should answer each one.', command: 'open-questions', category: 'after', scope: 'both' },
  { name: 'Meeting prep', description: 'Prepare an agenda from recent context.', instructions: 'Create a focused agenda, goals, and questions for the next meeting.', command: 'meeting-prep', category: 'before', scope: 'multiple' },
  { name: 'Week recap', description: 'Turn a week of meetings into a recap.', instructions: 'Summarize accomplishments, decisions, risks, and priorities.', command: 'week-recap', category: 'across', scope: 'multiple' },
  { name: 'PRD', description: 'Draft a product requirements document.', instructions: 'Create a PRD with problem, users, requirements, non-goals, and success metrics.', command: 'prd', category: 'more', scope: 'both' },
  { name: 'Interview feedback', description: 'Structure hiring feedback.', instructions: 'Summarize evidence, strengths, concerns, and recommendation.', command: 'interview-feedback', category: 'after', scope: 'one' },
  { name: 'Customer feedback', description: 'Synthesize customer needs and signals.', instructions: 'Group feedback into needs, pain points, requests, and quotes.', command: 'customer-feedback', category: 'across', scope: 'multiple' },
  { name: 'Coaching', description: 'Surface coaching opportunities.', instructions: 'Offer specific, constructive coaching based on the conversation.', command: 'coaching', category: 'after', scope: 'one' },
  { name: 'Study guide', description: 'Create a study guide from discussion.', instructions: 'Create concepts, definitions, examples, and review questions.', command: 'study-guide', category: 'more', scope: 'both' },
  { name: 'Tickets', description: 'Create implementation-ready tickets.', instructions: 'Draft tickets with context, acceptance criteria, and dependencies.', command: 'tickets', category: 'after', scope: 'both' },
  { name: 'Leadership update', description: 'Write an executive-ready update.', instructions: 'Summarize outcomes, business impact, risks, and asks.', command: 'leadership-update', category: 'across', scope: 'multiple' },
  { name: 'Outstanding todos', description: 'Find work that is still open.', instructions: 'List incomplete commitments, owner, and latest context.', command: 'outstanding-todos', category: 'across', scope: 'multiple' },
];

const RESERVED = new Set(['help', 'settings', 'search', 'skills', 'memory', 'new', 'delete']);

function rowToSkill(row: SkillRow): Skill {
  return { ...row, builtIn: !!row.builtIn };
}

function seedBuiltIns(): void {
  const { db } = getCtx();
  if (db.get<{ count: number }>('SELECT COUNT(*) AS count FROM skills WHERE builtIn = 1')?.count) return;
  const timestamp = nowIso();
  db.tx(() => {
    for (const skill of BUILT_INS) db.insert('skills', { id: newId(), ...skill, builtIn: 1, createdAt: timestamp, modifiedAt: timestamp });
  });
}

function validateCommand(command: string, id?: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command)) throw new Error('Use lowercase letters, numbers, and single hyphens only');
  if (RESERVED.has(command)) throw new Error('That slash command is reserved');
  const existing = getCtx().db.get<{ id: string }>('SELECT id FROM skills WHERE command = ?', command);
  if (existing && existing.id !== id) throw new Error('That slash command is already in use');
}
function parseTranscript(value: string): TranscriptSegment[] {
  try {
    return JSON.parse(value) as TranscriptSegment[];
  } catch {
    return [];
  }
}


export function registerSkills(): void {
  seedBuiltIns();
  const { db } = getCtx();
  handle('skills', {
    list: () => db.all<SkillRow>('SELECT * FROM skills ORDER BY builtIn DESC, name COLLATE NOCASE').map(rowToSkill),
    save(input) {
      const command = input.command.trim();
      validateCommand(command, input.id);
      if (!input.name.trim() || !input.description.trim() || !input.instructions.trim()) throw new Error('Name, description, and instructions are required');
      const timestamp = nowIso();
      if (input.id) {
        const existing = db.get<SkillRow>('SELECT * FROM skills WHERE id = ?', input.id);
        if (!existing) throw new Error('Skill not found');
        db.update('skills', input.id, {
          name: input.name.trim(),
          description: input.description.trim(),
          instructions: input.instructions.trim(),
          command,
          category: input.category,
          scope: input.scope,
          modifiedAt: timestamp,
        });
        return rowToSkill(db.get<SkillRow>('SELECT * FROM skills WHERE id = ?', input.id)!);
      }
      const id = newId();
      db.insert('skills', {
        id,
        name: input.name.trim(),
        description: input.description.trim(),
        instructions: input.instructions.trim(),
        command,
        category: input.category,
        scope: input.scope,
        builtIn: 0,
        createdAt: timestamp,
        modifiedAt: timestamp,
      });
      return rowToSkill(db.get<SkillRow>('SELECT * FROM skills WHERE id = ?', id)!);
    },
    remove(id) {
      db.run('DELETE FROM skills WHERE id = ? AND builtIn = 0', id);
    },
    async run(skillId, meetingIds) {
      const skill = db.get<SkillRow>('SELECT * FROM skills WHERE id = ?', skillId);
      if (!skill) throw new Error('Skill not found');
      const placeholders = meetingIds.map(() => '?').join(',');
      const meetings = meetingIds.length
        ? db.all<{ title: string; transcript: string; summary: string | null }>(`SELECT title, transcript, summary FROM meetings WHERE isDeleted = 0 AND id IN (${placeholders})`, ...meetingIds)
        : db.all<{ title: string; transcript: string; summary: string | null }>('SELECT title, transcript, summary FROM meetings WHERE isDeleted = 0 ORDER BY createdAt DESC LIMIT 5');
      if (!meetings.length) throw new Error('Choose at least one meeting');
      const input = meetings.map((meeting) => {
        const transcript = parseTranscript(meeting.transcript);
        const spoken = transcript.map((segment) => `${segment.speaker ?? 'Speaker'}: ${segment.text}`).join('\n');
        return `# ${meeting.title}\n${meeting.summary ?? ''}\n${spoken}`;
      }).join('\n\n');
      return getCtx().llm({
        system: `Follow this meeting skill exactly and return polished Markdown only.\n\n${skill.instructions}`,
        input,
      });
    },
  });
}
