import { describe, expect, it } from 'vitest';
import { dropEchoSegments } from '../../src/shared/echo';

const seg = (speaker: string, start: number, end: number, text: string) => ({ speaker, start, end, text });

describe('dropEchoSegments', () => {
  it('drops mic segments that repeat overlapping remote speech, even when split differently', () => {
    const out = dropEchoSegments([
      seg('you', 0, 4, 'Hi everyone, this is Maria. Let us review the quarterly'),
      seg('others', 0.2, 2, 'Hi everyone, this is Maria.'),
      seg('others', 2, 5, 'Let us review the quarterly budget and the hiring plan.'),
      seg('you', 4, 6, 'budget and the hiring plan.'),
    ]);
    expect(out.map((s) => s.speaker)).toEqual(['others', 'others']);
  });

  it('keeps the user’s own reply and anything far from remote speech', () => {
    const out = dropEchoSegments([
      seg('others', 0, 5, 'The budget is approved at $200,000.'),
      seg('you', 6, 8, "Sounds good, I'll review the numbers tomorrow."),
      seg('you', 30, 32, 'The budget is approved.'),
    ]);
    expect(out.map((s) => s.text)).toEqual(['The budget is approved at $200,000.', "Sounds good, I'll review the numbers tomorrow.", 'The budget is approved.']);
  });
});
