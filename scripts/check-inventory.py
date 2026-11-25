"""Validate docs/flow-inventory.md: status vocabulary, citations that resolve, and summary counts.

Usage: python scripts/check-inventory.py [--write-summary]
Exit code 1 when a row has an unknown status, an Implemented row lacks a citation,
or a citation points at a missing file / out-of-range line.
"""
import re
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


def main() -> int:
    lines = DOC.read_text(encoding='utf8').splitlines()
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
