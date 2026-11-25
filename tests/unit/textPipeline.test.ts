import { describe, expect, it } from 'vitest';
import { applyBacktrack, applyEmailFormat, applyLists, applyReplacements, applySpokenPunctuation, formatDictation, removeDisfluencies, type PipelineOptions } from '@shared/textPipeline';

const base: PipelineOptions = {
  cleanupLevel: 'light',
  tone: 'formal',
  smartFormatting: { lists: true, backtrack: true, emails: true, spokenPunctuation: true },
  dictionary: [],
  snippets: [],
  isEmailContext: false,
  pressEnterCommand: false,
};

describe('formatDictation', () => {
  it('removes fillers, repeats, and fixes capitalization/punctuation', () => {
    const r = formatDictation('um so i i think we should uh move the meeting to thursday', base);
    expect(r.text).toBe('So I think we should move the meeting to thursday.');
    expect(r.numWordsCorrected).toBe(3);
  });

  it('keeps text verbatim when cleanup is none', () => {
    expect(formatDictation('um hello there', { ...base, cleanupLevel: 'none' }).text).toBe('um hello there');
  });

  it('applies dictionary corrections and snippet expansions', () => {
    const r = formatDictation('email jason at my linkedin', {
      ...base,
      dictionary: [{ phrase: 'jason', replacement: 'Jayson' }],
      snippets: [{ phrase: 'my linkedin', replacement: 'https://linkedin.com/in/jayson' }],
    });
    expect(r.text).toBe('Email Jayson at https://linkedin.com/in/jayson.');
    expect(r.numDictionaryReplacements).toBe(1);
    expect(r.numSnippetExpansions).toBe(1);
  });

  it('detects the press enter voice command', () => {
    const r = formatDictation('send it now press enter', { ...base, pressEnterCommand: true });
    expect(r.pressEnter).toBe(true);
    expect(r.text).toBe('Send it now.');
  });

  it('applies tones', () => {
    expect(formatDictation('see you soon', { ...base, tone: 'casual' }).text).toBe('See you soon');
    expect(formatDictation('see you soon', { ...base, tone: 'excited' }).text).toBe('See you soon!');
    expect(formatDictation('Great work. See you soon', { ...base, tone: 'very_casual' }).text).toBe('great work. see you soon');
  });
});

describe('smart formatting', () => {
  it('backtracks spoken corrections', () => {
    expect(applyBacktrack("let's meet at 6, no 7 tomorrow").text).toBe("let's meet at 7 tomorrow");
    expect(applyBacktrack('Buy milk. Call mom scratch that. Walk the dog.').text).toBe('Buy milk. Walk the dog.');
  });

  it('turns spoken enumerations into a numbered list', () => {
    const r = applyLists('I need three things. One, eggs. Two, milk. Three, bread.');
    expect(r.applied).toBe(true);
    expect(r.text).toBe('I need three things.\n1. Eggs\n2. Milk\n3. Bread');
  });

  it('does not invent lists from a single number', () => {
    expect(applyLists('I have one idea about this').applied).toBe(false);
  });

  it('formats emails with greeting and sign-off', () => {
    const r = applyEmailFormat('Hi Sam, can we move our sync to Thursday? Thanks');
    expect(r.text).toBe('Hi Sam,\n\nCan we move our sync to Thursday?\n\nThanks,');
  });

  it('converts spoken punctuation without touching ordinary words', () => {
    expect(applySpokenPunctuation('hello comma how are you question mark')).toBe('hello, how are you?');
    expect(applySpokenPunctuation('a period of time')).toBe('a period of time');
    expect(applySpokenPunctuation('first line new line second line')).toBe('first line\nsecond line');
  });

  it('keeps legitimate doubled words', () => {
    expect(removeDisfluencies('I know that that is fine').text).toBe('I know that that is fine');
  });

  it('matches multi-word phrases across commas', () => {
    expect(applyReplacements('see my, linkedin', [{ phrase: 'my linkedin', replacement: 'URL' }]).text).toBe('see URL');
  });
});
