"""Validate docs/flow-inventory.md: status vocabulary, citations that resolve, and summary counts.

Usage: python scripts/check-inventory.py [--write-summary] [--rebase <git-rev>]
Exit code 1 when a row has an unknown status, an Implemented row lacks a citation,
or a citation points at a missing file / out-of-range line.

--rebase <rev> rewrites every `path:start-end` citation from the line numbers of <rev> to the
current working tree using `git diff -U0`, so citations survive later code edits.
"""
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / 'docs' / 'flow-inventory.md'
SECTIONS = ('Dictation core', 'Hub pages', 'Notetaker', 'Settings and onboarding')
STATUSES = ('Implemented', 'Offline equivalent', 'UI-only (cloud)', 'UI-only (mobile/team/billing)', 'Not applicable', 'Partial', 'Missing')
CITE = re.compile(r'`([\w./-]+\.(?:ts|tsx|mjs|css|py|json)):(\d+)(?:-(\d+))?`')


def cells(line: str) -> list[str]:
    # split on unescaped pipes
    return [c.strip() for c in re.split(r'(?<!\\)\|', line)[1:-1]]


def line_map(rev: str, path: str):
    """Return a function mapping a line number in <rev>:path to the working-tree line number."""
    diff = subprocess.run(['git', 'diff', '-U0', rev, '--', path], cwd=ROOT, capture_output=True, text=True, encoding='utf8').stdout
    # A missing hunk count means 1; an explicit 0 (pure insertion/deletion) must stay 0.
    parsed = []
    for m in re.finditer(r'^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', diff, re.M):
        a, b, c, d = m.groups()
        parsed.append((int(a), 1 if b is None else int(b), int(c), 1 if d is None else int(d)))

    def remap(line: int, is_end: bool = False) -> int:
        offset = 0
        for old_start, old_len, new_start, new_len in parsed:
            old_end = old_start + old_len - 1 if old_len else old_start
            if old_len and old_start <= line <= old_end:
                # line itself changed: point at the replacement hunk
                return max(new_start, new_start + new_len - 1) if is_end else new_start
            if (old_len and old_end < line) or (not old_len and old_start < line):
                offset += new_len - old_len
        return line + offset

    return remap


def rebase(lines: list[str], rev: str) -> list[str]:
    maps: dict[str, object] = {}

    def fix(m: re.Match) -> str:
        path, start, end = m.group(1), int(m.group(2)), m.group(3)
        remap = maps.setdefault(path, line_map(rev, path))
        new_start = remap(start)
        if end is None:
            return f'`{path}:{new_start}`'
        new_end = max(new_start, remap(int(end), is_end=True))
        return f'`{path}:{new_start}-{new_end}`'

    return [CITE.sub(fix, line) if line.startswith('| **') else line for line in lines]


def main() -> int:
    lines = DOC.read_text(encoding='utf8').splitlines()
    if '--rebase' in sys.argv:
        lines = rebase(lines, sys.argv[sys.argv.index('--rebase') + 1])
        DOC.write_text('\n'.join(lines) + '\n', encoding='utf8')
    section = None
    counts: Counter[str] = Counter()
    problems: list[str] = []
    line_counts: dict[Path, int] = {}
    for n, line in enumerate(lines, 1):
        if line.startswith('# '):
            section = line[2:].strip()
            continue
        if section not in SECTIONS or not line.startswith('| **') or line.startswith('| **Total**'):
            continue
        row = cells(line)
        if len(row) < 4:
            problems.append(f'{n}: malformed row')
            continue
        feature, status, where = row[0], row[2], row[3]
        kind = next((s for s in STATUSES if status.startswith(s)), None)
        if kind is None:
            problems.append(f'{n}: unknown status {status[:40]!r} ({feature})')
            continue
        counts[kind] += 1
        cites = CITE.findall(where)
        if kind == 'Implemented' and not cites:
            problems.append(f'{n}: Implemented without path:line citation ({feature})')
        for path, start, end in cites:
            file = ROOT / path
            if not file.exists():
                problems.append(f'{n}: cited file missing {path} ({feature})')
                continue
            total = line_counts.setdefault(file, len(file.read_text(encoding='utf8', errors='replace').splitlines()))
            if int(end or start) > total:
                problems.append(f'{n}: {path}:{start}{"-" + end if end else ""} beyond {total} lines ({feature})')
    for kind in STATUSES:
        print(f'{kind:32} {counts[kind]}')
    print(f'{"Total":32} {sum(counts.values())}')
    for p in problems:
        print('PROBLEM', p)
    if '--write-summary' in sys.argv:
        text = '\n'.join(lines)
        table = '\n'.join(['| Status | Count |', '|---|---:|', *(f'| {k} | {counts[k]} |' for k in STATUSES), f'| **Total** | **{sum(counts.values())}** |'])
        text = re.sub(r'\| Status \| Count \|\n\|---\|---:\|\n(?:\|.*\|\n?)+', table + '\n', text, count=1)
        DOC.write_text(text + '\n', encoding='utf8')
    return 1 if problems or counts['Partial'] or counts['Missing'] else 0


if __name__ == '__main__':
    sys.exit(main())
