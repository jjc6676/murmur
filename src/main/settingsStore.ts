// Settings persistence: settings.json in userData, merged over defaults on load.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, mergeSettings, type DeepPartial, type Settings } from '@shared/settings';
import { broadcast } from './ipc';

type Listener = (next: Settings, prev: Settings) => void;

export class SettingsStore {
  private value: Settings;
  private listeners = new Set<Listener>();

  constructor(private file: string) {
    this.value = DEFAULT_SETTINGS;
    if (existsSync(file)) {
      try {
        this.value = mergeSettings(DEFAULT_SETTINGS, JSON.parse(readFileSync(file, 'utf8')) as DeepPartial<Settings>);
      } catch {
        // corrupt file: keep defaults; it is rewritten on next patch
      }
    }
  }

  get(): Settings {
    return this.value;
  }

  patch(patch: DeepPartial<Settings>): Settings {
    const prev = this.value;
    this.value = mergeSettings(prev, patch);
    this.persist();
    for (const l of this.listeners) l(this.value, prev);
    broadcast('settings:changed', this.value);
    return this.value;
  }

  /** Replace a whole top-level key (needed for arrays/records where merge semantics are wrong). */
  set<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
    const prev = this.value;
    this.value = { ...prev, [key]: value };
    this.persist();
    for (const l of this.listeners) l(this.value, prev);
    broadcast('settings:changed', this.value);
    return this.value;
  }

  reset(): Settings {
    const prev = this.value;
    this.value = DEFAULT_SETTINGS;
    this.persist();
    for (const l of this.listeners) l(this.value, prev);
    broadcast('settings:changed', this.value);
    return this.value;
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.value, null, 2));
    renameSync(tmp, this.file);
  }
}
