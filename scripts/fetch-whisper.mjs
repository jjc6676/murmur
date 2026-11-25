// Downloads the whisper.cpp Windows CPU binaries and the default model into resources/whisper.
// Idempotent: skips files that already exist with the expected size.
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'resources', 'whisper');
const binDir = join(out, 'bin');
const modelDir = join(out, 'models');

const BIN_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-bin-x64.zip';
const MODEL = { name: 'ggml-base.en.bin', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin', size: 147964211 };
const KEEP = /^(whisper-server\.exe|whisper-cli\.exe|whisper\.dll|ggml.*\.dll)$/i;

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`GET ${url} -> ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

mkdirSync(binDir, { recursive: true });
mkdirSync(modelDir, { recursive: true });

if (!existsSync(join(binDir, 'whisper-server.exe'))) {
  const zip = join(tmpdir(), `murmur-whisper-${Date.now()}.zip`);
  const tmp = join(tmpdir(), `murmur-whisper-${Date.now()}`);
  console.log('downloading whisper.cpp binaries');
  await download(BIN_URL, zip);
  execFileSync('tar', ['-xf', zip, '-C', (mkdirSync(tmp, { recursive: true }), tmp)]);
  const rel = join(tmp, 'Release');
  for (const f of readdirSync(rel)) if (KEEP.test(f)) copyFileSync(join(rel, f), join(binDir, f));
  rmSync(tmp, { recursive: true, force: true });
  rmSync(zip, { force: true });
}

const modelPath = join(modelDir, MODEL.name);
if (!existsSync(modelPath) || statSync(modelPath).size !== MODEL.size) {
  console.log(`downloading ${MODEL.name}`);
  await download(MODEL.url, modelPath);
}
console.log('whisper ready:', out);
