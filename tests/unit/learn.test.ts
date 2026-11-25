import { describe, expect, it } from 'vitest';
import { learnCorrections } from '@shared/learn';

describe('learnCorrections', () => {
  it('learns a respelled name inside surrounding text', () => {
    const r = learnCorrections('Can you send the deck to Jason today?', 'Hi! Can you send the deck to Jayson today? Thanks');
    expect(r.corrections).toEqual([{ from: 'Jason', to: 'Jayson' }]);
  });

  it('ignores rewrites that are not spelling fixes', () => {
    expect(learnCorrections('Send it to Mark tomorrow', 'Send it to Elizabeth tomorrow').corrections).toEqual([]);
  });

  it('returns nothing when the dictation is no longer in the field', () => {
    expect(learnCorrections('Move the meeting to Thursday', 'Completely different content here').edited).toBeNull();
  });
});
