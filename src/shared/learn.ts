// Learn spelling corrections from edits the user made to a pasted dictation.

function words(s: string): string[] {
  return s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Find the slice of `field` words that best overlaps the pasted words (the user may have typed around it). */
function bestWindow(pasted: string[], field: string[]): string[] | null {
  if (!pasted.length || !field.length) return null;
  const want = new Set(pasted.map((w) => w.toLowerCase()));
  let best: { score: number; start: number; len: number } | null = null;
  for (let len = Math.max(1, pasted.length - 2); len <= pasted.length + 2; len++) {
    for (let start = 0; start + len <= field.length; start++) {
      let score = 0;
      for (let k = start; k < start + len; k++) if (want.has(field[k].toLowerCase())) score++;
      if (!best || score > best.score) best = { score, start, len };
    }
  }
  if (!best || best.score < Math.ceil(pasted.length * 0.6)) return null;
  return field.slice(best.start, best.start + best.len);
}

export interface LearnedEdit {
  edited: string[] | null; // matched region of the field after the user's edits
  corrections: { from: string; to: string }[];
}

/**
 * Align pasted vs. edited words; one-for-one substitutions that look like spelling fixes
 * (similar spelling, not just case/punctuation) become dictionary corrections.
 */
export function learnCorrections(pastedText: string, fieldText: string): LearnedEdit {
  const pasted = words(pastedText);
  const region = bestWindow(pasted, words(fieldText));
  if (!region) return { edited: null, corrections: [] };
  // LCS alignment
  const n = pasted.length;
  const m = region.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = pasted[i].toLowerCase() === region[j].toLowerCase() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const corrections: { from: string; to: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (pasted[i].toLowerCase() === region[j].toLowerCase()) {
      i++;
      j++;
      continue;
    }
    // a substitution: both sides advance without matching
    if (L[i + 1][j + 1] === L[i][j]) {
      const from = pasted[i];
      const to = region[j];
      const d = editDistance(from.toLowerCase(), to.toLowerCase());
      if (d > 0 && d <= Math.max(2, Math.floor(Math.max(from.length, to.length) * 0.5)) && /\p{L}/u.test(to) && to.length >= 3) corrections.push({ from, to });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return { edited: region, corrections };
}
