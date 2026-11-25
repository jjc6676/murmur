// Live settings store shared by all components in a window.
import { create } from 'zustand';
import type { DeepPartial, Settings } from '@shared/settings';
import { api, onEvent } from './api';

interface SettingsStore {
  settings: Settings | null;
  patch(p: DeepPartial<Settings>): Promise<Settings>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  async patch(p) {
    const next = await api.settings.patch(p);
    set({ settings: next });
    return next;
  },
}));

let initialized = false;
/** Load settings once per window and keep them in sync with main. */
export function initSettings(): Promise<Settings> {
  if (!initialized) {
    initialized = true;
    onEvent('settings:changed', (s) => {
      useSettingsStore.setState({ settings: s });
      applyTheme(s);
    });
  }
  return api.settings.get().then((s) => {
    useSettingsStore.setState({ settings: s });
    applyTheme(s);
    return s;
  });
}

/** Settings are loaded before any page renders (see main.tsx bootstraps), so this is non-null in components. */
export function useSettings(): Settings {
  const s = useSettingsStore((st) => st.settings);
  if (!s) throw new Error('settings not loaded');
  return s;
}

export function usePatchSettings(): (p: DeepPartial<Settings>) => Promise<Settings> {
  return useSettingsStore((st) => st.patch);
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(s: Pick<Settings, 'theme'>): void {
  const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

media.addEventListener('change', () => {
  const s = useSettingsStore.getState().settings;
  if (s) applyTheme(s);
});
