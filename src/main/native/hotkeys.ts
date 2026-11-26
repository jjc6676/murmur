// Global hotkeys with press AND release semantics (push-to-talk) using a low-level keyboard hook.
import { EventEmitter } from 'node:events';
import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi';
import { isVirtualKeyDown, maskStartMenu } from './win32';
import { comboKeyIds, normalizeKeyId, type KeyId } from '@shared/hotkeys';

// uiohook keycode -> canonical key id (left/right variants collapse)
const CODE_TO_ID = new Map<number, KeyId>();
for (const [name, code] of Object.entries(UiohookKey)) {
  const id = normalizeKeyId(name);
  if (id) CODE_TO_ID.set(code, id);
}

const MODIFIER_VK = new Map<number, number>([
  [UiohookKey.Ctrl, 0xa2], [UiohookKey.CtrlRight, 0xa3], [UiohookKey.Shift, 0xa0], [UiohookKey.ShiftRight, 0xa1],
  [UiohookKey.Alt, 0xa4], [UiohookKey.AltRight, 0xa5], [UiohookKey.Meta, 0x5b], [UiohookKey.MetaRight, 0x5c],
]);
const SHIFT_SHORTCUT_KEYS: Record<string, true> = {
  Tab: true, Delete: true, Insert: true, F10: true, Home: true, End: true, PageUp: true, PageDown: true,
  ArrowLeft: true, ArrowRight: true, ArrowUp: true, ArrowDown: true,
};

export interface HotkeyBinding {
  id: string;
  combo: string; // e.g. "Ctrl+Win", "CapsLock", "Alt+Shift+Z"
  ptt?: boolean;
}

type Binding = { id: string; keys: KeyId[]; ptt?: boolean };
type Events = {
  down: [id: string]; up: [id: string]; cancel: [id: string]; doubleTap: [id: string];
  key: [id: KeyId, down: boolean]; mouse: [button: number];
};

/** From an empty keyboard to full release: one uninterrupted press and release of each chord member. */
export class TapSequence {
  private started: number | null = null;
  private binding: string | null = null;
  private previous: { binding: string; released: number } | null = null;

  press(fromEmpty: boolean, time: number): void {
    if (fromEmpty) this.started = time;
    else if (this.binding !== null) this.interrupt();
  }

  match(binding: string): void {
    if (this.started !== null) this.binding = binding;
  }

  interrupt(): void {
    this.started = null;
    this.binding = null;
    this.previous = null;
  }

  release(fullyReleased: boolean, time: number): string | null {
    const { binding, started, previous } = this;
    if (binding === null || started === null || ((time - started) >>> 0) >= 250) {
      this.interrupt();
      return null;
    }
    if (!fullyReleased) return null;
    this.interrupt();
    // Windows hook timestamps are millisecond DWORDs and can wrap between events.
    if (previous?.binding === binding && ((started - previous.released) >>> 0) < 600) return binding;
    this.previous = { binding, released: time };
    return null;
  }
}

/**
 * A normal release ends a hold immediately. Resets, a lost release or a longer chord cancel it instead.
 * Keep both physical sides until release; only the binding comparison uses canonical names.
 */
export class HotkeyManager extends EventEmitter<Events> {
  private held = new Map<number, KeyId | null>(); // Hook keycodes; negative numbers are mouse buttons.
  private blockedUntilUp = new Set<number>();
  private bindings: Binding[] = [];
  private active: Binding | null = null;
  private activeAt = 0;
  private taps = new TapSequence();
  private menuMaskTimes: number[] = [];
  private started = false;
  private recording: ((combo: string) => void) | null = null;
  private recordPeak = new Set<KeyId>();

  setBindings(bindings: HotkeyBinding[]): void {
    this.reset();
    this.bindings = bindings
      .map((b) => ({ ...b, keys: comboKeyIds(b.combo) }))
      .filter((b) => b.keys.length > 0)
      .sort((a, b) => b.keys.length - a.keys.length);
  }

  start(): void {
    if (this.started) return;
    this.reset();
    this.started = true;
    uIOhook.on('keydown', (e) => this.onKey(e, true));
    uIOhook.on('keyup', (e) => this.onKey(e, false));
    uIOhook.on('mousedown', (e) => {
      if (typeof e.button !== 'number') return;
      if (!this.recording && e.button > 3) this.emit('mouse', e.button);
      this.onInput(-e.button, this.mouseId(e.button), true, e.time);
    });
    uIOhook.on('mouseup', (e) => {
      if (typeof e.button === 'number') this.onInput(-e.button, this.mouseId(e.button), false, e.time);
    });
    uIOhook.on('wheel', () => this.taps.interrupt());
    uIOhook.on('mousemove', () => this.taps.interrupt());
    uIOhook.start();
  }

  stop(): void {
    this.reset();
    if (!this.started) return;
    this.started = false;
    uIOhook.removeAllListeners();
    uIOhook.stop();
  }

  reset(): void {
    // Ignore auto-repeats from before a reset until we see a release. Modifiers can also
    // have been pressed/released on another desktop while the hook wasn't receiving input.
    for (const code of this.held.keys()) this.blockedUntilUp.add(code);
    for (const [code, vk] of MODIFIER_VK) {
      if (isVirtualKeyDown(vk)) this.blockedUntilUp.add(code);
      else this.blockedUntilUp.delete(code);
    }
    this.held.clear();
    this.menuMaskTimes.length = 0;
    this.recordPeak.clear();
    this.cancelActive();
  }

