// Hub-window UI state shared across shell, pages and dialogs.
import { create } from 'zustand';

export type SettingsSection =
  | 'general'
  | 'shortcuts'
  | 'system'
  | 'notetaker'
  | 'vibe-coding'
  | 'experimental'
  | 'ai'
  | 'connectors'
  | 'developer'
  | 'mcp'
  | 'account'
  | 'team'
  | 'data';

export interface LocalToast {
  id: string;
  title: string;
  body?: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  actions?: { label: string; onClick: () => void }[];
}

interface HubUi {
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  micQuizOpen: boolean;
  openMicQuiz(): void;
  closeMicQuiz(): void;
  notificationsOpen: boolean;
  setNotificationsOpen(v: boolean): void;
  diff: { before: string; after: string; title: string } | null;
  showDiff(d: { before: string; after: string; title: string } | null): void;
  toasts: LocalToast[];
  toast(t: Omit<LocalToast, 'id'>): void;
  dismissToast(id: string): void;
}

export const useHubUi = create<HubUi>((set, get) => ({
  settingsOpen: false,
  settingsSection: 'general',
  openSettings: (section = 'general') => set({ settingsOpen: true, settingsSection: section }),
  closeSettings: () => set({ settingsOpen: false }),
  micQuizOpen: false,
  openMicQuiz: () => set({ micQuizOpen: true }),
  closeMicQuiz: () => set({ micQuizOpen: false }),
  notificationsOpen: false,
  setNotificationsOpen: (v) => set({ notificationsOpen: v }),
  diff: null,
  showDiff: (d) => set({ diff: d }),
  toasts: [],
  toast(t) {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [{ ...t, id }] });
    setTimeout(() => get().dismissToast(id), 4500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** Show a transient toast in the hub (renderer-local). */
export function toast(title: string, opts: Omit<LocalToast, 'id' | 'title'> = {}): void {
  useHubUi.getState().toast({ title, ...opts });
}
