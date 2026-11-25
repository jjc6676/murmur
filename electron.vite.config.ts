import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias: { ...alias, '@renderer': resolve('src/renderer/src') } },
    build: {
      // never inline assets as data: URLs (CSP blocks data: scripts such as the audio worklet)
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          hub: resolve('src/renderer/index.html'),
          status: resolve('src/renderer/status.html'),
          scratchpad: resolve('src/renderer/scratchpad.html'),
          recorder: resolve('src/renderer/recorder.html'),
          capture: resolve('src/renderer/capture.html'),
          transformPicker: resolve('src/renderer/transform-picker.html'),
        },
      },
    },
  },
});
