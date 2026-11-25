// Thin Win32 bindings via koffi: foreground app detection and synthetic key input.
import koffi from 'koffi';
import { basename } from 'node:path';

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()');
const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(void* hWnd)');
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void* hWnd, _Out_ uint16_t* lpString, int nMaxCount)');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* lpdwProcessId)');
const OpenProcess = kernel32.func('void* __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)');
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* hObject)');
const QueryFullProcessImageNameW = kernel32.func(
  'bool __stdcall QueryFullProcessImageNameW(void* hProcess, uint32_t dwFlags, _Out_ uint16_t* lpExeName, _Inout_ uint32_t* lpdwSize)',
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

export function focusWindow(hwnd: bigint | number | null): void {
  if (hwnd === null) return;
  SetForegroundWindow(koffi.as(hwnd, 'void*'));
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

/** Release modifiers the user may still be physically holding (hotkey) so a synthetic paste isn't corrupted. */
export function releaseModifiers(): void {
  send([VK.CONTROL, VK.MENU, VK.SHIFT, VK.LWIN].map((m) => key(m, true)));
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