  interruptTaps(): void {
    this.taps.interrupt();
  }

  /** Capture the next chord the user presses (for the "Change shortcut" UI). Resolves on first full release. */
  recordNextCombo(): Promise<string> {
    this.reset();
    const { promise, resolve } = Promise.withResolvers<string>();
    this.recording = resolve;
    return promise;
  }

  cancelRecording(): void {
    this.recording = null;
  }

  isHeld(id: KeyId): boolean {
    for (const held of this.held.values()) if (held === id) return true;
    return false;
  }

  private onKey(e: UiohookKeyboardEvent, down: boolean): void {
    // uiohook drops the raw VK. Ignore our own unassigned mask pair, not a user's unmapped key.
    if (e.keycode === 0) {
      const mask = this.menuMaskTimes.indexOf(e.time);
      if (mask >= 0) {
        if (!down) this.menuMaskTimes.splice(mask, 1);
        return;
      }
    }
    const id = CODE_TO_ID.get(e.keycode) ?? null;
    this.onInput(e.keycode, id, down, e.time);
  }

  private mouseId(button: number): KeyId | null {
    return button === 11 ? 'Aux Button' : button > 3 ? `Mouse ${button}` : null;
  }

  private cancelActive(): void {
    this.taps.interrupt();
    const active = this.active;
    this.active = null;
    if (active) this.emit('cancel', active.id);
  }

  private reconcileModifiers(incoming: number): void {
    // WH_KEYBOARD_LL runs before the asynchronous state update for the incoming key.
    // Trust its edge, but never trust an old down for a different modifier without checking Windows.
    for (const code of this.held.keys()) {
      const vk = MODIFIER_VK.get(code);
      if (code === incoming || vk === undefined || isVirtualKeyDown(vk)) continue;
      this.held.delete(code);
      this.taps.interrupt();
    }
    if (this.active && !this.active.keys.every((key) => this.isHeld(key))) this.cancelActive();
  }

  private onInput(code: number, id: KeyId | null, down: boolean, time: number): void {
    if (this.blockedUntilUp.has(code)) {
      this.taps.interrupt();
      if (!down) this.blockedUntilUp.delete(code);
      return;
    }
    if (down) this.reconcileModifiers(code);
    if (code >= 0 && id !== null) this.emit('key', id, down);
    const duplicateSide = down && id !== null && this.isHeld(id);
    if (down) {
      if (this.held.has(code)) return; // auto-repeat
      this.taps.press(this.held.size === 0, time);
      if (duplicateSide) this.taps.interrupt();
      this.held.set(code, id);
    } else if (!this.held.delete(code)) {
      this.taps.interrupt();
      return;
    }

    if (this.recording) {
      if (down) {
        for (const key of this.held.values()) if (key !== null) this.recordPeak.add(key);
      } else if (this.held.size === 0 && this.recordPeak.size > 0) {
        const done = this.recording;
        this.recording = null;
        done([...this.recordPeak].join('+'));
      }
      return;
    }

    if (!down) {
      if (this.active && !this.active.keys.every((key) => this.isHeld(key))) {
        const { id: released } = this.active;
        this.active = null;
        this.emit('up', released);
      }
      const doubleTap = this.taps.release(this.held.size === 0, time);
      if (doubleTap !== null) this.emit('doubleTap', doubleTap);
      return;
    }

    if (this.active?.ptt && code >= 0 && (id === null || !this.active.keys.includes(id))) {
      // Ctrl/Alt/Win chords can be claimed by Windows or the foreground app. Shift by itself
      // also has navigation/editing shortcuts, but a shifted letter is ordinary typing.
      const shortcut = !MODIFIER_VK.has(code) && (this.isHeld('Ctrl') || this.isHeld('Win') || this.isHeld('Alt')
        || (this.isHeld('Shift') && id !== null && SHIFT_SHORTCUT_KEYS[id]));
      if (shortcut || ((time - this.activeAt) >>> 0) <= 300) this.cancelActive();
    }
    if (id === null || duplicateSide) return;
    for (const blocked of this.blockedUntilUp) {
      const vk = MODIFIER_VK.get(blocked);
      if (vk === undefined) continue;
      if (isVirtualKeyDown(vk)) return; // An old modifier mustn't silently change a fresh chord.
      this.blockedUntilUp.delete(blocked);
    }
    const binding = this.bindings.find((b) => b.keys.includes(id) && b.keys.every((key) => this.isHeld(key)) && this.onlyHolds(b));
    if (!binding || binding === this.active) return;
    if (this.active) this.cancelActive();
    this.active = binding;
    this.activeAt = time;
    if (binding.ptt) this.taps.match(binding.id);
    else this.taps.interrupt();
    if (binding.keys.includes('Win') && maskStartMenu(time)) {
      // A lost mask release must not grow this queue indefinitely.
      if (this.menuMaskTimes.length === 32) this.menuMaskTimes.shift();
      this.menuMaskTimes.push(time);
    }
    this.emit('down', binding.id);
  }

  private onlyHolds(binding: Binding): boolean {
    for (const key of this.held.values()) if (key === null || !binding.keys.includes(key)) return false;
    return true;
  }
}
