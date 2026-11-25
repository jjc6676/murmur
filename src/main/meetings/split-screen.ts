import { screen, type BrowserWindow } from 'electron';
import koffi from 'koffi';
import { findWindows } from '../native/win32';

const SWP_NOZORDER = 0x0004;
const SWP_SHOWWINDOW = 0x0040;

function nativeHandle(window: BrowserWindow): bigint {
  const value = window.getNativeWindowHandle();
  return process.arch === 'x64' ? value.readBigUInt64LE(0) : BigInt(value.readUInt32LE(0));
}

export function splitRecorderWithMeeting(recorder: BrowserWindow): boolean {
  if (process.platform !== 'win32') return false;
  const call = ['Google Meet', 'Zoom Meeting', 'Microsoft Teams', 'Webex', 'Slack Huddle']
    .flatMap((title) => findWindows(title))
    .find((candidate) => candidate.hwnd !== nativeHandle(recorder));
  if (!call) return false;

  const user32 = koffi.load('user32.dll');
  const setWindowPos = user32.func('bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)');
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const leftWidth = Math.floor(area.width * 0.6);
  setWindowPos(call.hwnd, 0, area.x, area.y, leftWidth, area.height, SWP_NOZORDER | SWP_SHOWWINDOW);
  setWindowPos(nativeHandle(recorder), 0, area.x + leftWidth, area.y, area.width - leftWidth, area.height, SWP_NOZORDER | SWP_SHOWWINDOW);
  recorder.show();
  recorder.focus();
  return true;
}
