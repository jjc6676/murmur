// Thin Win32 bindings via koffi: foreground app detection and synthetic key input.
import koffi from 'koffi';
import { basename } from 'node:path';

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const advapi32 = koffi.load('advapi32.dll');

const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()');
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void* hWnd, _Out_ uint16_t* lpString, int nMaxCount)');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* lpdwProcessId)');
const OpenProcess = kernel32.func('void* __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)');
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* hObject)');
const QueryFullProcessImageNameW = kernel32.func(
  'bool __stdcall QueryFullProcessImageNameW(void* hProcess, uint32_t dwFlags, _Out_ uint16_t* lpExeName, _Inout_ uint32_t* lpdwSize)',
);
const OpenProcessToken = advapi32.func('bool __stdcall OpenProcessToken(void* ProcessHandle, uint32_t DesiredAccess, _Out_ void** TokenHandle)');
const TOKEN_ELEVATION = koffi.struct('TOKEN_ELEVATION', { TokenIsElevated: 'uint32_t' });
const GetTokenInformation = advapi32.func(
  'bool __stdcall GetTokenInformation(void* TokenHandle, uint32_t TokenInformationClass, _Out_ TOKEN_ELEVATION* TokenInformation, uint32_t TokenInformationLength, _Out_ uint32_t* ReturnLength)',
);

const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16_t',
  wScan: 'uint16_t',
  dwFlags: 'uint32_t',
  time: 'uint32_t',
  dwExtraInfo: 'uintptr_t',
});
const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'long',
  dy: 'long',
  mouseData: 'uint32_t',
  dwFlags: 'uint32_t',
  time: 'uint32_t',
  dwExtraInfo: 'uintptr_t',
});
const INPUT = koffi.struct('INPUT', {
  type: 'uint32_t',
  u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT }),
});
const SendInput = user32.func('uint32_t __stdcall SendInput(uint32_t cInputs, INPUT* pInputs, int cbSize)');
const GetAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int vKey)');

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

export const VK = {
  BACK: 0x08,
  TAB: 0x09,
  RETURN: 0x0d,
  SHIFT: 0x10,
  CONTROL: 0x11,
  MENU: 0x12,
  ESCAPE: 0x1b,
  SPACE: 0x20,
  LEFT: 0x25,
  RIGHT: 0x27,
  LWIN: 0x5b,
  A: 0x41,
  C: 0x43,
  V: 0x56,
  Z: 0x5a,
  CAPITAL: 0x14,
} as const;

export interface ForegroundApp {
  hwnd: bigint | number | null;
  exe: string; // e.g. "notepad.exe"
  processName: string; // e.g. "notepad"
  title: string;
}

export function getForegroundApp(): ForegroundApp {
  const hwnd = GetForegroundWindow();
  if (!hwnd) return { hwnd: null, exe: '', processName: '', title: '' };
  const titleBuf = new Uint16Array(512);
  const n = GetWindowTextW(hwnd, titleBuf, titleBuf.length);
  const title = String.fromCharCode(...titleBuf.subarray(0, n));
  const pid = [0];
  GetWindowThreadProcessId(hwnd, pid);
  let exe = '';
  const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
  if (h) {
    const buf = new Uint16Array(1024);
    const size = [buf.length];
    if (QueryFullProcessImageNameW(h, 0, buf, size)) exe = basename(String.fromCharCode(...buf.subarray(0, size[0])));
    CloseHandle(h);
  }
  return { hwnd: koffi.address(hwnd), exe: exe.toLowerCase(), processName: exe.replace(/\.exe$/i, '').toLowerCase(), title };
}

/** Whether the target window belongs to an elevated process. Non-queryable processes are treated as non-elevated. */
export function isWindowElevated(hwnd: bigint | number | null): boolean {
  if (hwnd === null) return false;
  const pid = [0];
  GetWindowThreadProcessId(hwnd, pid);
  const process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
  if (!process) return false;
  try {
    const token = [null] as unknown as [unknown];
    if (!OpenProcessToken(process, 0x0008 /* TOKEN_QUERY */, token)) return false;
    try {
      const elevation = { TokenIsElevated: 0 };
      const size = [0];
      return !!GetTokenInformation(token[0], 20 /* TokenElevation */, elevation, koffi.sizeof(TOKEN_ELEVATION), size) && elevation.TokenIsElevated !== 0;
    } finally {
      if (token[0]) CloseHandle(token[0]);
    }
  } finally {
    CloseHandle(process);
  }
}

