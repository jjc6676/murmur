// IPC plumbing shared by main, preload and renderer.
// Every API namespace is an object of async methods; channel name = `${namespace}:${method}`.
// Events flow main -> renderers on channel `evt:${name}`.
import type { MurmurApi } from './api';
import type { MurmurEvents } from './events';

export type ApiNamespace = keyof MurmurApi;

export type AsyncifyMethods<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

export type ClientApi = { [N in keyof MurmurApi]: AsyncifyMethods<MurmurApi[N]> };

/** Implementation side: methods may be sync or async. */
export type ApiImpl<N extends ApiNamespace> = {
  [K in keyof MurmurApi[N]]: MurmurApi[N][K] extends (...args: infer A) => infer R ? (...args: A) => R | Promise<Awaited<R>> : never;
};

export type EventName = keyof MurmurEvents;

export interface PreloadBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, cb: (payload: unknown) => void): () => void;
  send(channel: string, ...args: unknown[]): void;
  /** Window identity, e.g. 'hub' | 'status' | 'scratchpad' | 'recorder' | 'capture'. */
  windowKind: string;
}

export const channelOf = (ns: string, method: string): string => `${ns}:${method}`;
export const eventChannel = (name: string): string => `evt:${name}`;
