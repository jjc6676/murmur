# Changelog

## 0.4.0

- Transform library: 100 ready-made transforms in 10 collections (Writing & Editing, Tone & Voice, Structure & Formatting, Summarize & Extract, Email, Messaging & Updates, Developer, AI Prompting, Social & Marketing, Language & Translation). Browse, search, preview and add them on the Transforms page; added ones are grouped by collection in My Transforms.
- Transform picker: select text anywhere, press Win+Alt+T (or Flow Bar right-click → Apply transform…), type to filter, Enter to replace the selection.

## 0.3.0

- Fix: "write EPIPE" crash after dictating. Paste verification timed out on a still-starting text-reading helper, killed it, then wrote to the dead process. Slow replies no longer kill the helper, a dead helper can never crash the app, and it starts with Murmur.
- Settings → AI & Speech: model dropdowns. Claude: Haiku / Sonnet / Opus or Custom…; Codex: Default (shows the model from your Codex config) or Custom….

## 0.2.0

- Portable build: `Murmur-<version>-portable.exe` runs without installing and keeps its data in a `Murmur Data` folder next to the exe.
- Onboarding can be closed with "Finish later" and resumed from the sidebar "Finish setup" card; dictation works meanwhile.
- Removed paid surfaces (upgrade, referral, plans and billing, trial pitches) — Murmur is free and open source.
- Flow Bar follows the display you're working on, stays hoverable/clickable while dictating (cursor hit-testing instead of Electron mouse forwarding), and offers Start Notetaker on hover.
- Codex CLI detection: npm shims are resolved to the Codex script instead of the optional bundled `node.exe`.
- Notetaker: post-meeting refinement keeps You/Them attribution; mic echo of speaker audio is suppressed.
- Dictation: textbox contents are never used as the whisper prompt (whisper could echo them into the transcript); mic Auto-detect honors your microphone ranking.

## 0.1.0

- First release: push-to-talk dictation with local whisper.cpp, Home/History/Insights, Dictionary, Snippets, Style, Transforms, Scratchpad, Notetaker (mic + system audio, summaries via Claude/Codex CLI), Tasks, Skills, Memory, Settings, onboarding, Flow Bar, and the per-user installer.
