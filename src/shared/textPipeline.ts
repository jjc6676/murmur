// Deterministic dictation formatting: runs locally on every dictation (no LLM latency).
// LLM-based cleanup (medium/high) runs after this in main when configured.
import type { CleanupLevel, StyleTone } from './types';

export interface ReplacementRule {
  phrase: string;
  replacement: string;
}

export interface PipelineOptions {
  cleanupLevel: CleanupLevel;
  tone: StyleTone;
  smartFormatting: { lists: boolean; backtrack: boolean; emails: boolean; spokenPunctuation: boolean };
  dictionary: ReplacementRule[]; // misspelling -> correct
  snippets: ReplacementRule[]; // trigger -> expansion
  isEmailContext: boolean;
  pressEnterCommand: boolean;
}

export interface PipelineResult {
  text: string;
  pressEnter: boolean;
  numDictionaryReplacements: number;
  numSnippetExpansions: number;
  numWordsCorrected: number; // fillers/repeats/backtracks removed
  usedPhrases: string[]; // dictionary/snippet phrases that fired
  appliedFeatures: ('list' | 'email' | 'backtrack')[];
}

const FILLERS = /(^|[\s,.;!?])(?:um+|uh+m*|erm+|er|ah+|hmm+|mm+|uh-huh)(?=[\s,.;!?]|$)[,]?/gi;

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove filler words and immediate word repetitions ("I I think" -> "I think"). Returns removed count. */
export function removeDisfluencies(text: string): { text: string; removed: number } {
  let removed = 0;
  let t = text.replace(FILLERS, (_m, pre: string) => {
    removed++;
    return pre;
  });
  t = t.replace(/\b(\w+)(\s*,?\s+\1\b)+/gi, (m, w: string) => {
    if (/^(that|had|is|very|so|bye|no|yes|ha|really|many)$/i.test(w)) return m; // legitimate doubles
    removed += m.split(/\s+/).length - 1;
    return w;
  });
  return { text: tidySpacing(t), removed };
}

/** Normalize whitespace around punctuation and collapse duplicates like ", ," or ". ." */
export function tidySpacing(t: string): string {
  return t
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/([,;:])(?=[^\s\d])/g, '$1 ')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/([.!?])\s*,/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[\s,;:]+/, '')
    .replace(/ *\n */g, '\n')
    .trim();
}

const SPOKEN_PUNCT: [RegExp, string][] = [
  [/\s*\bnew paragraph\b[.,]?\s*/gi, '\n\n'],
  [/\s*\bnew line\b[.,]?\s*/gi, '\n'],
  [/\s*\bquestion mark\b[.,]?/gi, '?'],
  [/\s*\bexclamation (?:point|mark)\b[.,]?/gi, '!'],
  [/\s*\bfull stop\b[.,]?/gi, '.'],
  [/\s*\bcomma\b[.,]?/gi, ','],
  [/\s*\bsemicolon\b[.,]?/gi, ';'],
  [/\s*\bcolon\b[.,]?(?=\s)/gi, ':'],
  [/\s*\bperiod\b[.,]?(?=\s*$|\s*\n|\s+[A-Z])/g, '.'],
  [/\s*\bperiod\b\.?(?=\s*$)/gi, '.'],
];

export function applySpokenPunctuation(t: string): string {
  let out = t;
  for (const [re, rep] of SPOKEN_PUNCT) out = out.replace(re, rep);
  return out;
}

