// Typed renderer client over the preload bridge: api.<namespace>.<method>(...) -> ipc invoke.
import { useEffect, useEffectEvent } from 'react';
import type { MurmurEvents } from '@shared/events';
import { channelOf, eventChannel, type ClientApi } from '@shared/ipc';

const bridge = window.murmur;

export const api: ClientApi = new Proxy({} as ClientApi, {
  get(_t, ns: string) {
    return new Proxy(
      {},
      {
        get(_t2, method: string) {
          return (...args: unknown[]) => bridge.invoke(channelOf(ns, method), ...args);
        },
      },
    );
  },
});

export const windowKind = bridge.windowKind;

export function onEvent<E extends keyof MurmurEvents>(event: E, cb: (payload: MurmurEvents[E]) => void): () => void {
  return bridge.on(eventChannel(event), (p) => cb(p as MurmurEvents[E]));
}

/** Subscribe to a main-process event for the lifetime of the component. */
export function useEvent<E extends keyof MurmurEvents>(event: E, cb: (payload: MurmurEvents[E]) => void): void {
  const handler = useEffectEvent(cb);
  useEffect(() => onEvent(event, (p) => handler(p)), [event]);
}

export function sendRaw(channel: string, ...args: unknown[]): void {
  bridge.send(channel, ...args);
}

export function pathForFile(file: File): string {
  return bridge.pathForFile(file);
}

/** Electron wraps thrown errors as "Error invoking remote method 'x': Error: msg" — keep only msg. */
export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
