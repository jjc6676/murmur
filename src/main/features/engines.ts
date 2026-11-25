// Speech (whisper models) and AI provider (Claude/Codex CLI) status, tests and model downloads.
import { ipcMain } from 'electron';
import { createWriteStream, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AsrModelInfo } from '@shared/types';
import { getCtx } from '../context';
import { broadcast, handle } from '../ipc';
import { paths } from '../paths';
import { listModels } from '../asr/whisper';
import { complete, probe } from '../llm/cli';

export const ASR_MODELS: Omit<AsrModelInfo, 'installed'>[] = [
  { id: 'tiny.en', label: 'Tiny (English) — fastest', sizeMb: 75, multilingual: false },
  { id: 'base.en', label: 'Base (English) — default', sizeMb: 142, multilingual: false },
  { id: 'small.en', label: 'Small (English) — more accurate', sizeMb: 466, multilingual: false },
  { id: 'base', label: 'Base (99 languages)', sizeMb: 142, multilingual: true },
  { id: 'small', label: 'Small (99 languages)', sizeMb: 466, multilingual: true },
  { id: 'large-v3-turbo-q5_0', label: 'Large v3 Turbo (99 languages, quantized) — best accuracy', sizeMb: 547, multilingual: true },
];

let asrError: string | null = null;
// Audio input devices reported by the capture window (enumerateDevices only works in a renderer).
let audioDevices: { deviceId: string; label: string }[] = [];
ipcMain.on('capture:devices', (_e, list: { deviceId: string; label: string }[]) => {
  audioDevices = list;
});

/** Start whisper with the configured model; reports status to renderers. */
export async function startAsr(): Promise<void> {
  const { asr, settings } = getCtx();
  const s = settings.get().asr;
  try {
    await asr.start(s.model, s.threads);
    asrError = null;
  } catch (e) {
    asrError = e instanceof Error ? e.message : String(e);
  }
  broadcast('asr:status', { ready: asrError === null, model: s.model, error: asrError });
}

export function registerEngines(): void {
  const { asr, settings } = getCtx();
  const downloading = new Set<string>();
  settings.onChange((n, p) => {
    if (n.asr.model !== p.asr.model || n.asr.threads !== p.asr.threads) void startAsr();
  });
  handle('engines', {
    async llmStatus(provider) {
      const p = provider ?? settings.get().llm.provider;
      const r = await probe(p);
      return { provider: p, ...r };
    },
    async testLlm(provider) {
      const t0 = Date.now();
      const s = settings.get().llm;
      try {
        const output = await complete({ ...s, provider }, { system: 'Reply with exactly the word: ready', input: 'ping', timeoutMs: s.timeoutSec * 1000 });
        return { ok: /ready/i.test(output), output, ms: Date.now() - t0 };
      } catch (e) {
        return { ok: false, output: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
      }
    },
    asrModels() {
      const installed = new Set(listModels(asr.paths.modelDirs));
      return ASR_MODELS.map((m) => ({ ...m, installed: installed.has(m.id) }));
    },
    downloadAsrModel(id) {
      const m = ASR_MODELS.find((x) => x.id === id);
      if (!m || downloading.has(id)) return;
      downloading.add(id);
      const dest = join(paths.userModels, `ggml-${id}.bin`);
      const tmp = `${dest}.part`;
      void (async () => {
        try {
          const res = await fetch(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`, { redirect: 'follow' });
          if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
          const total = Number(res.headers.get('content-length') ?? 0);
          let received = 0;
          let lastEmit = 0;
          const body = Readable.fromWeb(res.body);
          body.on('data', (c: Buffer) => {
            received += c.length;
            if (Date.now() - lastEmit > 250) {
              lastEmit = Date.now();
              broadcast('asr:download', { id, received, total, done: false, error: null });
            }
          });
          await pipeline(body, createWriteStream(tmp));
          if (total && statSync(tmp).size !== total) throw new Error('Download incomplete');
          renameSync(tmp, dest);
          broadcast('asr:download', { id, received, total, done: true, error: null });
        } catch (e) {
          if (existsSync(tmp)) rmSync(tmp, { force: true });
          broadcast('asr:download', { id, received: 0, total: 0, done: true, error: e instanceof Error ? e.message : String(e) });
        } finally {
          downloading.delete(id);
        }
      })();
    },
    asrStatus: () => ({ ready: asrError === null && asr.modelName !== '', model: settings.get().asr.model, error: asrError }),
    listAudioDevices: () => audioDevices,
  });
}
