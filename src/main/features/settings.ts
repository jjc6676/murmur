// Settings API + side effects (login item, zoom, theme, hotkey rebinding, flow bar placement).
import { app, nativeTheme } from 'electron';
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings';
import { normalizeCombo } from '@shared/hotkeys';
import { getCtx } from '../context';
import { handle } from '../ipc';
import { applyZoomToAll, positionStatus } from '../windows';

function applySideEffects(next: Settings, prev: Settings | null): void {
  if (!prev || next.launchAtLogin !== prev.launchAtLogin) {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--hidden'] });
  }
  if (!prev || next.zoom !== prev.zoom) applyZoomToAll(next.zoom);
  if (!prev || next.theme !== prev.theme) nativeTheme.themeSource = next.theme;
  if (!prev || next.flowBarDock !== prev.flowBarDock) positionStatus();
}

export function registerSettings(): void {
  const { settings, hotkeys } = getCtx();
  applySideEffects(settings.get(), null);
  settings.onChange((n, p) => applySideEffects(n, p));
  handle('settings', {
    get: () => settings.get(),
    patch: (p) => settings.patch(p),
    reset: () => settings.reset(),
    async recordShortcut() {
      const combo = await hotkeys.recordNextCombo();
      return normalizeCombo(combo);
    },
    cancelRecordShortcut: () => hotkeys.cancelRecording(),
    setShortcut(action, combos) {
      const clean = [...new Set(combos.map(normalizeCombo).filter(Boolean))];
      return settings.set('shortcuts', { ...settings.get().shortcuts, [action]: clean });
    },
    resetShortcuts: () => settings.set('shortcuts', DEFAULT_SETTINGS.shortcuts),
  });
}
