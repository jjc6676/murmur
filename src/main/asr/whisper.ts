// Local speech-to-text via a long-lived whisper.cpp server (model stays loaded between dictations).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export interface TranscribeOptions {
  language?: string; // 'auto' or ISO code
  prompt?: string; // vocabulary hint (dictionary words)
}

export interface TranscribeResult {
  text: string;
  language: string;
  segments: { start: number; end: number; text: string }[];
}

export interface WhisperPaths {
  binDir: string;
  modelDirs: string[]; // searched in order
}

async function freePort(): Promise<number> {
  const srv = createServer();
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    srv.close(() => resolve(port));
  });
  return promise;
}

/** Installed model ids (e.g. "base.en") across the given directories. */
export function listModels(modelDirs: string[]): string[] {
  const ids = new Set<string>();
  for (const dir of modelDirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (/^ggml-.+\.bin$/.test(f)) ids.add(f.replace(/^ggml-|\.bin$/g, ''));
  }
  return [...ids];
}

export class WhisperServer {
  private proc: ChildProcess | null = null;
  private port = 0;
  private ready: Promise<void> | null = null;
  private model = '';

  constructor(readonly paths: WhisperPaths) {}

  get modelName(): string {
    return this.model;
  }

  /** Start (or restart with a different model). Resolves once the HTTP endpoint answers. */
  start(model: string, threads = 4): Promise<void> {
    if (this.proc && this.model === model && this.ready) return this.ready;
    this.stop();
    this.model = model;
    this.ready = this.launch(model, threads);
    return this.ready;
  }

  private async launch(model: string, threads: number): Promise<void> {
    const exe = join(this.paths.binDir, 'whisper-server.exe');
    const modelPath = this.paths.modelDirs.map((d) => join(d, `ggml-${model}.bin`)).find((p) => existsSync(p));
    if (!existsSync(exe)) throw new Error(`whisper-server not found at ${exe}`);
    if (!modelPath) throw new Error(`speech model "${model}" is not installed`);
    this.port = await freePort();
    const proc = spawn(exe, ['-m', modelPath, '--host', '127.0.0.1', '--port', String(this.port), '-t', String(threads), '-nt'], {
      cwd: this.paths.binDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;
    let log = '';
    proc.stderr?.on('data', (d) => (log = (log + d).slice(-4000)));
    proc.stdout?.on('data', (d) => (log = (log + d).slice(-4000)));
    proc.once('exit', () => {
      if (this.proc === proc) {
        this.proc = null;
        this.ready = null;
      }
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (!this.proc) throw new Error(`whisper-server exited during startup:\n${log}`);
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/`, { signal: AbortSignal.timeout(1000) });
        if (res.ok || res.status === 404) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`whisper-server did not start in time:\n${log}`);
  }

  async transcribe(wav: Buffer, opts: TranscribeOptions = {}): Promise<TranscribeResult> {
    if (!this.ready) throw new Error('ASR not started');
    await this.ready;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0.0');
    const multilingual = !this.model.endsWith('.en');
    form.append('language', multilingual ? (opts.language ?? 'auto') : 'en');
    if (opts.prompt) form.append('prompt', opts.prompt);
    const res = await fetch(`http://127.0.0.1:${this.port}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`whisper inference failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { text?: string; language?: string; segments?: { start: number; end: number; text: string }[] };
    return {
      text: cleanWhisperText(body.text ?? ''),
      language: body.language ?? (multilingual ? 'auto' : 'en'),
      segments: (body.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: cleanWhisperText(s.text) })),
    };
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }
}

/** Strip whisper artefacts: bracketed non-speech tags, leading/trailing whitespace, doubled spaces. */
export function cleanWhisperText(t: string): string {
  return t
    .replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SILENCE|INAUDIBLE|Music|Applause|Laughter)[^\]]*\]/gi, '')
    .replace(/\((music|silence|noise|inaudible|applause|laughter)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
