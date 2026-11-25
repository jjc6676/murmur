import { describe, expect, it } from 'vitest';
import { wordDiff } from '@shared/diff';

describe('wordDiff', () => {
  it('marks inserted and removed words while preserving shared text', () => {
    expect(wordDiff('I like blue cars', 'I love fast cars')).toEqual([
      { kind: 'equal', text: 'I ' },
      { kind: 'remove', text: 'like blue' },
      { kind: 'add', text: 'love fast' },
      { kind: 'equal', text: ' cars' },
    ]);
  });

  it('handles an empty side', () => {
    expect(wordDiff('', 'Hello world')).toEqual([{ kind: 'add', text: 'Hello world' }]);
    expect(wordDiff('Hello world', '')).toEqual([{ kind: 'remove', text: 'Hello world' }]);
  });

  it('keeps punctuation attached to its word', () => {
    expect(wordDiff('Hello, Sam.', 'Hello, Maya.')).toEqual([
      { kind: 'equal', text: 'Hello, ' },
      { kind: 'remove', text: 'Sam.' },
      { kind: 'add', text: 'Maya.' },
    ]);
  });
});
