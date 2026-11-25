import { useMemo, useState } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import { TRANSFORM_COLLECTIONS, type LibraryTransform } from '@shared/transformLibrary';
import type { TransformDef } from '@shared/types';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Button, Kbd, SearchInput } from '../../ui';
import styles from './transforms.module.css';

export function MyTransforms({ onEdit, onCreate }: { onEdit: (transform: TransformDef) => void; onCreate: () => void }) {
  const settings = useSettings();
  const groups = useMemo(() => {
    const result: { id: string; name: string; transforms: TransformDef[] }[] = [];
    const essentials = settings.transforms.filter((transform) => !transform.collection);
    if (essentials.length) result.push({ id: 'essentials', name: 'Essentials', transforms: essentials });
    for (const collection of TRANSFORM_COLLECTIONS) {
      const transforms = settings.transforms.filter((transform) => transform.collection === collection.id);
      if (transforms.length) result.push({ id: collection.id, name: collection.name, transforms });
    }
    return result;
  }, [settings.transforms]);

  return <div className={styles.myGroups} role="region" aria-label="My Transforms grouped by collection">
    {groups.map((group) => <section key={group.id} aria-labelledby={`my-${group.id}`}>
      <h3 className={styles.groupTitle} id={`my-${group.id}`}>{group.name}<span>{group.transforms.length}</span></h3>
      <div className={styles.cards}>{group.transforms.map((transform) => <button type="button" className={styles.card} key={transform.id} onClick={() => onEdit(transform)}>{transform.shortcut ? <Kbd combo={transform.shortcut} /> : <span className={styles.plus}><Sparkles size={15} /></span>}<h4>{transform.name}</h4><p>{transform.description}</p></button>)}{group.id === 'essentials' && <button type="button" className={styles.card} onClick={onCreate}><span className={styles.plus}><Plus size={16} /></span><h4>Create your own</h4><p>Upload your own prompt</p></button>}</div>
    </section>)}
  </div>;
}

export function TransformLibrary() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const [collectionId, setCollectionId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const addedIds = useMemo(() => new Set(settings.transforms.map((transform) => transform.id)), [settings.transforms]);
  const normalized = query.trim().toLocaleLowerCase();
  const collections = normalized ? TRANSFORM_COLLECTIONS : TRANSFORM_COLLECTIONS.filter((collection) => collectionId === 'all' || collection.id === collectionId);
  const matches = (transform: LibraryTransform) => !normalized || `${transform.name} ${transform.description} ${transform.prompt}`.toLocaleLowerCase().includes(normalized);
  const visibleCollections = collections.map((collection) => ({ ...collection, transforms: collection.transforms.filter(matches) })).filter((collection) => collection.transforms.length > 0);
  const activeCollection = TRANSFORM_COLLECTIONS.find((collection) => collection.id === collectionId);
  const missing = activeCollection?.transforms.filter((transform) => !addedIds.has(transform.id)) ?? [];

  function add(transform: LibraryTransform, collection: string) {
    const next: TransformDef = { ...transform, builtIn: false, shortcut: null, collection };
    void patch({ transforms: [...settings.transforms, next] });
  }

  function remove(id: string) {
    void patch({ transforms: settings.transforms.filter((transform) => transform.id !== id) });
  }

  function addAll() {
    if (!activeCollection || !missing.length) return;
    const additions: TransformDef[] = missing.map((transform) => ({ ...transform, builtIn: false, shortcut: null, collection: activeCollection.id }));
    void patch({ transforms: [...settings.transforms, ...additions] });
  }

  return <section className={styles.library} aria-labelledby="transform-library-title">
    <div className={styles.libraryHead}><div><h2 id="transform-library-title">Transform library</h2><p>Curated ways to rewrite selected text. Add any transform to make it yours.</p></div>{activeCollection && <Button variant="outline" disabled={!missing.length} onClick={addAll}>{missing.length ? `Add all ${missing.length}` : 'All added'}</Button>}</div>
    <SearchInput value={query} onChange={setQuery} placeholder="Search transform library" className={styles.librarySearch} />
    <div className={styles.collectionTabs} role="tablist" aria-label="Transform collections">
      <button type="button" role="tab" aria-selected={collectionId === 'all'} onClick={() => setCollectionId('all')}>All <span>{TRANSFORM_COLLECTIONS.reduce((total, collection) => total + collection.transforms.length, 0)}</span></button>
      {TRANSFORM_COLLECTIONS.map((collection) => <button type="button" role="tab" aria-selected={collectionId === collection.id} key={collection.id} onClick={() => setCollectionId(collection.id)}>{collection.name} <span>{collection.transforms.length}</span></button>)}
    </div>
    <div className={styles.libraryCollections}>
      {visibleCollections.map((collection) => <section key={collection.id} aria-labelledby={`library-${collection.id}`}><div className={styles.collectionHead}><div><h3 id={`library-${collection.id}`}>{collection.name}</h3><p>{collection.description}</p></div></div><div className={styles.libraryCards}>{collection.transforms.map((transform) => {
        const added = addedIds.has(transform.id);
        return <article className={styles.libraryCard} key={transform.id}><div><h4>{transform.name}</h4><p>{transform.description}</p></div><details><summary>Preview prompt</summary><p>{transform.prompt}</p></details><Button size="sm" variant={added ? 'secondary' : 'primary'} icon={added ? <Check size={14} /> : <Plus size={14} />} onClick={() => added ? remove(transform.id) : add(transform, collection.id)}>{added ? 'Added' : 'Add'}</Button></article>;
      })}</div></section>)}
      {!visibleCollections.length && <div className={styles.libraryEmpty} role="status">No library transforms match “{query}”.</div>}
    </div>
  </section>;
}
