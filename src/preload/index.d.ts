import type { PreloadBridge } from '../shared/ipc';

declare global {
  interface Window {
    murmur: PreloadBridge & { pathForFile(file: File): string };
  }
}

export {};
