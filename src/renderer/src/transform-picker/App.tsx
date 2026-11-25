import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { TRANSFORM_COLLECTIONS } from '@shared/transformLibrary';
import type { TransformDef } from '@shared/types';
import { api } from '../lib/api';
import { useSettings } from '../lib/settings';
import styles from './picker.module.css';

interface TransformGroup {
  id: string;
  name: string;
  transforms: TransformDef[];
}

export function App() {
  const settings = useSettings();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = (transform: TransformDef) => !normalized || `${transform.name} ${transform.description}`.toLocaleLowerCase().includes(normalized);
    const result: TransformGroup[] = [];
    const essentials = settings.transforms.filter((transform) => !transform.collection && matches(transform));
    if (essentials.length) result.push({ id: 'essentials', name: 'Essentials', transforms: essentials });
    for (const collection of TRANSFORM_COLLECTIONS) {
      const transforms = settings.transforms.filter((transform) => transform.collection === collection.id && matches(transform));
      if (transforms.length) result.push({ id: collection.id, name: collection.name, transforms });
    }
    const knownCollections = new Set(TRANSFORM_COLLECTIONS.map((collection) => collection.id));
    const other = settings.transforms.filter((transform) => transform.collection && !knownCollections.has(transform.collection) && matches(transform));
    if (other.length) result.push({ id: 'other', name: 'Other', transforms: other });
    return result;
  }, [query, settings.transforms]);
  const visible = groups.flatMap((group) => group.transforms);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void api.transforms.closePicker();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  function choose(transform: TransformDef) {
    void api.transforms.chooseFromPicker(transform.id);
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((index) => visible.length ? (index + 1) % visible.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((index) => visible.length ? (index - 1 + visible.length) % visible.length : 0);
    } else if (event.key === 'Enter' && visible[selected]) {
      event.preventDefault();
      choose(visible[selected]);
    }
  }

  let itemIndex = 0;
  return (
    <main className={styles.picker} onKeyDown={handleKeyDown}>
      <header className={styles.header}>
        <div><span>TRANSFORMS</span><h1>Apply transform</h1></div>
        <button type="button" aria-label="Close transform picker" onClick={() => void api.transforms.closePicker()}><X size={17} /></button>
      </header>
      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <span className="visually-hidden">Search transforms</span>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search My Transforms" />
      </label>
      <div className={styles.list} role="listbox" aria-label="My Transforms">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`picker-${group.id}`}>
            <h2 id={`picker-${group.id}`}>{group.name}</h2>
            {group.transforms.map((transform) => {
              const index = itemIndex++;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === index}
                  className={selected === index ? styles.selected : undefined}
                  key={transform.id}
                  onMouseMove={() => setSelected(index)}
                  onClick={() => choose(transform)}
                >
                  <span className={styles.icon}><Sparkles size={15} /></span>
                  <span><strong>{transform.name}</strong><small>{transform.description}</small></span>
                </button>
              );
            })}
          </section>
        ))}
        {!visible.length && <div className={styles.empty} role="status">No transforms match “{query}”.</div>}
      </div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> apply</span><span><kbd>Esc</kbd> close</span></footer>
    </main>
  );
}
