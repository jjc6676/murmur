// Process-wide singletons for the main process. Initialized once in index.ts via initContext().
import { Db } from './db';
import { SettingsStore } from './settingsStore';
import { paths } from './paths';
import { WhisperServer } from './asr/whisper';
import { HotkeyManager } from './native/hotkeys';
import { complete, type LlmRequest } from './llm/cli';

export interface Ctx {
  db: Db;
  settings: SettingsStore;
  asr: WhisperServer;
  hotkeys: HotkeyManager;
  /** LLM call using the provider/model selected in settings. */
  llm(req: Omit<LlmRequest, 'timeoutMs'> & { timeoutMs?: number }): Promise<string>;
}

let ctx: Ctx | null = null;

export function initContext(): Ctx {
  if (ctx) return ctx;
  const settings = new SettingsStore(paths.settings);
  const db = new Db(paths.db);
  const asr = new WhisperServer({ binDir: paths.whisperBin, modelDirs: [paths.userModels, paths.bundledModels] });
  const hotkeys = new HotkeyManager();
  ctx = {
    db,
    settings,
    asr,
    hotkeys,
    llm: (req) => {
      const s = settings.get().llm;
      return complete(s, { ...req, timeoutMs: req.timeoutMs ?? s.timeoutSec * 1000 });
    },
  };
  return ctx;
}

export function getCtx(): Ctx {
  if (!ctx) throw new Error('context not initialized');
  return ctx;
}
