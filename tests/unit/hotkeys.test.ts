import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uIOhook, UiohookKey as K } from 'uiohook-napi';
import { HotkeyManager, TapSequence } from '../../src/main/native/hotkeys';

// Drive the real hook adapter with physical edges and an independent Windows key-state snapshot.
const { windowsDown } = vi.hoisted(() => ({ windowsDown: new Set<number>() }));
vi.mock('../../src/main/native/win32', () => ({ isVirtualKeyDown: (vk: number) => windowsDown.has(vk), maskStartMenu: () => true }));
vi.mock('uiohook-napi', () => ({
  uIOhook: Object.assign(new EventEmitter(), { start: vi.fn(), stop: vi.fn() }),
  UiohookKey: { Ctrl: 29, CtrlRight: 3613, Shift: 42, ShiftRight: 54, Alt: 56, AltRight: 3640, Meta: 3675, MetaRight: 3676, Space: 57, D: 32, ArrowLeft: 57419, ArrowRight: 57421, F4: 62 },
}));

describe('TapSequence', () => {
  function tap(seq: TapSequence, binding: string, start: number, end: number) {
    seq.press(true, start);
    seq.press(false, start + 1);
    seq.match(binding);
    expect(seq.release(false, end - 1)).toBeNull();
    return seq.release(true, end);
  }

  it('requires the same binding and consumes each pair only once', () => {
    const seq = new TapSequence();
    expect(tap(seq, 'ptt#0', 0, 20)).toBeNull();
    expect(tap(seq, 'ptt#1', 30, 50)).toBeNull();
    expect(tap(seq, 'ptt#1', 60, 80)).toBe('ptt#1');
    expect(tap(seq, 'ptt#1', 90, 110)).toBeNull();
  });

  it.each([
    [249, 599, 249, 'ptt#0'], [250, 10, 20, null], [20, 600, 20, null], [20, 10, 250, null],
  ] as const)('uses strict physical duration/gap limits (%i, %i, %i ms)', (first, gap, second, expected) => {
    const seq = new TapSequence();
    expect(tap(seq, 'ptt#0', 0, first)).toBeNull();
    expect(tap(seq, 'ptt#0', first + gap, first + gap + second)).toBe(expected);
  });

  it('does not count a re-press before the complete chord is up', () => {
    const seq = new TapSequence();
    tap(seq, 'ptt#0', 0, 20);
    seq.press(true, 30);
    seq.press(false, 40);
    seq.match('ptt#0');
    expect(seq.release(false, 45)).toBeNull();
    seq.press(false, 50);
    seq.match('ptt#0');
    expect(seq.release(true, 60)).toBeNull();
    expect(tap(seq, 'ptt#0', 70, 90)).toBeNull();
  });
});

