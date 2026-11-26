// Maps configured shortcut combos (settings) to actions.
import { powerMonitor } from 'electron';
import type { Settings, ShortcutAction } from '@shared/settings';
import { getCtx } from './context';
import { broadcast } from './ipc';
import type { HotkeyBinding } from './native/hotkeys';
import { sendChord, VK } from './native/win32';
import { showNudge, showToast } from './toasts';
import { cancelDictation, cancelDictationForOtherShortcut, copyLast, getDictationState, handleUndoShortcut, isDictating, pasteLast, startDictation, stopDictation } from './features/dictation';
import { applyToSelection, cancelTransform, openTransformPicker } from './features/transforms';
import { openScratchpad } from './features/notes';
import { toggleRecording } from './features/recorder';

type Handler = { down?: () => void; up?: () => void };

let lastTransformDiff: { before: string; after: string; title: string } | null = null;

function handlers(): Record<ShortcutAction, Handler> {
  return {
    ptt: {
      down: () => {
        const st = getDictationState();
        if (isDictating() && st.mode === 'popo') stopDictation();
        else startDictation('ptt', 'ptt_hotkey');
      },
      up: () => {
        if (isDictating() && getDictationState().mode === 'ptt') stopDictation();
        else getCtx().hotkeys.interruptTaps(); // A rejected, cancelled or already ended hold isn't a tap.
      },
    },
    popo: { down: () => (isDictating() ? stopDictation() : startDictation('popo', 'popo_hotkey')) },
    cancel: {
      down: () => {
        if (isDictating()) cancelDictation();
        else cancelTransform();
      },
    },
    pasteLast: { down: () => void pasteLast() },
    copyLast: { down: () => copyLast() },
    command: { down: () => startDictation('command', 'ptt_hotkey'), up: () => getDictationState().mode === 'command' && stopDictation() },
    lens: { down: () => startDictation('lens', 'ptt_hotkey'), up: () => getDictationState().mode === 'lens' && stopDictation() },
    instruct: { down: () => startDictation('instruct', 'ptt_hotkey'), up: () => getDictationState().mode === 'instruct' && stopDictation() },
    polish: { down: () => void runTransform('polish') },
    viewDiff: { down: () => lastTransformDiff && broadcast('diff:show', lastTransformDiff) },
    transformPicker: { down: () => openTransformPicker() },
    openScratchpad: { down: () => openScratchpad() },
    startNotetaker: { down: () => void toggleRecording() },
    pressEnter: { down: () => sendChord([], VK.RETURN) },
    focusMode: {
      down: () => {
        const { settings } = getCtx();
        const on = !settings.get().focusMode.enabled;
        settings.patch({ focusMode: { enabled: on } });
        showToast({ key: on ? 'FocusModeActivated' : 'FocusModeDeactivated', title: on ? 'Focus Mode on' : 'Focus Mode off', target: 'bar' });
      },
    },
  };
}

async function runTransform(id: string): Promise<void> {
  if (isDictating()) {
    showToast({ key: 'PolishDisabledDuringDictation', title: "Transforms don't work while dictating", target: 'bar' });
    return;
  }
  const run = await applyToSelection(id);
  if (run?.status === 'success') {
    const t = getCtx().settings.get().transforms.find((x) => x.id === id);
    lastTransformDiff = { before: run.inputText, after: run.outputText, title: t?.name ?? 'Transform' };
  }
}

function bind(s: Settings): void {
  const { hotkeys } = getCtx();
  const list: HotkeyBinding[] = [];
  for (const [action, combos] of Object.entries(s.shortcuts)) {
    // transform shortcuts come from the transforms list (polish included) so they stay in sync with the Transforms page
    if (action === 'polish') continue;
    combos.forEach((combo, i) => list.push({ id: `${action}#${i}`, combo, ptt: action === 'ptt' }));
  }
  if (s.transformsEnabled) for (const t of s.transforms) if (t.shortcut) list.push({ id: `transform:${t.id}`, combo: t.shortcut });
  hotkeys.setBindings(list);
}

export function setupShortcuts(): void {
  const { hotkeys, settings } = getCtx();
  const h = handlers();
  hotkeys.on('down', (id) => {
    if (id.startsWith('transform:')) return void runTransform(id.slice('transform:'.length));
    const action = id.split('#')[0] as ShortcutAction;
    h[action]?.down?.();
  });
  hotkeys.on('up', (id) => {
    const action = id.split('#')[0] as ShortcutAction;
    h[action]?.up?.();
  });
  hotkeys.on('cancel', (id) => {
    const mode = getDictationState().mode;
    if (mode && mode !== 'popo' && id.split('#')[0] === mode) cancelDictationForOtherShortcut();
  });
  hotkeys.on('doubleTap', () => {
    if (!isDictating()) startDictation('popo', 'popo_double_tap');
  });
  hotkeys.on('mouse', (button) => {
    const { mouseFlow, mouseFlowConfigured } = settings.get();
    if (!mouseFlowConfigured) return;
    if (button === mouseFlow.dictateButton) {
      if (isDictating()) stopDictation();
      else startDictation('popo', 'mouse');
    } else if (button === mouseFlow.enterButton) sendChord([], VK.RETURN);
  });
  hotkeys.on('key', (id, down) => {
    if (down && id === 'Z' && hotkeys.isHeld('Ctrl')) handleUndoShortcut();
  });
  hotkeys.on('mouse', (button) => {
    if (!settings.get().mouseFlowConfigured && (button === 4 || button === 5)) {
      if (!showNudge('MouseFlowDiscovery', { title: 'Want to dictate with your mouse?', body: 'Assign a side button to start hands-free dictation.', target: 'bar', actions: [{ id: 'settings', label: 'Set up Mouse Flow' }] }, { max: 1 }, (action) => action === 'settings' && broadcast('settings:open', { section: 'general' })))
        showNudge('MouseFlowDiscoveryReminder', { title: 'You can dictate with your mouse', body: 'Set up a side button in Settings.', target: 'bar' }, { max: 2, minIntervalMs: 7 * 24 * 3600_000 });
    }
  });
  bind(settings.get());
  settings.onChange((n, p) => {
    if (n.shortcuts !== p.shortcuts || n.transforms !== p.transforms || n.transformsEnabled !== p.transformsEnabled) bind(n);
  });
  const reset = () => hotkeys.reset();
  powerMonitor.on('lock-screen', reset);
  powerMonitor.on('unlock-screen', reset);
  powerMonitor.on('suspend', reset);
  powerMonitor.on('resume', reset);
  if (process.env.MURMUR_NO_HOOK !== '1') hotkeys.start();
}
