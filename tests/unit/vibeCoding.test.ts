import { describe, expect, it } from 'vitest';
import { applyFileTags, applyIdentifiers, extractFileNames, extractIdentifiers } from '@shared/vibeCoding';

describe('vibe coding', () => {
  it('extracts files and identifiers from editor context', () => {
    const ctx = 'import { getUserId } from "./auth.ts"; const user_name = getUserId(); checkout.ts';
    expect(extractFileNames('checkout.ts - shop - Cursor', ctx).sort()).toEqual(['auth.ts', 'checkout.ts']);
    expect(extractIdentifiers(ctx)).toEqual(expect.arrayContaining(['getUserId', 'user_name']));
  });

  it('rewrites spoken identifiers', () => {
    expect(applyIdentifiers('rename get user id to fetch it', ['getUserId'])).toBe('rename getUserId to fetch it');
    expect(applyIdentifiers('log the user name', ['user_name'])).toBe('log the user_name');
  });

  it('tags spoken file names', () => {
    expect(applyFileTags('only edit checkout dot ts please', ['checkout.ts'])).toBe('only edit @checkout.ts please');
    expect(applyFileTags('see Checkout.ts and @checkout.ts', ['checkout.ts'])).toBe('see @checkout.ts and @checkout.ts');
  });
});
