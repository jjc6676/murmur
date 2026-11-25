// Main-side IPC registration and event broadcast.
import { BrowserWindow, ipcMain } from 'electron';
import type { MurmurEvents } from '@shared/events';
import { channelOf, eventChannel, type ApiImpl, type ApiNamespace } from '@shared/ipc';

let caller: Electron.WebContents | null = null;

/** The webContents that issued the IPC call currently executing (valid synchronously at method start). */
export function callerWindow(): BrowserWindow | null {
  return caller ? BrowserWindow.fromWebContents(caller) : null;
}

/** Register every method of `impl` as `${ns}:${method}`. Errors propagate to the renderer as rejections. */
export function handle<N extends ApiNamespace>(ns: N, impl: ApiImpl<N>): void {
  for (const [method, fn] of Object.entries(impl as Record<string, (...a: unknown[]) => unknown>)) {
    const ch = channelOf(ns, method);
    ipcMain.removeHandler(ch);
    ipcMain.handle(ch, async (e, ...args) => {
      caller = e.sender;
      try {
        return fn.apply(impl, args);
      } finally {
        caller = null;
      }
    });
  }
}

const listeners = new Map<string, Set<(payload: unknown) => void>>();

/** Send an event to every renderer window and in-process listeners. */
export function broadcast<E extends keyof MurmurEvents>(event: E, payload: MurmurEvents[E]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(eventChannel(event), payload);
  }
  for (const cb of listeners.get(event) ?? []) cb(payload);
}

/** Subscribe within the main process to events emitted via broadcast(). */
export function onEvent<E extends keyof MurmurEvents>(event: E, cb: (payload: MurmurEvents[E]) => void): () => void {
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  set.add(cb as (p: unknown) => void);
  return () => set.delete(cb as (p: unknown) => void);
}