/** Fix sentence capitalization and standalone "i". */
export function capitalize(t: string): string {
  return t
    .replace(/\bi\b(?=['’\s,.!?]|$)/g, 'I')
    .replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

/** Ensure text ends with terminal punctuation (unless it ends with a list/newline or is a single word). */
export function ensureTerminalPunctuation(t: string): string {
  const trimmed = t.trimEnd();
  if (!trimmed || /[.!?:;)"'”’\]]$/.test(trimmed) || /\n\d+\.\s[^\n]*$/.test(trimmed)) return trimmed;
  if (countWords(trimmed) < 2) return trimmed;
  return `${trimmed}.`;
}

const NUM_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const VALUE = String.raw`(?:\d{1,4}(?::\d{2})?(?:\s?(?:am|pm|a\.m\.|p\.m\.))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight)`;

/** Self-corrections: "at 6, no 7" -> "at 7"; "...scratch that" drops the preceding sentence. */
export function applyBacktrack(t: string): { text: string; count: number } {
  let count = 0;
  let out = t.replace(new RegExp(String.raw`\b(${VALUE})[,.]?\s+(?:no|nope|sorry|wait|i mean|actually)[,.]?\s+(?:make (?:it|that)\s+|let's say\s+)?(${VALUE})\b`, 'gi'), (_m, _a: string, b: string) => {
    count++;
    return b;
  });
  out = out.replace(/(^|[.!?\n]\s*)([^.!?\n]*?)[,.]?\s*\b(?:scratch that|delete that|never mind that)\b[.,!]?\s*/gi, (_m, pre: string) => {
    count++;
    return pre;
  });
  return { text: tidySpacing(out), count };
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

function markerValue(word: string): number | null {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  return NUM_WORDS[w] ?? ORDINALS[w] ?? null;
}

/**
 * Spoken enumerations -> numbered list. Detects consecutive markers (one/two/three, first/second, 1/2/3,
 * optionally prefixed by "number") at clause starts, requiring at least two items in order.
 */
export function applyLists(t: string): { text: string; applied: boolean } {
  const markerRe = /(?:^|(?<=[.,;:!?]\s{0,3})|(?<=\n))\s*(?:number\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b[,.:)]?\s+(?:is\s+)?/gi;
  const hits: { index: number; end: number; n: number }[] = [];
  for (const m of t.matchAll(markerRe)) {
    const n = markerValue(m[1]);
    if (n === null) continue;
    hits.push({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, n });
  }
  // find the longest run of 1..k in order
  let best: typeof hits = [];
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].n !== 1) continue;
    const run = [hits[i]];
    for (let j = i + 1; j < hits.length && run.length < 20; j++) if (hits[j].n === run[run.length - 1].n + 1) run.push(hits[j]);
    if (run.length > best.length) best = run;
  }
  if (best.length < 2) return { text: t, applied: false };
  const intro = t.slice(0, best[0].index).trim().replace(/[,;]\s*$/, ':');
  const items = best.map((h, k) => {
    const next = best[k + 1]?.index ?? t.length;
    let item = t.slice(h.end, next).trim().replace(/^(?:and|then)\s+/i, '');
    item = item.replace(/[,;]\s*(?:and|then)?\s*$/i, '').replace(/\s+(?:and|then)$/i, '').replace(/[.]$/, '');
    return `${k + 1}. ${item.charAt(0).toUpperCase()}${item.slice(1)}`;
  });
  const head = intro ? `${/[:.!?]$/.test(intro) ? intro : `${intro}:`}\n` : '';
  return { text: head + items.join('\n'), applied: true };
}

const GREETING = /^(hi|hey|hello|dear|good (?:morning|afternoon|evening)|greetings)\b[^,.!\n]{0,40}[,.!]?\s*/i;
const SIGNOFF = /(?:^|[.!?]\s+)((?:thanks|thank you|best|best regards|kind regards|regards|cheers|sincerely|talk soon)[^.!?\n]{0,30})[,.!]?\s*$/i;

/** Email layout: greeting line, body paragraph, sign-off line. */
export function applyEmailFormat(t: string): { text: string; applied: boolean } {
  const g = GREETING.exec(t);
  if (!g) return { text: t, applied: false };
  const greeting = g[0].trim().replace(/[.!]$/, '').replace(/,?$/, ',');
  let body = t.slice(g[0].length).trim();
  let signoff = '';
  const s = SIGNOFF.exec(body);
  if (s) {
    signoff = s[1].trim().replace(/[.!]$/, '');
    body = body.slice(0, s.index + s[0].indexOf(s[1])).trim();
  }
  if (!body) return { text: t, applied: false };
  body = body.charAt(0).toUpperCase() + body.slice(1);
  const parts = [greeting, '', ensureTerminalPunctuation(body)];
  if (signoff) parts.push('', `${signoff},`);
  return { text: parts.join('\n'), applied: true };
}

/** Whole-phrase case-insensitive replacements; returns phrases that fired. */
export function applyReplacements(t: string, rules: ReplacementRule[]): { text: string; used: string[]; count: number } {
  const used: string[] = [];
  let count = 0;
  let out = t;
  // longest phrases first so "my linkedin url" beats "linkedin"
  for (const r of [...rules].sort((a, b) => b.phrase.length - a.phrase.length)) {
    if (!r.phrase.trim()) continue;
    const re = new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRe(r.phrase.trim()).replace(/\s+/g, String.raw`[\s,]+`)}(?![\p{L}\p{N}])[.,]?`, 'giu');
    out = out.replace(re, (m) => {
      count++;
      if (!used.includes(r.phrase)) used.push(r.phrase);
      const trail = /[.,]$/.test(m) && !/[.,]$/.test(r.replacement) ? m.slice(-1) : '';
      return r.replacement + trail;
    });
  }
  return { text: out, used, count };
}

/** Apply a writing tone without an LLM. */
export function applyTone(t: string, tone: StyleTone): string {
  switch (tone) {
    case 'formal':
      return t;
    case 'casual':
      // Caps + less punctuation: drop the final period of the message
      return t.replace(/\.$/, '');
    case 'excited':
      return t.replace(/\.$/, '!');
    case 'very_casual':
    case 'gen_z':
      // no caps (except "I" and acronyms) + less punctuation
      return t
        .replace(/\.$/, '')
        .replace(/(^|[.!?]\s+|\n)(\p{Lu})(?=\p{Ll})/gu, (_m, pre: string, c: string) => pre + c.toLowerCase());
  }
}

const PRESS_ENTER = /[\s,.]*\bpress enter\b[.!]?\s*$/i;

/** Full local pipeline. Order mirrors Flow: fillers -> backtrack -> punctuation -> dictionary -> snippets -> layout -> tone. */
export function formatDictation(raw: string, o: PipelineOptions): PipelineResult {
  const res: PipelineResult = { text: '', pressEnter: false, numDictionaryReplacements: 0, numSnippetExpansions: 0, numWordsCorrected: 0, usedPhrases: [], appliedFeatures: [] };
  let t = raw.trim();
  if (!t) return res;
  if (o.pressEnterCommand && PRESS_ENTER.test(t)) {
    res.pressEnter = true;
    t = t.replace(PRESS_ENTER, '');
  }
  if (o.cleanupLevel !== 'none') {
    const d = removeDisfluencies(t);
    t = d.text;
    res.numWordsCorrected += d.removed;
    if (o.smartFormatting.backtrack) {
      const b = applyBacktrack(t);
      if (b.count) res.appliedFeatures.push('backtrack');
      t = b.text;
      res.numWordsCorrected += b.count;
    }
    if (o.smartFormatting.spokenPunctuation) t = applySpokenPunctuation(t);
    t = tidySpacing(t);
  }
  const dict = applyReplacements(t, o.dictionary);
  t = dict.text;
  res.numDictionaryReplacements = dict.count;
  const snip = applyReplacements(t, o.snippets);
  t = snip.text;
  res.numSnippetExpansions = snip.count;
  res.usedPhrases = [...dict.used, ...snip.used];
  if (o.cleanupLevel !== 'none') {
    if (o.smartFormatting.lists) {
      const l = applyLists(t);
      if (l.applied) res.appliedFeatures.push('list');
      t = l.text;
    }
    t = capitalize(t);
    if (o.smartFormatting.emails && o.isEmailContext) {
      const e = applyEmailFormat(t);
      if (e.applied) res.appliedFeatures.push('email');
      t = e.text;
    }
    if (!res.appliedFeatures.includes('email')) t = ensureTerminalPunctuation(t);
    t = applyTone(t, o.tone);
  }
  res.text = t;
  return res;
}