const SetForegroundWindowAddr = user32.func('bool __stdcall SetForegroundWindow(intptr_t hWnd)');
const ShowWindowAddr = user32.func('bool __stdcall ShowWindow(intptr_t hWnd, int nCmdShow)');
const IsIconicAddr = user32.func('bool __stdcall IsIconic(intptr_t hWnd)');
const IsWindowVisibleAddr = user32.func('bool __stdcall IsWindowVisible(intptr_t hWnd)');
const GetWindowTextAddr = user32.func('int __stdcall GetWindowTextW(intptr_t hWnd, _Out_ uint16_t* lpString, int nMaxCount)');
const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lParam)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc* cb, intptr_t lParam)');

/**
 * Bring a window to the foreground. Windows only lets the process that received the last input do this,
 * so a harmless unassigned key is injected first (same trick AutoHotkey uses).
 */
export function focusWindow(hwnd: bigint | number | null): void {
  if (hwnd === null) return;
  if (IsIconicAddr(hwnd)) ShowWindowAddr(hwnd, 9 /* SW_RESTORE */);
  send([key(0xe8, false), key(0xe8, true)]);
  SetForegroundWindowAddr(hwnd);
}

koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const GetWindowRectAddr = user32.func('bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ RECT* lpRect)');
const GetForegroundWindowAddr = user32.func('intptr_t __stdcall GetForegroundWindow()');

/** Physical-pixel bounds of the foreground window, or null when there is none / it is minimized. */
export function getForegroundWindowRect(): { x: number; y: number; width: number; height: number } | null {
  const hwnd = GetForegroundWindowAddr();
  if (!hwnd || IsIconicAddr(hwnd)) return null;
  const rect = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!GetWindowRectAddr(hwnd, rect)) return null;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  return width > 0 && height > 0 ? { x: rect.left, y: rect.top, width, height } : null;
}

/** Visible top-level windows whose title contains `needle` (case-insensitive). */
export function findWindows(needle: string): { hwnd: bigint | number; title: string }[] {
  const out: { hwnd: bigint | number; title: string }[] = [];
  const n = needle.toLowerCase();
  const cb = koffi.register((hwnd: bigint | number) => {
    if (IsWindowVisibleAddr(hwnd)) {
      const buf = new Uint16Array(512);
      const len = GetWindowTextAddr(hwnd, buf, buf.length);
      const title = String.fromCharCode(...buf.subarray(0, len));
      if (title.toLowerCase().includes(n)) out.push({ hwnd, title });
    }
    return true;
  }, koffi.pointer(EnumWindowsProc));
  try {
    EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return out;
}

function key(vk: number, up: boolean) {
  return { type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: 0, dwFlags: up ? KEYEVENTF_KEYUP : 0, time: 0, dwExtraInfo: 0 } } };
}

function send(inputs: object[]): number {
  return SendInput(inputs.length, inputs, koffi.sizeof(INPUT));
}

/** Press a chord such as Ctrl+V: modifiers down, key down/up, modifiers up (reverse order). */
export function sendChord(mods: number[], vk: number): void {
  send([...mods.map((m) => key(m, false)), key(vk, false), key(vk, true), ...[...mods].reverse().map((m) => key(m, true))]);
}

export function keyDown(vk: number): void {
  send([key(vk, false)]);
}

export function keyUp(vk: number): void {
  send([key(vk, true)]);
}

// left/right variants: Ctrl, Alt (menu), Shift, Win
const MODIFIER_VKS = [0xa2, 0xa3, 0xa4, 0xa5, 0xa0, 0xa1, 0x5b, 0x5c];

/** High bit only: the low bit records a past press, not the current physical state. */
export function isVirtualKeyDown(vk: number): boolean {
  return (GetAsyncKeyState(vk) & 0x8000) !== 0;
}

/** Tag both unassigned Win-menu mask events with the triggering hook event's Windows timestamp. */
export function maskStartMenu(time: number): boolean {
  const down = key(0xe8, false);
  const up = key(0xe8, true);
  down.u.ki.time = up.u.ki.time = time;
  return send([down, up]) === 2;
}

/** Release modifiers the user may still be physically holding (hotkey) so a synthetic paste isn't corrupted. */
export function releaseModifiers(): void {
  // Only release keys that are actually down: a stray Alt key-up puts many apps into menu (KeyTips) mode.
  const held = MODIFIER_VKS.filter((vk) => (GetAsyncKeyState(vk) & 0x8000) !== 0);
  if (held.length) send(held.map((vk) => key(vk, true)));
}

/** Type text directly as Unicode key events (fallback when clipboard paste is blocked). */
export function typeUnicode(text: string): void {
  const inputs: object[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const units = code > 0xffff ? [0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff)] : [code];
    for (const u of units) {
      inputs.push({ type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: u, dwFlags: KEYEVENTF_UNICODE, time: 0, dwExtraInfo: 0 } } });
      inputs.push({ type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: u, dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } });
    }
  }
  if (inputs.length) send(inputs);
}

export function minimizeWindow(hwnd: bigint | number): void {
  ShowWindowAddr(hwnd, 6 /* SW_MINIMIZE */);
}
