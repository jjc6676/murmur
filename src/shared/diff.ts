export type DiffKind = 'equal' | 'add' | 'remove';

export interface DiffPart {
  kind: DiffKind;
  text: string;
}


/** A small word-level LCS diff with readable spacing around changed runs. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.match(/\S+/g) ?? [];
  const b = after.match(/\S+/g) ?? [];
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint32Array(rows * cols);
  const at = (i: number, j: number) => i * cols + j;

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[at(i, j)] = a[i] === b[j] ? lcs[at(i + 1, j + 1)] + 1 : Math.max(lcs[at(i + 1, j)], lcs[at(i, j + 1)]);
    }
  }

  const raw: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ kind: 'equal', text: a[i++] });
      j++;
    } else if (j < b.length && (i === a.length || lcs[at(i, j + 1)] > lcs[at(i + 1, j)])) {
      raw.push({ kind: 'add', text: b[j++] });
    } else {
      raw.push({ kind: 'remove', text: a[i++] });
    }
  }

  const merged: DiffPart[] = [];
  for (const part of raw) {
    const prev = merged.at(-1);
    if (prev?.kind === part.kind) prev.text += ` ${part.text}`;
    else merged.push({ ...part });
  }
  for (let k = 0; k < merged.length; k++) {
    if (merged[k].kind !== 'equal') continue;
    if (k > 0) merged[k].text = ` ${merged[k].text}`;
    if (k < merged.length - 1) merged[k].text += ' ';
  }
  return merged;
}
