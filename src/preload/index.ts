// Minimal, generic bridge: typed API is built in the renderer on top of invoke/on/send.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PreloadBridge } from '../shared/ipc';

const kindArg = process.argv.find((a) => a.startsWith('--murmur-window='));

const bridge: PreloadBridge & { pathForFile(file: File): string } = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  windowKind: kindArg ? kindArg.split('=')[1] : 'hub',
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('murmur', bridge);
