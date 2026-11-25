import { describe, expect, it } from 'vitest';
import { transcriptionFormatForApp } from '../../src/shared/apps';

describe('transcriptionFormatForApp', () => {
  it('matches process names case-insensitively with or without exe suffix', () => {
    const overrides = [{ app: 'Notepad.exe', format: 'raw' as const }];
    expect(transcriptionFormatForApp('notepad', overrides)).toBe('raw');
    expect(transcriptionFormatForApp('NOTEPAD.EXE', overrides)).toBe('raw');
  });

  it('defaults to formatted output for apps without an override', () => {
    expect(transcriptionFormatForApp('winword', [])).toBe('formatted');
  });
});
