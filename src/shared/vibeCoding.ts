// IDE-aware formatting: spoken identifiers -> code identifiers, spoken file names -> @file tags.
const FILE_RE = /\b[\w-]+\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|cs|cpp|c|h|hpp|md|json|ya?ml|toml|css|scss|html|rb|php|swift|kt|sql|sh|ps1|vue|svelte)\b/g;
const IDENT_RE = /\b(?:[a-z]+(?:[A-Z][a-z0-9]*)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;

export function isIdeApp(processName: string, title: string): boolean {
  return /^(code|cursor|windsurf|zed|idea64|pycharm64|webstorm64|devenv)$/.test(processName) || /devin/i.test(title);
}

/** Cursor and Devin chats support @file mentions. */
export function supportsFileTags(processName: string, title: string): boolean {
  return processName === 'cursor' || /devin/i.test(title);
}

export function extractFileNames(...sources: string[]): string[] {
  const out = new Set<string>();
  for (const s of sources) for (const m of s.matchAll(FILE_RE)) out.add(m[0]);
  return [...out];
}

export function extractIdentifiers(source: string, limit = 300): string[] {
  const counts = new Map<string, number>();
  for (const m of source.matchAll(IDENT_RE)) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function splitIdentifier(id: string): string[] {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Replace spoken word sequences ("user id") with known identifiers ("userId"). */
export function applyIdentifiers(text: string, identifiers: string[]): string {
  let out = text;
  for (const id of [...identifiers].sort((a, b) => splitIdentifier(b).length - splitIdentifier(a).length)) {
    const words = splitIdentifier(id);
    if (words.length < 2) continue;
    const re = new RegExp(`\\b${words.join('[\\s-]+')}\\b`, 'gi');
    out = out.replace(re, id);
  }
  return out;
}

/** Turn spoken file references ("checkout dot ts", "checkout.ts") into @mentions for known files. */
export function applyFileTags(text: string, files: string[]): string {
  let out = text;
  for (const f of files) {
    const dot = f.lastIndexOf('.');
    const base = f.slice(0, dot);
    const ext = f.slice(dot + 1);
    const spokenBase = splitIdentifier(base.replace(/-/g, '_')).join('[\\s_-]*');
    const re = new RegExp(`(?<![@\\w])${spokenBase}(?:\\s+dot\\s+|\\.)${ext}\\b`, 'gi');
    out = out.replace(re, `@${f}`);
  }
  return out;
}
