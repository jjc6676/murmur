// Global hotkeys with press AND release semantics (push-to-talk) using a low-level keyboard hook.
import { EventEmitter } from 'node:events';
import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi';
import { keyDown, keyUp } from './win32';
import { comboKeyIds, normalizeKeyId, type KeyId } from '@shared/hotkeys';

// uiohook keycode -> canonical key id (left/right variants collapse)
const CODE_TO_ID = new Map<number, KeyId>();
for (const [name, code] of Object.entries(UiohookKey)) {
  const id = normalizeKeyId(name);
  if (id) CODE_TO_ID.set(code, id);
}

const MENU_MASK_VK = 0xe8; // unassigned VK: masks Start menu when Win is released after a chord

export interface HotkeyBinding {
  id: string;
  combo: string; // e.g. "Ctrl+Win", "CapsLock", "Alt+Shift+Z"
}

type Events = { down: [id: string]; up: [id: string]; key: [id: KeyId, down: boolean]; mouse: [button: number] };

/**
 * Emits `down` when every key of a binding is held (and no extra non-modifier key), `up` when any is released.
 * Longest binding wins when several match the same held set (Ctrl+Win+Space beats Ctrl+Win).
 */
export class HotkeyManager extends EventEmitter<Events> {
  private held = new Set<KeyId>();
  private bindings: { id: string; keys: KeyId[] }[] = [];
  private active = new Set<string>();
  private started = false;
  private recording: ((combo: string) => void) | null = null;
  private recordPeak = new Set<KeyId>();

  setBindings(bindings: HotkeyBinding[]): void {
    this.bindings = bindings
      .map((b) => ({ id: b.id, keys: comboKeyIds(b.combo) }))
      .filter((b) => b.keys.length > 0)
      .sort((a, b) => b.keys.length - a.keys.length);
    this.active.clear();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    uIOhook.on('keydown', (e) => this.onKey(e, true));
    uIOhook.on('keyup', (e) => this.onKey(e, false));
    uIOhook.on('mousedown', (e) => {
      if (typeof e.button !== 'number' || e.button <= 3) return;
      this.emit('mouse', e.button);
      this.onInput(e.button === 11 ? 'Aux Button' : `Mouse ${e.button}`, true);
    });
    uIOhook.on('mouseup', (e) => {
      if (typeof e.button === 'number' && e.button > 3) this.onInput(e.button === 11 ? 'Aux Button' : `Mouse ${e.button}`, false);
    });
    uIOhook.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    uIOhook.removeAllListeners();
    uIOhook.stop();
  }

  /** Capture the next chord the user presses (for the "Change shortcut" UI). Resolves on first full release. */
  recordNextCombo(): Promise<string> {
    this.recordPeak.clear();
    const { promise, resolve } = Promise.withResolvers<string>();
    this.recording = resolve;
    return promise;
  }

  cancelRecording(): void {
    this.recording = null;
  }

  isHeld(id: KeyId): boolean {
    return this.held.has(id);
  }

  private onKey(e: UiohookKeyboardEvent, down: boolean): void {
    const id = CODE_TO_ID.get(e.keycode);
    if (!id) return;
    this.emit('key', id, down);
    this.onInput(id, down);
  }

  private onInput(id: KeyId, down: boolean): void {
    if (down) {
      if (this.held.has(id)) return;
      this.held.add(id);
    } else {
      this.held.delete(id);
    }

    if (this.recording) {
      if (down) for (const key of this.held) this.recordPeak.add(key);
      else if (this.held.size === 0 && this.recordPeak.size > 0) {
        const done = this.recording;
        this.recording = null;
        done([...this.recordPeak].join('+'));
      }
      return;
    }

    for (const binding of this.bindings) {
      if (this.active.has(binding.id) && !binding.keys.every((key) => this.held.has(key))) {
        this.active.delete(binding.id);
        this.emit('up', binding.id);
      }
    }
    if (!down) return;
    for (const binding of this.bindings) {
      if (this.active.has(binding.id)) continue;
      if (binding.keys.length !== this.held.size || !binding.keys.every((key) => this.held.has(key))) continue;
      if ([...this.active].some((activeId) => this.bindings.find((candidate) => candidate.id === activeId)!.keys.length > binding.keys.length)) continue;
      for (const activeId of [...this.active]) {
        this.active.delete(activeId);
        this.emit('up', activeId);
      }
      this.active.add(binding.id);
      if (binding.keys.includes('Win')) {
        keyDown(MENU_MASK_VK);
        keyUp(MENU_MASK_VK);
      }
      this.emit('down', binding.id);
      break;
    }
  }
}