describe('physical hook gestures', () => {
  const bindings = [{ id: 'ptt#0', combo: 'Ctrl+Win', ptt: true }, { id: 'popo#0', combo: 'Ctrl+Win+Space' }];
  const vks = new Map<number, number>([[K.Ctrl, 0xa2], [K.CtrlRight, 0xa3], [K.Meta, 0x5b], [K.MetaRight, 0x5c]]);
  let hotkeys: HotkeyManager;
  let events: string[];

  beforeEach(() => {
    windowsDown.clear();
    hotkeys = new HotkeyManager();
    events = [];
    for (const name of ['down', 'up', 'cancel', 'doubleTap'] as const) hotkeys.on(name, (id) => events.push(`${name}:${id}`));
    hotkeys.setBindings(bindings);
    hotkeys.start();
  });
  afterEach(() => hotkeys.stop());

  function key(keycode: number, down: boolean, time: number) {
    const vk = vks.get(keycode);
    if (vk !== undefined) {
      if (down) windowsDown.add(vk);
      else windowsDown.delete(vk);
    }
    uIOhook.emit(down ? 'keydown' : 'keyup', { keycode, time });
  }
  function press(time: number) {
    key(K.Ctrl, true, time);
    key(K.Meta, true, time + 1);
  }
  function release(time: number) {
    key(K.Meta, false, time);
    key(K.Ctrl, false, time + 1);
  }

  it('keeps the opposite physical side held and ignores repeated keydowns', () => {
    press(0);
    key(K.CtrlRight, true, 5);
    key(K.CtrlRight, true, 6);
    key(K.Ctrl, false, 10);
    expect(hotkeys.isHeld('Ctrl')).toBe(true);
    expect(events).toEqual(['down:ptt#0']);
    key(K.CtrlRight, false, 15);
    key(K.Meta, false, 20);
    press(30);
    release(40);
    expect(events).toEqual(['down:ptt#0', 'up:ptt#0', 'down:ptt#0', 'up:ptt#0']);
  });

  it('drops a missed modifier up before accepting a fresh chord', () => {
    key(K.MetaRight, true, 10);
    windowsDown.delete(0x5c); // The hook never saw Win-up.
    key(K.Ctrl, true, 20);
    expect(hotkeys.isHeld('Win')).toBe(false);
    expect(events).toEqual([]);
  });

  it('cancels a stale PTT rather than promoting Space or delivering a normal release', () => {
    press(0);
    windowsDown.clear();
    key(K.Space, true, 1000);
    expect(events).toEqual(['down:ptt#0', 'cancel:ptt#0']);
  });

  it.each([K.D, K.ArrowLeft, K.ArrowRight, K.F4])('starts immediately but discards for a late Windows shortcut (%i)', (code) => {
    press(0);
    expect(events).toEqual(['down:ptt#0']);
    key(code, true, 2000);
    key(code, false, 2100);
    release(2200);
    expect(events).toEqual(['down:ptt#0', 'cancel:ptt#0']);
  });

  it('hands off to a longer binding using cancel, never a PTT stop/tap', () => {
    press(0);
    key(K.Space, true, 1000);
    key(K.Space, false, 1010);
    release(1020);
    expect(events).toEqual(['down:ptt#0', 'cancel:ptt#0', 'down:popo#0', 'up:popo#0']);
  });

  it.each(['reset', 'rebind', 'restart'])('%s cancels instead of releasing and requires fresh physical presses', (kind) => {
    press(0);
    release(10);
    press(20);
    if (kind === 'reset') hotkeys.reset();
    else if (kind === 'rebind') hotkeys.setBindings(bindings);
    else { hotkeys.stop(); hotkeys.start(); }
    expect(hotkeys.isHeld('Ctrl')).toBe(false);
    press(30); // repeats while physically held across the reset
    release(40);
    press(50);
    release(60);
    expect(events).toEqual(['down:ptt#0', 'up:ptt#0', 'down:ptt#0', 'cancel:ptt#0', 'down:ptt#0', 'up:ptt#0']);
  });

  it.each(['unbound key', 'partial chord', 'click', 'wheel', 'move'])('rejects a pair interrupted by %s', (kind) => {
    press(0);
    release(10);
    if (kind === 'unbound key' || kind === 'partial chord') {
      const code = kind === 'unbound key' ? 0 : K.Meta;
      key(code, true, 20);
      key(code, false, 21);
    } else if (kind === 'click') {
      uIOhook.emit('mousedown', { button: 1, time: 20 });
      uIOhook.emit('mouseup', { button: 1, time: 21 });
    } else uIOhook.emit(kind === 'wheel' ? 'wheel' : 'mousemove', { time: 20 });
    press(30);
    release(40);
    expect(events).toEqual(['down:ptt#0', 'up:ptt#0', 'down:ptt#0', 'up:ptt#0']);
  });

  it('promotes only on final physical release and ignores its own tagged menu masks', () => {
    press(0);
    key(0, true, 1); key(0, false, 1);
    release(10);
    press(30);
    key(0, true, 31); key(0, false, 31);
    key(K.Ctrl, false, 40);
    expect(events).toEqual(['down:ptt#0', 'up:ptt#0', 'down:ptt#0', 'up:ptt#0']);
    key(K.Meta, false, 45);
    expect(events.at(-1)).toBe('doubleTap:ptt#0');
  });
});
