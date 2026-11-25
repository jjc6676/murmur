// Canonical key ids for hotkey combos, shared by main (hook) and renderer (display/editing).
export type KeyId = string;

const ALIASES: Record<string, KeyId> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  ctrlright: 'Ctrl',
  alt: 'Alt',
  altright: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  shiftright: 'Shift',
  meta: 'Win',
  metaright: 'Win',
  win: 'Win',
  windows: 'Win',
  super: 'Win',
  capslock: 'CapsLock',
  caps: 'CapsLock',
  space: 'Space',
  escape: 'Esc',
  esc: 'Esc',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  backquote: '`',
  minus: '-',
  equal: '=',
  comma: ',',
  period: '.',
  slash: '/',
  semicolon: ';',
  quote: "'",
  bracketleft: '[',
  bracketright: ']',
  backslash: '\\',
};

/** Map a uiohook key name or user-typed token to a canonical id; null if unknown. */
export function normalizeKeyId(name: string): KeyId | null {
  const t = name.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  if (/^[a-z]$/i.test(t)) return t.toUpperCase();
  if (/^(num)?[0-9]$/i.test(t)) return t.slice(-1);
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(t)) return t.toUpperCase();
  if (['pageup', 'pagedown', 'home', 'end', 'insert', 'delete', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(lower))
    return t[0].toUpperCase() + t.slice(1);
  return null;
}

const MODIFIER_ORDER = ['Ctrl', 'Win', 'Alt', 'Shift'];

/** Parse "Ctrl+Win+Space" into canonical, ordered key ids (modifiers first). */
export function comboKeyIds(combo: string): KeyId[] {
  const ids = combo
    .split('+')
    .map((p) => normalizeKeyId(p))
    .filter((k): k is KeyId => k !== null);
  const unique = [...new Set(ids)];
  return unique.sort((a, b) => {
    const ia = MODIFIER_ORDER.indexOf(a);
    const ib = MODIFIER_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export function normalizeCombo(combo: string): string {
  return comboKeyIds(combo).join('+');
}

export function comboLabelParts(combo: string): string[] {
  return comboKeyIds(combo).map((k) => (k === 'CapsLock' ? 'Caps Lock' : k));
}

const MODIFIERS = ['Ctrl', 'Win', 'Alt', 'Shift'];
const STANDALONE_OK = /^(CapsLock|F([1-9]|1[0-9]|2[0-4])|Esc)$/;

/**
 * Validate a combo for an action. Returns an error message or null.
 * Rules (mirroring Flow): max 3 keys, keyboard chords need a modifier (except Caps Lock / F-keys / Esc),
 * and a combo may not be bound to two different actions.
 */
export function validateCombo(combo: string, action: string, all: Record<string, string[]>): string | null {
  const keys = comboKeyIds(combo);
  if (!keys.length) return 'Press a key combination';
  if (keys.length > 3) return 'Shortcuts can use at most 3 keys';
  const hasModifier = keys.some((k) => MODIFIERS.includes(k));
  if (!hasModifier && !(keys.length === 1 && STANDALONE_OK.test(keys[0]))) return 'Add a modifier key like Ctrl, Alt or Win';
  if (keys.length === 1 && keys[0] === 'Win') return 'Win alone is reserved by Windows';
  const norm = keys.join('+');
  for (const [other, combos] of Object.entries(all)) {
    if (other === action) continue;
    if (combos.some((c) => normalizeCombo(c) === norm)) return `Already used by another shortcut`;
  }
  return null;
}

/** True when the hands-free chord is contained inside a push-to-talk chord (starting one can trigger the other). */
export function pttPopoConflict(ptt: string[], popo: string[]): boolean {
  return ptt.some((p) =>
    popo.some((h) => {
      const pk = comboKeyIds(p);
      const hk = comboKeyIds(h);
      return hk.length < pk.length && hk.every((k) => pk.includes(k));
    }),
  );
}
