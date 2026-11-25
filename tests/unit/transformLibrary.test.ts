import { describe, expect, it } from 'vitest';
import { findLibraryTransform, TRANSFORM_COLLECTIONS } from '../../src/shared/transformLibrary';

const expectedCollections = [
  { id: 'writing', name: 'Writing & Editing' },
  { id: 'tone', name: 'Tone & Voice' },
  { id: 'structure', name: 'Structure & Formatting' },
  { id: 'summarize', name: 'Summarize & Extract' },
  { id: 'email', name: 'Email' },
  { id: 'messaging', name: 'Messaging & Updates' },
  { id: 'developer', name: 'Developer' },
  { id: 'prompting', name: 'AI Prompting' },
  { id: 'social', name: 'Social & Marketing' },
  { id: 'language', name: 'Language & Translation' },
];

describe('transform library', () => {
  it('contains ten ordered collections with ten transforms each', () => {
    expect(TRANSFORM_COLLECTIONS).toHaveLength(10);
    expect(TRANSFORM_COLLECTIONS.map(({ id, name }) => ({ id, name }))).toEqual(expectedCollections);

    for (const collection of TRANSFORM_COLLECTIONS) {
      expect(collection.transforms, collection.name).toHaveLength(10);
    }
  });

  it('uses unique, collection-scoped ids and unique names', () => {
    const transforms = TRANSFORM_COLLECTIONS.flatMap((collection) =>
      collection.transforms.map((transform) => ({ collection, transform })),
    );
    const ids = transforms.map(({ transform }) => transform.id);
    const names = transforms.map(({ transform }) => transform.name);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);

    for (const { collection, transform } of transforms) {
      expect(transform.id).toMatch(new RegExp(`^lib\\.${collection.id}\\.[a-z0-9-]+$`));
    }
  });

  it('provides bounded, non-empty prompts', () => {
    for (const collection of TRANSFORM_COLLECTIONS) {
      for (const transform of collection.transforms) {
        expect(transform.prompt.trim(), transform.id).not.toBe('');
        expect(transform.prompt.length, transform.id).toBeLessThanOrEqual(1200);
      }
    }
  });

  it('round-trips every transform through findLibraryTransform', () => {
    for (const collection of TRANSFORM_COLLECTIONS) {
      for (const transform of collection.transforms) {
        expect(findLibraryTransform(transform.id)).toEqual({ collection, transform });
      }
    }

    expect(findLibraryTransform('lib.unknown.missing')).toBeNull();
  });
});
