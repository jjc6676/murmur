// Minimal, generic bridge: typed API is built in the renderer on top of invoke/on/send.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PreloadBridge } from '../shared/ipc';

const kindArg = process.argv.find((a) => a.startsWith('--murmur-window='));
const windowKind = kindArg?.slice('--murmur-window='.length);

const bridge: PreloadBridge & { pathForFile(file: File): string } = {
  invoke: (channel, ...args) => {
    if (channel === 'dictation:start' && windowKind !== 'hub' && windowKind !== 'status') {
      return Promise.reject(new Error('Unauthorized dictation request'));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  windowKind: windowKind ?? 'hub',
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('murmur', bridge);
