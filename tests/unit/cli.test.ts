import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCli } from '../../src/main/llm/cli';

const originalPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = originalPath;
});

describe('resolveCli', () => {
  it('unwraps an npm .cmd shim to its JS entry, not the optional bundled node.exe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'murmur-shim-'));
    writeFileSync(
      join(dir, 'codex.cmd'),
      [
        '@ECHO off',
        'IF EXIST "%dp0%\\node.exe" (',
        '  SET "_prog=%dp0%\\node.exe"',
        ') ELSE ( SET "_prog=node" )',
        'endLocal & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
      ].join('\r\n'),
    );
    process.env.PATH = [dir, originalPath].join(delimiter);
    const resolved = resolveCli('codex');
    expect(resolved?.prefixArgs[0]).toBe(join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'));
    expect(resolved?.command).not.toBe(join(dir, 'node.exe'));
  });
});
