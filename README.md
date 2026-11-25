# Murmur

Offline Windows voice dictation and meeting notes, modeled on Wispr Flow's desktop app.
Speech recognition runs locally with whisper.cpp; AI cleanup, styles, transforms and meeting summaries go through
your own `claude -p` (Claude Code) or `codex exec` (Codex CLI) subscription. All data stays in a local SQLite database.

## Run

```sh
npm install
npm run fetch-whisper   # whisper.cpp server + base.en model into resources/whisper/
npm run dev
```

Hold **Ctrl+Win** in any app to dictate (release to paste). Double-tap for hands-free. Settings → AI & Speech selects the
LLM provider (Claude / Codex / none) and the whisper model.

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc` for main/preload and renderer projects |
| `npm run lint` | ESLint (incl. React hooks purity rules) |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run e2e` | Builds, then runs the Playwright Electron suite (`e2e/`) |
| `npm run build` | Per-user NSIS installer in `dist/` (`Murmur-Setup-<version>.exe`) |
| `python scripts/parity.py` | Side-by-side Flow vs Murmur screenshots in `docs/parity/` |
| `python scripts/check-inventory.py` | Validates `docs/flow-inventory.md` statuses and code citations |

### E2E notes

- `e2e/dictation.spec.ts` uses the real keyboard and Notepad: it holds Ctrl+Win while a WAV (`tests/fixtures/dictation-ptt.wav`)
  is fed as the microphone. Close any other running Murmur first (it would answer the same hotkey) and don't type during the run.
- Other specs run against a temp profile (`MURMUR_USER_DATA`) with the global hook disabled and a fake LLM (`MURMUR_FAKE_LLM=1`).
- `e2e/packaged.spec.ts` smoke-tests an installed build when `MURMUR_EXE` points at `Murmur.exe`.

## Layout

- `src/main` — Electron main: dictation pipeline (`features/dictation.ts`, `formatting.ts`), hotkeys and Win32/UIA/Core Audio
  bindings (`native/`), whisper server (`asr/`), Notetaker recorder and meetings (`features/recorder.ts`, `meetings/`), SQLite (`db.ts`).
- `src/renderer` — React windows: hub, Flow Bar (`status`), capture (audio), recorder (Notepad), scratchpad, toasts.
- `src/shared` — IPC contracts, settings schema, deterministic text pipeline.
- `scripts/murmur-mcp.mjs` — local stdio MCP server exposing meetings to Claude/Codex/Cursor.
- `docs/flow-inventory.md` — every Flow feature found by reverse engineering, mapped to Murmur code or marked UI-only / not applicable.
