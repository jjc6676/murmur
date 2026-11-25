// LLM access through the user's subscription CLIs: `claude -p` (Claude Code) or `codex exec` (Codex CLI).
// Windows npm shims (*.cmd) are resolved to their real target so we can spawn without a shell.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import type { LlmProvider } from '@shared/types';

export interface ResolvedCommand {
  command: string;
  prefixArgs: string[];
  env?: Record<string, string>;
}

function findOnPath(names: string[]): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const n of names) {
      const p = join(dir, n);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

/** Resolve `claude`/`codex` to an executable + leading args, unwrapping npm .cmd shims. */
export function resolveCli(name: string): ResolvedCommand | null {
  const exe = findOnPath([`${name}.exe`]);
  if (exe) return { command: exe, prefixArgs: [] };
  const shim = findOnPath([`${name}.cmd`]);
  if (!shim) return null;
  const text = readFileSync(shim, 'utf8');
  // npm shims mention "%dp0%\node.exe" (the optional bundled node) before the real target script.
  const target = [...text.matchAll(/"%dp0%\\([^"]+?\.(exe|js|cjs|mjs))"/gi)].find((m) => !/^node\.exe$/i.test(m[1]));
  if (!target) return null;
  const full = join(dirname(shim), target[1]);
  if (target[2].toLowerCase() === 'exe') return { command: full, prefixArgs: [] };
  const node = findOnPath(['node.exe']);
  if (node) return { command: node, prefixArgs: [full] };
  return { command: process.execPath, prefixArgs: [full], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

export interface LlmRequest {
  system: string;
  input: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface LlmConfig {
  provider: LlmProvider;
  claudeModel: string;
  codexModel: string;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'auth' | 'timeout' | 'cancelled' | 'empty' | 'failed',
  ) {
    super(message);
  }
}

function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    killer.unref();
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The CLI may have exited between the cancellation request and termination.
  }
}

function runProcess(cmd: ResolvedCommand, args: string[], stdin: string, timeoutMs: number, signal?: AbortSignal, cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ code: number; stdout: string; stderr: string }>();
  const child = spawn(cmd.command, [...cmd.prefixArgs, ...args], {
    cwd: cwd ?? tmpdir(),
    env: { ...process.env, ...cmd.env, NO_COLOR: '1' },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
  child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
  const timer = setTimeout(() => {
    terminateProcessTree(child.pid);
    reject(new LlmError(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s`, 'timeout'));
  }, timeoutMs);
  const onAbort = () => {
    terminateProcessTree(child.pid);
    reject(new LlmError('LLM request cancelled', 'cancelled'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  child.once('error', (e) => {
    clearTimeout(timer);
    reject(new LlmError(e.message, 'unavailable'));
  });
  child.once('close', (code) => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    resolve({ code: code ?? -1, stdout, stderr });
  });
  child.stdin.end(stdin, 'utf8');
  return promise;
}

const AUTH_HINT = /(log ?in|logged out|authenticat|unauthori[sz]ed|api key|credentials|\b401\b)/i;

function composePrompt(req: LlmRequest): string {
  return `${req.system.trim()}\n\n<input>\n${req.input}\n</input>`;
}

/** Run one completion. Returns trimmed text output; throws LlmError. */
export async function complete(cfg: LlmConfig, req: LlmRequest): Promise<string> {
  if (process.env.MURMUR_FAKE_LLM === '1') return fakeComplete(req);
  if (cfg.provider === 'none') throw new LlmError('No AI provider selected', 'unavailable');
  const cmd = resolveCli(cfg.provider);
  if (!cmd) throw new LlmError(`${cfg.provider} CLI not found on PATH`, 'unavailable');
  const prompt = composePrompt(req);

  if (cfg.provider === 'claude') {
    const args = ['-p', '--output-format', 'text', '--no-session-persistence', '--strict-mcp-config', '--tools', ''];
    if (cfg.claudeModel) args.push('--model', cfg.claudeModel);
    const r = await runProcess(cmd, args, prompt, req.timeoutMs, req.signal);
    const out = r.stdout.trim();
    if (r.code !== 0 || !out) {
      const msg = (r.stderr || r.stdout).trim().slice(0, 500);
      if (AUTH_HINT.test(msg)) throw new LlmError(`Claude CLI is not signed in: ${msg}`, 'auth');
      if (!out && r.code === 0) throw new LlmError('Claude returned no text', 'empty');
      throw new LlmError(`Claude CLI failed (${r.code}): ${msg}`, 'failed');
    }
    return out;
  }

  // codex exec: final message written to a file; stdout carries progress logs.
  const dir = mkdtempSync(join(tmpdir(), 'murmur-codex-'));
  const outFile = join(dir, 'last.txt');
  try {
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '--color', 'never', '-c', 'model_reasoning_effort=low', '-o', outFile];
    if (cfg.codexModel) args.push('-m', cfg.codexModel);
    args.push('-');
    const r = await runProcess(cmd, args, prompt, req.timeoutMs, req.signal, dir);
    const out = existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() : '';
    if (!out) {
      const msg = (r.stderr || r.stdout).trim().slice(-500);
      if (AUTH_HINT.test(msg)) throw new LlmError(`Codex CLI is not signed in: ${msg}`, 'auth');
      throw new LlmError(r.code === 0 ? 'Codex returned no text' : `Codex CLI failed (${r.code}): ${msg}`, r.code === 0 ? 'empty' : 'failed');
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Codex's configured default model (`model = "..."` in $CODEX_HOME/config.toml, default ~/.codex). */
function codexDefaultModel(): string | null {
  const file = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');
  try {
    // Top-level key only: stop at the first [table] header.
    const top = readFileSync(file, 'utf8').split(/^\s*\[/m)[0];
    return /^\s*model\s*=\s*"([^"]+)"/m.exec(top)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Probe a provider: resolves the binary, reads its version and (Codex) its default model. */
export async function probe(provider: LlmProvider): Promise<{ available: boolean; version: string | null; error: string | null; defaultModel: string | null }> {
  if (provider === 'none') return { available: false, version: null, error: 'No provider selected', defaultModel: null };
  const defaultModel = provider === 'codex' ? codexDefaultModel() : null;
  const cmd = resolveCli(provider);
  if (!cmd) return { available: false, version: null, error: `${provider} CLI not found on PATH`, defaultModel };
  try {
    const r = await runProcess(cmd, ['--version'], '', 15_000);
    return { available: r.code === 0, version: r.stdout.trim().split('\n')[0] || null, error: r.code === 0 ? null : r.stderr.trim().slice(0, 300), defaultModel };
  } catch (e) {
    return { available: false, version: null, error: e instanceof Error ? e.message : String(e), defaultModel };
  }
}

/**
 * Deterministic stand-in used only when MURMUR_FAKE_LLM=1 (automated tests): returns the input
 * prefixed so tests can assert the LLM path ran without spending subscription quota.
 */
function fakeComplete(req: LlmRequest): string {
  if (/json/i.test(req.system) && /summary/i.test(req.system)) {
    return JSON.stringify({
      title: 'Test meeting',
      overview: req.input.slice(0, 120),
      sections: [{ heading: 'Discussion', bullets: [req.input.slice(0, 80)] }],
      actionItems: [{ text: 'Follow up', owner: null }],
    });
  }
  return `[ai] ${req.input.trim()}`;
}
