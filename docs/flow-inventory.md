# Flow feature inventory

This document maps every feature in the four reverse-engineered Wispr Flow inventories to the current Murmur implementation. Murmur is an offline Windows application, so a matching user outcome may use a local mechanism rather than Flow’s hosted service.

## Method

The Flow side was derived from the unpacked `app.asar` English i18n strings, database migrations, captured configuration, and live CDP screenshots/DOM inspection. The Murmur side was audited against `src/**` and `scripts/**`; a feature is not counted as implemented merely because matching copy, a setting, or a schema field exists. Notification catalog entries count only when a matching `showToast`/`showNudge` key or equivalent copy is wired.

Status legend:

- **Implemented** — the cited Murmur code performs the behavior locally.
- **Offline equivalent** — Murmur provides the same user outcome with local Whisper, local files, deterministic processing, local MCP, or the configured Claude/Codex CLI; the row states the substitution.
- **UI-only (cloud)** — the desktop surface explains that a hosted or third-party account feature is unavailable offline. Per product decision, this is complete for Murmur.
- **UI-only (mobile/team/billing)** — the desktop surface explains that a mobile, team, billing, account, or hosted-sharing feature is unavailable offline. Per product decision, this is complete for Murmur.
- **Not applicable** — macOS-only behavior, Wispr staff/debug tooling, telemetry/feature-flag plumbing, or proprietary cloud models that Murmur intentionally does not reproduce.
- **Partial** — substantive local behavior exists but does not cover the full inventoried desktop outcome.
- **Missing** — no local implementation or intentional offline disposition was found.

# Dictation core

## Core dictation pipeline

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Global voice-to-text** | Dictation works in any editable application without an app integration: press/hold the push-to-talk shortcut, speak, release, and Flow inserts the result into the focused textbox.… | Implemented | `src/main/features/dictation.ts:83-100`<br>`src/main/features/dictation.ts:649-670`<br>`src/main/native/textio.ts:47-86` |
| **Push-to-talk recording** | Hold the configured shortcut for a short utterance; the bar enters `active_ptt`, shows microphone activity, and releasing ends capture and starts processing. A too-fast tap produc… | Implemented | `src/main/shortcuts.ts:18-26`<br>`src/main/features/dictation.ts:143-180`<br>`src/renderer/src/status/FlowBar.tsx:181-194` |
| **Hands-free recording** | Press the configured toggle once to start and once again to finish; the bar enters `active_popo`. It is also discoverable as “Double tap {{shortcut}} to start hands-free mode.” | Implemented | `src/main/shortcuts.ts:28`<br>`src/main/features/dictation.ts:161-175`<br>`src/renderer/src/status/FlowBar.tsx:187-190` |
| **Finish and paste** | While hands-free recording is active, the stop control says “Finish and paste”; stopping finalizes ASR/formatting and inserts the result. | Implemented | `src/renderer/src/status/FlowBar.tsx:187-190`<br>`src/main/features/dictation.ts:588-610`<br>`src/main/features/dictation.ts:649-670` |
| **Cancel capture** | Escape/default Cancel dismisses active dictation and notifications. The bar exposes a Cancel tooltip and records a cancelled history item that can be recovered. | Implemented | `src/main/features/dictation.ts:191-209`<br>`src/renderer/src/status/FlowBar.tsx:181-185` |
| **Recording state machine** | Outside-hub windows share explicit states: hidden, resting, context-menu, initializing, ready, active push-to-talk, active hands-free, processing, Polish processing, Polish comple… | Implemented | `src/main/features/dictation.ts:44-53`<br>`src/main/features/dictation.ts:161-180`<br>`src/renderer/src/status/FlowBar.tsx:76-80` |
| **Audio capture** | Captures the selected input device, records duration/speech duration and microphone label, stores recoverable audio/Opus chunks, and reports no-audio/device failures. | Offline equivalent — captures selected-device PCM16, levels, duration and recoverable WAV audio; Murmur does not produce Opus chunks. | `src/renderer/src/capture/main.ts:87-105`<br>`src/renderer/src/capture/main.ts:118-149`<br>`src/main/features/dictation.ts:225-264` |
| **ASR stage** | Persists raw `asrText`, default/fallback ASR candidates, detected/output language, confidence (`averageLogProb`), fallback use, and whether an external recognizer was called. Murm… | Offline equivalent — Local whisper.cpp replaces Flow cloud ASR. | `src/main/asr/whisper.ts:101-119`<br>`src/main/features/dictation.ts:297-304` |
| **Formatting stage** | Converts ASR into `formattedText`; raw and formatted alternatives, desired ASR/format choice, divergence scores, corrected-word count, and fallback-formatting use are retained. Mu… | Offline equivalent — deterministic formatting plus the configured Claude/Codex CLI stores local/raw/LLM/tone stages without Flow cloud scoring. | `src/main/features/formatting.ts:105-142`<br>`src/main/features/dictation.ts:615-638` |
| **Default formatted mode** | Packaged default is “Apply AI formatting”; `defaultTranscriptionFormat=Apply AI formatting`, `aiFormatting=true`, and migrated cleanup level `light`. | Offline equivalent — formatted output and light cleanup are the local defaults; Murmur has no separate legacy `aiFormatting` flag. | `src/shared/settings.ts:270-273`<br>`src/shared/apps.ts:38-45`<br>`src/main/features/formatting.ts:138-153` |
| **Raw transcript fallback** | If formatting is unavailable, nonempty ASR may be pasted as raw text and a toast says “Formatting may be missing. Tap to retry.” Command mode is excluded from this raw fallback. | Implemented | `src/main/features/formatting.ts:153-179`<br>`src/main/features/dictation.ts:443-448`<br>`src/main/features/dictation.ts:675-681` |
| **App-specific format selection** | `appTranscriptionFormats` can override the default per application; an empty array means no overrides. | Implemented | `src/shared/settings.ts:270`<br>`src/shared/apps.ts:38-45`<br>`src/main/features/formatting.ts:138-153` |
| **Light cleanup** | Removes fillers and obvious disfluencies while preserving wording; the current migrated `autoCleanup.level` is `light`. The Flow bar briefly says “Cleaned up! See what’s changed.” | Implemented | `src/shared/textPipeline.ts:41-54`<br>`src/shared/settings.ts:272-278`<br>`src/main/features/dictation.ts:683-686` |
| **Cleanup diff** | “See what’s changed” opens the transform/diff view; cleanup tracks `diffShownCount`, corrected words, edit distance, and whether AI output was reverted. | Offline equivalent — transform diffs and undo state are retained; Flow-specific cleanup education counters are local settings only. | `src/main/features/dictation.ts:603-605`<br>`src/main/features/dictation.ts:789-797`<br>`src/shared/settings.ts:298` |
| **Dictionary context injection** | Active personal/team dictionary phrases are supplied as recognition/formatting context; live records show `dictionary_context` alongside AX, OCR, variables, and filenames. | Offline equivalent — personal dictionary terms and focused-field/IDE context feed local Whisper/formatting; team and OCR context are excluded. | `src/main/features/formatting.ts:67-78`<br>`src/main/features/formatting.ts:95-103`<br>`src/main/features/dictation.ts:119-121` |
| **Dictionary replacement** | A dictionary row may map spoken `phrase` to plain `replacement`; replacement count is saved per transcript and replacements happen before the final paste. | Implemented | `src/main/features/formatting.ts:34-45`<br>`src/shared/textPipeline.ts:183-200`<br>`src/main/features/dictation.ts:622-638` |
| **Rich snippet replacement** | Dictionary rows marked `isSnippet` can expand to `replacement` or `replacementHtml`; this permits formatted reusable blocks rather than only spelling corrections. | Implemented | `src/main/features/formatting.ts:34-65`<br>`src/main/features/dictation.ts:611-638`<br>`src/main/features/dictation.ts:649-656` |
| **Auto-learned vocabulary** | When enabled, Flow learns candidate terms from user edits and application context, stores their observed source, and announces “Added {{terms}} to your Dictionary” with Undo. | Implemented | `src/shared/settings.ts:267`<br>`src/main/features/dictation.ts:671-672`<br>`src/main/features/learning.ts:23-52` |
| **Edit-driven learning** | After a transcript is manually edited, Flow compares formatted versus edited text, increments usage of existing entries, learns eligible replacements, and excludes unsuitable CJK/… | Implemented | `src/shared/learn.ts:42-76`<br>`src/main/features/learning.ts:23-50` |
| **Paste stage** | Uses Windows accessibility/clipboard automation to insert final text into the focused editable control; the database separately stores formatted and actually pasted text. | Implemented | `src/main/native/textio.ts:47-86`<br>`src/main/features/dictation.ts:649-670` |
| **Textbox context** | Captures before/selected/after text and editability where Windows accessibility supports it; this is bounded before sending to formatting and skipped in the Flow app on Windows be… | Implemented | `src/main/native/uia.ts:12-47`<br>`src/main/features/dictation.ts:119-121` |
| **Active-app context** | Records app, bundle/process identity, URL, selected text, accessibility text/HTML, variables, filenames, OCR context, and conversation ID when available. | Offline equivalent — stores Windows process/title/executable, URL, selected text and optional UIA text; Flow cloud conversation/screenshot payloads are excluded. | `src/main/features/dictation.ts:241-278`<br>`src/main/native/uia.ts:19-44` |
| **Paste verification** | Paste telemetry distinguishes delayed rendering, verified/unverified contents, and final outcome; dictated-text position can be resolved against resulting textbox contents. | Implemented | `src/main/native/textio.ts:72-90`<br>`src/main/features/dictation.ts:651-667` |
| **Paste blocked by elevation** | If the target is elevated, toast copy is “Update admin settings to paste!” / “Run Flow as Administrator to insert text everywhere.” | Implemented | `src/main/native/textio.ts:47-52`<br>`src/main/features/dictation.ts:658-663` |
| **Paste failed fallback** | If no editable target is focused, text remains available for manual paste; toast: “Click a textbox and use {{shortcut}} to paste.” | Implemented | `src/main/features/dictation.ts:664-667`<br>`src/main/native/textio.ts:53-77` |
| **Void dictation fallback** | The overlay shows “Select a textbox first, then dictate” and a Copy button; after copying it says “Copied!” | Implemented | `src/main/features/dictation.ts:641-647` |
| **Retry and recovery** | Failed, incomplete, raw, cancelled, delayed, and max-duration transcripts retain audio/history so users can retry transcription or recover/copy text. | Implemented | `src/main/features/dictation.ts:225-264`<br>`src/main/features/dictation.ts:746-779` |
| **Processing delay safety** | “Taking longer than usual…” tells the user “Your audio is saved for retrying” and can be permanently dismissed. | Implemented | `src/main/features/dictation.ts:411-419` |
| **Network loss behavior** | “Is your internet connected?” says audio will be saved if transcription fails. In Murmur local ASR removes this cloud dependency but should retain crash-safe retry. | Offline equivalent — Local whisper.cpp removes the network dependency while audio/history stay local. | `src/main/asr/whisper.ts:101-119`<br>`src/main/features/dictation.ts:225-264` |
| **20-minute dictation limit** | At less than one minute remaining, a warning appears; at 20 minutes the session ends with “Flow supports up to 20 minutes per session” and a Recover text action. | Implemented | `src/main/features/dictation.ts:122-131` |
| **Long-dictation coaching** | Long captures may suggest Notetaker (“That was a long one!” / “Were you recording something?”), explaining it can produce transcript and notes. The cloud Notetaker CTA itself is n… | Implemented | `src/main/features/dictation.ts:153-159` |
| **Weekly word quota** | Basic-plan UI can block or warn at the weekly limit, reset Sunday 12 a.m. PT, offer bonus words, student claim, or Pro upgrade. Murmur should not implement the billing gate. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:51-65` |
| **History metrics** | Each transcript tracks timestamp, duration, speech duration, word count, WPM inputs, app, platform, command, language, status, latency, and dictionary/correction counts. | Implemented | `src/main/features/dictation.ts:241-278`<br>`src/main/db.ts:7-30` |
| **Local data control** | Dictation-history erasure covers “Transcripts, audio, and edits from dictating”; local policy supports normal storage and archived records. | Implemented | `src/main/features/dictation.ts:229-239`<br>`src/main/features/dictation.ts:285-293`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:597-614` |

## Floating Flow bar and overlay

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Always-on-top status bar** | A compact floating status window gives resting, listening, processing, success, error, reminder, notification, and meeting affordances outside the Hub. | Implemented | `src/main/windows.ts:70-93`<br>`src/renderer/src/status/FlowBar.tsx:76-108` |
| **Dock positions** | The movable bar can dock left, right, or bottom; current/default `statusDockEdge` is `bottom`. Launch copy: “You can now move the Flow Bar!” | Implemented | `src/main/windows.ts:96-104`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:328-330` |
| **Drag education** | “Click and drag the Flow Bar to move it!” appears after choosing “Try it out.” | Implemented | `src/main/features/dictation.ts:702-708`<br>`src/main/windows.ts:70-93`<br>`src/renderer/src/status/FlowBar.module.css:16-50` |
| **Permanent visibility** | “Show Flow Bar at all times” controls persistent visibility; current `hideFlowBarPermanently=false`. | Implemented | `src/main/index.ts:42-49`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:328-330` |
| **Temporary hide** | Menu action “Hide for 1 hour” hides the bar and confirms “The Flow Bar will be hidden for an hour” with Undo. | Implemented | `src/renderer/src/status/FlowBar.tsx:160-162`<br>`src/main/features/dictation.ts:842-846` |
| **Resting menu** | Offers Formatting options, Languages, Microphone, Paste last transcript, Transcript history, Settings, reminder controls, and virtual-device expansion. | Implemented | `src/renderer/src/status/FlowBar.tsx:113-128`<br>`src/renderer/src/status/FlowBar.tsx:129-166` |
| **Microphone menu** | Shows selected dictation microphone and optionally hidden/virtual devices; Notetaker's microphone is separately explained as always Auto-detect. | Implemented | `src/renderer/src/status/FlowBar.tsx:113-119`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:223-239` |
| **App-blocked state** | Bar label “Voice-to-text disabled”; tooltip says an administrator disabled voice-to-text in the active app. | Offline equivalent — a local per-app preference disables dictation and exposes the same bar state; Murmur has no administrator policy backend. | `src/main/features/dictation.ts:75-99`<br>`src/renderer/src/status/FlowBar.tsx:208-216` |
| **Growth reminder state** | Prompts users to open a relevant app/textbox and hold or double-tap the shortcut to dictate messages, emails, AI prompts, notes, documents, code, or posts. | Implemented | `src/renderer/src/status/FlowBar.tsx:208-216`<br>`src/main/watchers.ts:93-108` |
| **Listening visualization** | Active states consume microphone audio level/current WPM and show the active microphone animation; sound marks microphone start/stop when enabled. | Implemented | `src/renderer/src/status/FlowBar.tsx:12-23`<br>`src/renderer/src/status/FlowBar.tsx:181-194`<br>`src/main/features/dictation.ts:828-834` |
| **Processing visualization** | After release, state changes to processing until formatting/paste completes; cancel may remain available when the previous transcript is still processing. | Implemented | `src/main/features/dictation.ts:175-180`<br>`src/renderer/src/status/FlowBar.tsx:196-201` |
| **Success visualization** | Cleanup completion shows “Cleaned up!”; transform completion can reveal edits or view a diff; instruct completion has a separate state. | Implemented | `src/renderer/src/status/FlowBar.tsx:202-205`<br>`src/main/features/dictation.ts:603-605`<br>`src/main/features/dictation.ts:683-686` |
| **Context menu window** | A dedicated window opens from the bar and presents microphone selection plus Auto Apply After Dictation, transform choices/checkmarks, and “Configure transforms.” Items can keep t… | Implemented | `src/renderer/src/status/FlowBar.tsx:111-140` |
| **Overlay window** | A separate transparent overlay renders drag/debug tint, dictation/Polish states, and no-textbox copy affordances without opening the Hub. | Offline equivalent — the transparent always-on-top Flow Bar renders dictation, transform and fallback states in one status window. | `src/main/windows.ts:70-93`<br>`src/renderer/src/status/FlowBar.tsx:169-207`<br>`src/main/features/dictation.ts:641-647` |
| **Screen-share behavior** | Floating windows are separate Electron windows; Notetaker has a hide-in-screen-share preference, while dictation overlay remains OS-level UI. | Implemented | `src/main/windows.ts:70-93`<br>`src/main/windows.ts:119-135` |

## Windows shortcuts and Mouse Flow

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Packaged Windows push-to-talk default** | `Ctrl+Win` maps to `ptt`; the installed account has been migrated to `Caps Lock`, confirmed by `windowsCapsLockShortcutSwappedAt`. Caps Lock then starts dictation instead of capit… | Implemented | `src/shared/settings.ts:230`<br>`src/main/shortcuts.ts:18-26` |
| **Packaged Windows hands-free default** | `Ctrl+Win+Space` maps to `popo`; the installed account retains this mapping. | Implemented | `src/shared/settings.ts:231`<br>`src/main/shortcuts.ts:28` |
| **Packaged Windows Lens default** | `Ctrl+Win+Alt` maps to `lens`; installed key codes are left Ctrl + left Alt + Windows. | Implemented | `src/shared/settings.ts:236`<br>`src/main/shortcuts.ts:37-39` |
| **Cancel default** | `Esc` maps to `dismiss` and cancels dictation or dismisses notifications. | Implemented | `src/shared/settings.ts:232`<br>`src/main/shortcuts.ts:29-33` |
| **Paste-last default** | `Shift+Alt+Z` pastes the last transcript. | Implemented | `src/shared/settings.ts:233`<br>`src/main/shortcuts.ts:35` |
| **Copy-last default** | `Shift+Alt+X` copies the last transcript without focusing an editable field. | Implemented | `src/shared/settings.ts:234`<br>`src/main/shortcuts.ts:36` |
| **Undo operating shortcut** | `Ctrl+Z` is recognized as undo/revert after insertion; live split keybinds include left Ctrl + Z as `undo`. | Implemented | `src/main/shortcuts.ts:97-104`<br>`src/main/features/dictation.ts:789-797` |
| **Normal paste observation** | `Ctrl+V` is tracked as `paste_event` so Flow can correlate manual fallback paste with a prior dictation. | Not applicable — Flow paste-event telemetry correlation is excluded from the offline build. | — |
| **Open Scratchpad shortcut** | Configurable action opens the separate scratchpad window; no shortcut is active in the captured profile (`lastSetScratchpadShortcut` empty). | Implemented | `src/main/shortcuts.ts:42`<br>`src/shared/settings.ts:240` |
| **Transform shortcut** | Configurable `polish` plus up to nine named prompt actions apply a selected transform to highlighted text. | Implemented | `src/main/shortcuts.ts:40`<br>`src/main/shortcuts.ts:68-77` |
| **Transform view-changes shortcut** | `view_diff` opens the post-Transform diff window. | Implemented | `src/main/shortcuts.ts:41` |
| **Command/Lens actions** | Both route through the command handler; command mode changes how Lens release is interpreted and history records command values `lens`/`command`. | Implemented | `src/main/shortcuts.ts:37-39`<br>`src/main/features/dictation.ts:443-448`<br>`src/main/features/dictation.ts:547-570` |
| **Instruct shortcut** | Configurable action “Dictate instructions to draft replies using screen context.” | Implemented | `src/main/shortcuts.ts:39`<br>`src/main/features/dictation.ts:468-493`<br>`src/main/features/dictation.ts:494-516` |
| **Focus Mode shortcut** | Configurable `toggle_focus_mode`; settings copy describes `Alt+F`, but it is absent from current active shortcuts. | Implemented | `src/main/shortcuts.ts:45-51`<br>`src/shared/settings.ts:243` |
| **Press Enter rebind** | Allows a mouse button or key to emit Enter and send a message faster. | Implemented | `src/main/shortcuts.ts:44` |
| **Notetaker shortcut** | Packaged/live `Win+M+Space` opens Notetaker; included in the shared shortcut editor but cloud Notetaker behavior is outside local dictation. | Offline equivalent — opens Murmur’s local Notetaker with the packaged Windows shortcut. | `src/main/shortcuts.ts:43`<br>`src/shared/settings.ts:241` |
| **Shortcut editor** | Each action can add another binding, edit/remove it, reset defaults, or accept keyboard/mouse input; save confirmation is “Shortcut saved.” | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:282-318`<br>`src/main/native/hotkeys.ts:66-71` |
| **Shortcut validation** | Rejects disallowed keys, reused combinations, both left/right versions of the same modifier, modifierless keyboard chords, and chords over three keys. | Implemented | `src/shared/hotkeys.ts:83-105`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:287-305` |
| **PTT/hands-free conflict warning** | Warns when the hands-free chord is contained inside a PTT chord because starting one can trigger the other. | Implemented | `src/shared/hotkeys.ts:108-116`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:302` |
| **Other-key cancellation guard** | If another key is pressed while starting, recording cancels with “Hold only {{shortcut}} to dictate.” | Implemented | `src/main/shortcuts.ts:97-104`<br>`src/main/features/dictation.ts:183-189` |
| **Chord coalescing** | Nearby key presses are coalesced while checking whether a larger configured chord supersedes a smaller action, preventing accidental PTT when the user intended Lens. | Offline equivalent — the low-level hook resolves the longest exact chord before dispatch, avoiding partial PTT activation. | `src/main/native/hotkeys.ts:23-40` |
| **Mouse Flow packaged defaults** | Mouse button 4 toggles hands-free dictation; mouse button 5 sends Enter. Setup says these replace Back/Forward. | Implemented | `src/shared/settings.ts:291`<br>`src/main/shortcuts.ts:92-96` |
| **Mouse Flow setup** | User presses each side button to test it; Dictate is “Click to start, click again to stop,” Enter “Sends your message,” with Reset/Not now/Done. | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:168-195` |
| **Mouse shortcut discovery** | Toast asks “Want to Flow with your mouse?” then reminder “You can Flow with your mouse!”; actions Try it out or Don't show again. | Offline equivalent — local discovery and reminder toasts open Mouse Flow settings. | `src/main/shortcuts.ts:106-111` |
| **Mouse binding range** | Key map includes Mouse 4 through Mouse 10 and Aux Button, allowing non-default extra buttons. | Implemented | `src/shared/hotkeys.ts:40-52`<br>`src/main/native/hotkeys.ts:48-55`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:168-193` |

## Command mode, Instruct, Lens, and Press Enter

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Command Mode toggle** | Experimental setting “Enable advanced voice commands”; current `commandModeEnabled=false`. | Implemented | `src/shared/settings.ts:287`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:435-437`<br>`src/main/features/dictation.ts:458-467` |
| **Command Mode activation** | Shortcut description: “Select text and ask Flow or Perplexity.” It captures selected text/context, records under `command`, and routes the spoken request rather than ordinary dict… | Implemented | `src/main/shortcuts.ts:37`<br>`src/main/features/dictation.ts:443-448`<br>`src/main/features/dictation.ts:531-570` |
| **First-use state** | First use shows “Using Command Mode (beta)” with Disable; subsequent compact toast says “Using Command Mode.” | Implemented | `src/main/features/dictation.ts:519-527` |
| **Disabled gate** | If invoked while off: “Command mode is toggled off” / “Please turn it on to use it,” with Go to settings. | Implemented | `src/main/features/dictation.ts:458-467` |
| **Cloud plan gate** | Installed copy may say “Upgrade for Command Mode” and “Flow commands only available on Flow Pro.” Murmur should provide its CLI-backed command mode without this cloud gate. | Not applicable — Murmur’s CLI-backed Command Mode has no plan gate. | — |
| **Busy failure** | “Command Mode Servers Are Busy” / “Servers experiencing high demand.” Murmur maps this to a failed local CLI invocation. | Offline equivalent — configured Claude/Codex CLI reports local invocation failures instead of cloud server load. | `src/main/features/dictation.ts:531-565` |
| **Hey Flow migration** | Status tip says “No need to say ‘Hey Flow’ anymore with command mode!” The old wake phrase is education, not required when a dedicated shortcut is present. | Implemented | `src/main/features/dictation.ts:519-527` |
| **Instruct Mode** | Separate mode dictates instructions to draft replies from current screen/accessibility context and can route to tools, transforms, chat, or settings updates. | Implemented — local CLI drafting, selected-text transforms, Hub tools, and settings updates are routed locally; cloud chat is not required. | `src/main/shortcuts.ts:39`<br>`src/main/features/dictation.ts:468-493`<br>`src/main/features/dictation.ts:531-570` |
| **Instruct destination** | Internal logic can paste a generated result into an empty textbox when an instruct/transform tool produced text and no blocking/chat/settings tool ran; otherwise result opens in chat. | Implemented — generated text is pasted into the focused target, while navigation/settings tools complete without pasting. | `src/main/features/dictation.ts:468-493`<br>`src/main/features/dictation.ts:494-516`<br>`src/main/features/dictation.ts:531-570` |
| **Instruct audit data** | Stores classifier mode/provider/version/latency/status, chosen route and errors, routes/context/config payloads, tool calls, session/turn, feedback, and edit artifact. | Offline equivalent — provider, model, latency, status and route are stored on local history; Flow classifier/tool/session payloads are excluded. | `src/main/features/dictation.ts:496-510`<br>`src/main/features/dictation.ts:547-562` |
| **Lens** | Dedicated `lens` transcript command shares the command handler, uses active selected/screen context, and has onboarding lifecycle events for intro, learn, permissions, and setup. Static evidence does not expose separate English Lens UI copy. | Implemented | `src/main/shortcuts.ts:38`<br>`src/main/features/dictation.ts:528-540`<br>`src/main/features/dictation.ts:547-570` |
| **Lens input semantics** | Lens is one of the dictation-class shortcuts, can supersede a partial chord, and on release remains Lens when Command Mode is active rather than reverting to ordinary PTT. | Implemented | `src/main/native/hotkeys.ts:23-40`<br>`src/main/shortcuts.ts:37-39` |
| **Voice “press enter”** | Optional `pressEnterCommandEnabled` recognizes “press enter” at the end, automatically sends the message/prompt, and warns that it will submit anything in the textbox. Current def… | Implemented | `src/shared/textPipeline.ts:221-250`<br>`src/shared/textPipeline.ts:251-269`<br>`src/main/features/dictation.ts:649-656` |
| **Press-enter education** | Prompt title “Say ‘Press enter’ to automatically press enter”; actions Great or Disable, tracked by `pressEnterCommandPromptShown`. | Offline equivalent — the real spoken-submit condition triggers one-time education; no account prompt state is uploaded. | `src/main/features/dictation.ts:710-713` |

## Polish / Transform and auto-apply

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Polish selected text** | Highlight editable text and invoke the Transform shortcut; copy: “Highlight any text, then press {{shortcut}}.” The selected source is rewritten and pasted back. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/main/features/transforms.ts:83-111`<br>`src/main/features/transforms.ts:112-150`<br>`src/main/native/textio.ts:93-112` |
| **First no-selection education** | “Hey, select text first!” then “First, highlight the text you want to transform.” Later attempts show “Select text to apply a transform.” | Implemented | `src/main/features/transforms.ts:100-104` |
| **Default Polish rules** | Enabled rules are Make more concise, Maintain your tone, Reword for clarity, Reorder for readability, and Add structure for readability. Clarify main point and Refine phrasing for… | Implemented | `src/shared/settings.ts:168-176` |
| **Custom transforms** | Named prompts can be assigned individual shortcut actions (`polish_prompt_1`…`polish_prompt_9`) and selected from the context menu. | Offline equivalent — named local CLI prompts have individual configurable shortcuts; Murmur is not limited to Flow’s nine cloud slots. | `src/main/shortcuts.ts:68-77`<br>`src/main/features/transforms.ts:19-47` |
| **Writing-style examples** | UserContext stores writing samples and prompt definitions; examples teach Polish to match the user's voice. | Offline equivalent — writing samples are local settings injected into CLI transform prompts. | `src/main/features/transforms.ts:25-41` |
| **Auto-paste** | `polishAutoPaste=true`: successful rewritten text is inserted automatically when the field remains editable. | Implemented | `src/shared/settings.ts:283`<br>`src/main/features/transforms.ts:133-140` |
| **Clipboard fallback** | If text is no longer editable: “Flow can't paste right now. Text saved to clipboard.” | Implemented | `src/main/features/transforms.ts:133-140` |
| **Auto Apply After Dictation** | Context menu toggle selects a transform to run after every dictation; preference stores `{active, promptName}`. Current default is inactive with prompt `polish`. | Implemented | `src/shared/settings.ts:284`<br>`src/renderer/src/status/FlowBar.tsx:120-128`<br>`src/main/features/dictation.ts:596-605` |
| **Auto-edit notification** | Completed automatic rewrite says “We polished your dictation” with Reveal edit. | Implemented | `src/main/features/dictation.ts:596-605` |
| **View diff** | A dedicated shortcut/button opens changes after Transform; successful cleanup/polish tracks diff count and whether the user undid it. | Implemented | `src/main/shortcuts.ts:41`<br>`src/main/features/transforms.ts:142-147` |
| **Undo/revert** | Undo uses Ctrl+Z after paste; transform rows store `polishUndone`; history stores `hasRevertedAI`, and menus support Undo AI edit / Redo AI edit. | Implemented | `src/main/features/transforms.ts:142-160`<br>`src/main/features/dictation.ts:789-797` |
| **No-op result** | If output equals input, toast says “Your text looks good!” | Implemented | `src/main/features/transforms.ts:129-131` |
| **Word ceiling** | Polish rejects 3,000 words or more: “Oops, too long to polish” / “Try again with under 3000 words.” | Implemented | `src/main/features/transforms.ts:106-108` |
| **Mutual exclusion** | “{{name}} doesn't work while dictating” and “Can't dictate while {{name}} is running” prevent capture and Transform from racing. | Implemented | `src/main/shortcuts.ts:56-60`<br>`src/main/features/transforms.ts:83-90` |
| **Cancellation** | Cancelling a transform shows “{{name}} cancelled.” | Implemented | `src/main/features/transforms.ts:56-76`<br>`src/main/features/transforms.ts:125-127` |
| **Timeout** | “Transform timed out” / “The request took too long. Please try again.” | Offline equivalent — local CLI timeout errors trigger the timeout toast. | `src/main/features/transforms.ts:113-122` |
| **Empty response** | “Transform returned no text” / “Something went wrong. Please try again.” | Offline equivalent — an empty local CLI result is recorded as failed and shown as a transform error. | `src/main/features/transforms.ts:56-67`<br>`src/main/features/transforms.ts:113-123` |
| **Busy/failure** | “{{name}} mode servers are busy” / “Servers experiencing high demand.” | Offline equivalent — local CLI failures replace Flow server-capacity errors. | `src/main/features/transforms.ts:113-123` |
| **Textbox detection failure** | “Couldn't detect text in your text box” asks the user to click into it and retry. | Implemented | `src/main/features/transforms.ts:95-98` |
| **First-transform celebration** | “Congrats, you did your first transform!” links to Customize transforms. | Implemented | `src/main/features/transforms.ts:142-150` |
| **Transform history** | Polish records initial/final text and word counts, app, processing time, status, instruction, model/provider, prompt name, shortcut, diff count, feedback, timestamps, and linked i… | Offline equivalent — local runs retain input/output, app, status, processing time, error and timestamp; cloud classifier/sync fields are excluded. | `src/main/features/transforms.ts:50-70`<br>`src/main/db.ts:48-58` |

## Smart formatting and application-aware style

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Smart Formatting master switch** | “Automatically formats your dictation”; represented by AI formatting/auto-cleanup rather than a separate captured boolean. | Implemented | `src/shared/settings.ts:272-273`<br>`src/main/features/formatting.ts:119-127` |
| **List formatting** | Speaking numbered items becomes a formatted list; education: “Dictate numbers for Flow to format as a list,” success “Listed!” | Implemented | `src/shared/textPipeline.ts:129-159`<br>`src/main/features/dictation.ts:683-692` |
| **Email formatting** | A greeting cues email structure; education: “Start with a greeting and Flow formats as email,” success “Email formatted!” | Implemented | `src/shared/textPipeline.ts:161-181`<br>`src/main/features/dictation.ts:683-692` |
| **Backtrack/self-correction** | Later corrections replace earlier speech, e.g. “How's 6, no 7?” → “How's 7?”; success “Backtrack caught!” | Implemented | `src/shared/textPipeline.ts:107-119`<br>`src/main/features/dictation.ts:683-692` |
| **Spoken punctuation** | Recognizes punctuation/new-line commands and then normalizes punctuation automatically; the extracted English catalog contains localized Russian copy for this card. | Implemented | `src/shared/textPipeline.ts:70-87`<br>`src/shared/textPipeline.ts:223-250`<br>`src/shared/textPipeline.ts:251-269` |
| **IDE file tagging** | Speaking a filename creates a file tag in Cursor and Devin; enabled by `ideFileTagging=true`. | Implemented | `src/main/features/formatting.ts:128-136`<br>`src/shared/vibeCoding.ts:50-61` |
| **File-tag context** | Uses currently observed Cursor filenames; special formatting is skipped if dictionary substitution already occurred to avoid conflicting replacements. | Implemented | `src/main/features/formatting.ts:95-103`<br>`src/main/features/formatting.ts:128-136` |
| **File-tag success** | Education says “Speak a file name, and Flow automatically tags it,” reminder “File tagged!” | Implemented | `src/main/features/dictation.ts:688-692` |
| **Per-app voice profiles** | Built-ins: Work messages (Slack, Teams), Email (Gmail, Outlook, Superhuman), Messages (Messages, WhatsApp, WeChat, Messenger), and Others. | Implemented | `src/shared/settings.ts:274-278`<br>`src/shared/apps.ts:21-35` |
| **Profile controls** | Each voice profile stores app names, cleanup level, and style preference; current built-ins all use light cleanup and formal style. | Implemented | `src/shared/settings.ts:274-278`<br>`src/main/features/formatting.ts:105-127`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:128-131` |
| **Tone matching** | History has `toneMatchedText`, tone-match pairs, and `personalizationStyleSettings`; internal `isToneMatchEnabled` defaults false in this captured profile. | Implemented | `src/main/features/formatting.ts:154-175`<br>`src/main/features/dictation.ts:269-275` |
| **Email signature** | Optional `emailAutoSignature` can append configured “written_with_flow” signature; current value false. | Implemented | `src/main/features/formatting.ts:182-187`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:351` |

## Languages and microphone behavior

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Language picker** | Select all spoken languages; copy says this improves accuracy and permits mixing languages in one sentence. | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:266-279` |
| **Auto-detect** | Toggle supports 99/100+ languages; validation requires at least one selected language or auto-detect. | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:266-279`<br>`src/main/features/dictation.ts:297-304` |
| **Captured default** | `usedLanguages=[en]`, `selectedLanguages=[en]`; app/email locales are null (system/server default). | Offline equivalent — Murmur stores one local selected/used language list, defaulting to English, with null app/email locales. | `src/shared/settings.ts:248-253` |
| **Detected versus output language** | History stores `detectedLanguage` separately from final `language`; toast says “We auto-detected your language. You can change the output language.” | Implemented | `src/main/features/dictation.ts:267-275`<br>`src/main/features/dictation.ts:331-355` |
| **Automatic language addition** | Frequently used language can be added alongside selected languages, with Undo. Account-level state prevents repeated additions. | Implemented | `src/main/features/dictation.ts:339-350` |
| **Hinglish** | Optional Hindi written in Latin letters; auto-added toast gives an example and permits Undo or Use Hindi script. | Implemented | `src/main/features/dictation.ts:339-350`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:125-127` |
| **Wrong-language nudge** | Suggests adding the heard language to preferred languages; actions Open language settings or Don't show again. | Implemented | `src/main/features/dictation.ts:334-338` |
| **Canadian English nudge** | Canada users dictating English are offered Canadian spelling/phrasing. | Implemented | `src/main/features/dictation.ts:353-355` |
| **Microphone auto-detect** | Default ranked device is `default` (“Auto-detect”); user can rank remembered devices and override explicitly. | Implemented | `src/shared/settings.ts:245-247`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:223-230` |
| **Microphone ranking** | Drag to reorder, forget a device, and hide/show virtual/other devices. Closed-lid built-in microphone is unavailable. | Implemented — Windows has no reliable laptop-lid microphone availability API, while ranking, forgetting, and virtual-device expansion are supported. | `src/shared/settings.ts:245-247`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:223-239` |
| **Device switching** | New mic prompts “Would you like to use this mic for Flow?”; selected switch confirms “Using {{micLabel}}.” | Implemented | `src/main/features/engines.ts:35-65` |
| **AirPods warning** | Warns Bluetooth devices may start slowly and produce more dictation errors; built-in or wired mic is recommended. | Implemented | `src/main/features/engines.ts:31-65`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:239` |
| **Whisper support** | Mic education tests quiet speech and recommends wired, headset, lavalier, gooseneck, podcast, or built-in devices depending on mobility/shared-space needs. | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:243-262` |

## Sounds, media, Focus Mode, and typing reminder

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Dictation/notification sounds** | `enableSounds=true` plays mic/notification sounds; `selectedSoundFolder=null` uses default sound pack. | Implemented | `src/shared/settings.ts:260-261`<br>`src/main/features/dictation.ts:58-60`<br>`src/renderer/src/capture/main.ts:228-256` |
| **Mute all audio** | `shouldMuteAudio=true` mutes system playback during dictation. | Implemented | `src/main/features/mediaDuck.ts:16-28`<br>`src/main/native/audio.ts:74-93` |
| **Pause music** | Experimental `shouldPauseAudio=false` pauses media instead of muting; the two modes are mutually exclusive and toggling one off explains the other is active. | Implemented | `src/main/features/mediaDuck.ts:16-36`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:321-335` |
| **Mute education** | Toast “Mute all audio while dictating” explains Flow can mute everything; action Open Settings. | Implemented | `src/main/watchers.ts:125-126` |
| **Pause education** | “Auto-pause music” says Flow will auto-pause music while dictating. | Implemented | `src/main/watchers.ts:127-128` |
| **Typing reminder** | Flow bar can gently remind users to dictate after sustained typing; current contextual mode is `not_set`. | Implemented | `src/main/watchers.ts:38-73`<br>`src/shared/settings.ts:299` |
| **Reminder scopes** | All apps, previously used apps, AI apps, work messengers, personal messengers, email, documents/notes, or specific app types. | Implemented | `src/main/watchers.ts:38-53`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:340-344` |
| **Reminder mute** | Bar menu mutes for 12 hours and confirms “Dictation reminder muted for 12 hours” with Undo. | Implemented | `src/main/watchers.ts:56-71` |
| **Reminder setup** | On reaching a word milestone, user chooses how the bar looks; activation toast says reminders are adjustable in Settings. | Implemented | `src/main/watchers.ts:111-123`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:340-344` |
| **Focus Mode toggle** | Blocks configured distracting apps/sites; status toasts: “Focus Mode on,” “Focus Mode off,” and when blocked “You're in a Flow state.” | Implemented | `src/main/watchers.ts:15-25`<br>`src/main/shortcuts.ts:45-51` |
| **Captured Focus defaults** | Disabled; blocked apps Slack/Superhuman and URLs Hex, Slack web, Gmail, Superhuman Mail, X/Twitter. | Implemented | `src/shared/settings.ts:290` |

## Accessibility drop and Windows permissions

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Microphone permission** | Windows microphone permission is required only during active dictation; success copy “Flow can now use your microphone.” | Implemented | `src/renderer/src/capture/main.ts:77-105`<br>`src/main/features/dictation.ts:102-108` |
| **Windows privacy gate** | “Microphone access is disabled” links to Settings when OS privacy controls block access. | Implemented | `src/main/features/dictation.ts:102-108` |
| **Accessibility permission** | Needed to gather app context, temporarily use clipboard, and insert words into the correct textbox; success “Flow can now paste text anywhere.” | Offline equivalent — Windows UI Automation and clipboard insertion do not require a separate macOS-style Accessibility grant. | `src/main/native/uia.ts:5-44`<br>`src/main/native/textio.ts:47-86` |
| **Permission revocation** | Revoked microphone/accessibility permissions show required alerts and actions Grant Permission/Open Settings. | Offline equivalent — microphone/privacy failures provide Windows Settings recovery; Windows UIA has no separate permission grant. | `src/renderer/src/capture/main.ts:77-105`<br>`src/main/features/dictation.ts:307-328` |
| **Accessibility drop helper** | Dedicated always-on-top panel instructs “Drag this icon into the Accessibility list,” shows an arrow/app row, handles an actual drag-start, and can be hidden. This is macOS-orient… | Not applicable — macOS Accessibility-list drag flow does not apply on Windows. | — |
| **Permission timeout/verification** | Toasts report not-all-granted, request timed out, and verification failed, with retry/restart guidance. | Offline equivalent — microphone open timeout and privacy checks provide restart/Settings recovery; macOS grant verification is not applicable. | `src/renderer/src/capture/main.ts:87-105`<br>`src/main/features/dictation.ts:307-328` |

## Status notification catalog — dictation and global

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **HelperLoadingError** | “Flow is having trouble loading”; restart or Contact us. | Implemented | `src/main/features/engines.ts:81` |
| **HelperNotReady** | “Just a moment - Flow is getting ready...” | Implemented | `src/main/features/dictation.ts:101` |
| **HelperPersistentFailure** | “Flow is having trouble starting”; restart or contact support. | Implemented | `src/main/features/engines.ts:81` |
| **TranscriptionError** | “Something's not right”; transcript failed, Retry or Open History. | Implemented | `src/main/features/dictation.ts:410` |
| **NetworkPolicyBlocked** | Network blocks requests; contact IT and retry from History. | UI-only (cloud) — no desktop surface; hosted network-policy enforcement does not run offline. | — |
| **RawTranscript** | “Formatting may be missing. Tap to retry.” | Implemented | `src/main/features/dictation.ts:593` |
| **TranscriptIncomplete** | “Part of your dictation is missing.” | Implemented | `src/main/features/dictation.ts:373` |
| **UpdateError** | “There was an error updating Flow”; restart/contact. | UI-only (cloud) — updates are installed manually and the Settings UI states that explicitly. | `src/renderer/src/hub/settings/SettingsDialog.tsx:602-643` |
| **NoInternet** | Audio is saved if transcription fails. | Offline equivalent — local Whisper removes the network dependency while retaining local audio. | `src/main/asr/whisper.ts:101-119`<br>`src/main/features/dictation.ts:225-294` |
| **FailedSignIn** | Trouble signing in; Contact us. | UI-only (cloud) — no desktop surface; Murmur has no sign-in requirement. | — |
| **TranscriptCurrentlyProcessing** | Previous transcript still processing; press shortcut or Cancel. | Implemented | `src/main/features/dictation.ts:90` |
| **MicDisconnected** | Offers Insert for audio/text captured up to disconnect. | Implemented | `src/main/features/dictation.ts:373` |
| **NewMicDetected** | Names device; Switch or Don't Switch. | Implemented | `src/main/features/engines.ts:54` |
| **MicNotFound** | No microphone; Open Sound Settings. | Implemented | `src/main/features/dictation.ts:309` |
| **MicDeviceUnavailable** | Previously selected mic disconnected; Choose Microphone. | Implemented | `src/main/features/engines.ts:47` |
| **MicNotReadable** | Another app/driver may own mic; Troubleshoot. | Implemented | `src/main/features/dictation.ts:310` |
| **MicAccessError** | Microphone could not start; reconnect/Troubleshoot. | Implemented | `src/renderer/src/capture/main.ts:84` |
| **NoAudio** | “Is your microphone muted?” / no audio from selected mic. | Implemented | `src/main/features/dictation.ts:381` |
| **NoAudioDuringDictation** | “No audio received”; Contact us. | Offline equivalent — merged into the real no-audio/escalation path. | `src/main/features/dictation.ts:381` |
| **NoAudioDuringDictationEscalated** | “Microphone is not working”; Select microphone or Contact us. | Implemented | `src/main/features/dictation.ts:381` |
| **TranscriptionEmpty** | “We couldn't hear you”; select mic or troubleshoot. | Implemented | `src/main/features/dictation.ts:422` |
| **MicAccessTimeout** | “Unable to access mic”; Restart App. | Implemented | `src/main/features/dictation.ts:312` |
| **NoClamshellBuiltInMic** | Lid closed; choose another microphone. | Not applicable — macOS clamshell behavior does not apply on Windows. | — |
| **WeeklyWordsLimitReached** | Weekly limit/reset/Upgrade gate. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **ClaimStudentPlan** | Student unlimited free offer. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **StripeCheckoutError** | Checkout failure. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **DatabaseGenericError** | Generic local error; Restart Flow or Contact us. | Implemented | `src/main/features/dictation.ts:217` |
| **DatabaseCorruptionError** | Local data corrupt; restart/contact. | Implemented | `src/main/features/dictation.ts:217` |
| **DatabaseStorageFull** | Computer running out of space; restart/contact. | Implemented | `src/main/features/dictation.ts:217` |
| **RampOrphanBlocked** | Ramp enterprise membership gate. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **DomainCaptureRequiredBlocked** | Refresh/request-to-join domain gate. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **AppDictationBlocked** | Admin disabled voice-to-text here/in named app. | Implemented | `src/main/features/dictation.ts:98` |
| **AudioQualityIssue** | “We didn't hear you clearly”; play audio, Change microphone, or dismiss forever. | Implemented | `src/main/features/dictation.ts:638` |
| **WrongLanguageSetting** | Different-language recommendation. | Implemented | `src/main/features/dictation.ts:337` |
| **LanguageAutoAdded** | Added frequently used language, Undo. | Implemented | `src/main/features/dictation.ts:345` |
| **LanguageAutoAddedHinglish** | Added Hinglish, Undo/use Hindi script. | Implemented | `src/main/features/dictation.ts:345` |
| **CanadianEnglishNudge** | Add Canadian English. | Implemented | `src/main/features/dictation.ts:354` |
| **AudioWorkletLoadError** | Audio system failed; Restart Flow/Contact us. | Implemented | `src/main/features/dictation.ts:313` |
| **AudioContextRecovery** | “Flow is getting audio ready”; retry shortly. | Implemented | `src/main/features/dictation.ts:314` |
| **RuxNudgeFallenChampion / RuxNudgeNeverActivated / WelcomeBackFallenChampion / WelcomeBackNeverActivated** | Re-engagement nudges; no dictation-engine effect. | Implemented | `src/main/watchers.ts:102`<br>`src/main/watchers.ts:97`<br>`src/main/watchers.ts:103` |
| **SecureInputBlockingShortcuts** | Secure Keyboard Entry/1Password blocks shortcuts; restart 1Password. | Implemented | `src/main/watchers.ts:31` |
| **FnConflictNotice** | Granola voice typing conflicts; turn it off in Granola settings. | Implemented | `src/main/watchers.ts:33` |
| **PolishDisabledDuringDictation** | Transform unavailable during capture. | Implemented | `src/main/shortcuts.ts:58` |
| **SignedOut** | Open app and sign in. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **BarHidden** | Hidden one hour, Undo. | Implemented | `src/main/features/dictation.ts:752` |
| **TypingReminderMuted** | Muted 12 hours, Undo. | Implemented | `src/main/watchers.ts:65` |
| **MicSwitched** | “Using {{micLabel}}.” | Implemented | `src/main/features/engines.ts:58` |
| **TranscriptCancelledDetailed** | Recover cancelled transcript via Undo/Open History. | Implemented | `src/main/features/dictation.ts:705` |
| **LearnedDictionaryWords** | Added terms to Dictionary, Undo. | Implemented | `src/main/features/learning.ts:44` |
| **FeatureTranslate** | Save translated/reusable content education. | Not applicable — this catalog key is only a Save CTA for translated meeting content; core dictation has no translation artifact to save, and meeting translation is inventoried under Notetaker. | — |
| **EmailSignature** | Email-signature feature education. | Implemented | `src/main/features/dictation.ts:628` |
| **FirstTimeUsingCommandMode / UsingCommandMode / CommandModeDisabled** | First-use, active, and disabled command states. | Implemented | `src/main/features/dictation.ts:459-465`<br>`src/main/features/dictation.ts:497-504` |
| **DictatingWithWisprFlow** | Compact active-dictation title. | Implemented | `src/renderer/src/status/FlowBar.tsx:159` |
| **PolishTextNotEditable / PolishTextFailed / PolishTextNoSelectionFirstTime / PolishTextNoSelection / PolishMaxWords / PolishTextNoChanges / PolishCancelled** | Transform fallback, busy, selection, 3,000-word, no-op, and cancellation states described above. | Implemented | `src/main/features/transforms.ts:130`<br>`src/main/features/transforms.ts:115`<br>`src/main/features/transforms.ts:102` |
| **PolishActivationNudge** | “Want to Transform this? Highlight and press {{shortcut}}.” | Implemented | `src/main/features/dictation.ts:634` |
| **VoidDictation** | No textbox; Copy fallback. | Implemented | `src/main/features/dictation.ts:558` |
| **UpdateSettingsConfirmation** | Confirms settings changed. | Offline equivalent — settings patch immediately and the visible control reflects the saved value; no cloud confirmation is required. | `src/renderer/src/hub/settings/SettingsDialog.tsx:101-140` |
| **FirstTransformCompletedOutsideFlow** | First transform celebration/configure CTA. | Implemented | `src/main/features/transforms.ts:142` |
| **PolishAutoEditReady** | Auto-polished dictation; Reveal edit. | Implemented | `src/main/features/dictation.ts:520` |
| **PressEnterCommandPrompt** | Voice submit education. | Implemented | `src/main/features/dictation.ts:622` |
| **PolishTimeout / PolishEmptyResponse / PolishTextboxDetectionFailed** | Timeout, empty LLM response, and missing editable field. | Implemented | `src/main/features/transforms.ts:95-98`<br>`src/main/features/transforms.ts:113-124` |
| **Debounce** | Hold rather than tap shortcut. | Implemented | `src/main/features/dictation.ts:171` |
| **DictationCancelledOtherShortcut** | Extra key cancelled start. | Implemented | `src/main/features/dictation.ts:188` |
| **SuggestPOPO** | Double-tap/start hands-free education. | Implemented | `src/main/features/dictation.ts:620` |
| **SuggestNotetaker / LongDictationNotetakerPrompt** | Long-capture cloud Notetaker upsell. | Implemented | `src/main/features/dictation.ts:155` |
| **Canto2Announcement** | Wispr cloud speech-model announcement. | Not applicable — Canto 2 is a proprietary Wispr cloud model. | — |
| **SuggestWiredMic** | Wired mic works best; Select microphone. | Implemented | `src/main/features/engines.ts:51-65` |
| **SuggestPasteLastText** | Shows paste-last shortcut. | Implemented | `src/main/features/dictation.ts:711` |
| **LanguageNotification** | Auto-detected output language; Open Settings. | Implemented | `src/main/features/dictation.ts:335` |
| **DisableMuteMusic** | Mute-all-audio education/Open Settings. | Implemented | `src/main/features/dictation.ts:632` |
| **UseHeyFlowForCommandMode** | Dedicated command-mode shortcut education. | Implemented | `src/main/features/dictation.ts:447` |
| **OnboardingContinueNudge / PostOnboardingCompleted** | Setup continuation/completion. | Implemented | `src/main/watchers.ts:93-105` |
| **TypingReminderEnabled / TypingReminderConfigure** | Reminder activation and appearance setup. | Implemented | `src/main/watchers.ts:85`<br>`src/main/watchers.ts:86` |
| **AirPodsWarning** | Bluetooth reliability warning. | Implemented | `src/main/features/engines.ts:60` |
| **MouseFlowDiscovery / MouseFlowDiscoveryReminder** | Mouse shortcut discovery and dismissal. | Implemented | `src/main/shortcuts.ts:109`<br>`src/main/shortcuts.ts:110` |
| **TranscriptCancelled** | “Transcript cancelled,” Undo. | Implemented | `src/main/features/dictation.ts:206` |
| **DictationDurationWarning / DictationMaxDurationReached** | One-minute warning and 20-minute stop/recovery. | Implemented | `src/main/features/dictation.ts:122`<br>`src/main/features/dictation.ts:124` |
| **WeeklyWordsLimitAlert** | Weekly cloud quota warning/bonus. | UI-only (cloud) — plans UI explains that all offline features are unlocked; no quota blocks dictation. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **CommandModeUpgradeToPro / CommandModeServersAreBusy** | Billing gate and service-busy failure. | Offline equivalent — no Pro gate; local CLI failures replace hosted server-busy errors. | `src/main/features/dictation.ts:482` |
| **PostOnboardingInAppDictation** | “Try using Flow in another app!” / don't dictate inside Flow. | Implemented | `src/main/features/dictation.ts:588` |
| **PostOnboardingFailedPaste** | Click a textbox, then dictate. | Implemented | `src/main/features/dictation.ts:582` |
| **PolishRunningWarning** | Dictation blocked while transform runs. | Implemented | `src/main/features/transforms.ts:89` |
| **MicrophonePermissionRevoked / WindowsMicPrivacyDisabled / AccessibilityPermissionRevoked** | OS permission recovery. | Implemented | `src/main/features/dictation.ts:311`<br>`src/main/features/dictation.ts:105` |
| **PasteFailed / PasteBlocked** | No textbox/manual shortcut and elevation block. | Implemented | `src/main/features/dictation.ts:582`<br>`src/main/features/dictation.ts:577` |
| **ProcessingDelayNotification** | Saved audio, dismiss forever. | Implemented | `src/main/features/dictation.ts:397` |
| **SmartFormattingList / Emails / Backtrack / FileTagging** | Discovery cards for each formatter. | Implemented | `src/main/features/dictation.ts:605`<br>`src/main/features/dictation.ts:599` |
| **SmartFormattingEmailsReminder / ListReminder / BacktrackReminder / FileTaggingReminder** | Compact success reminders. | Implemented | `src/main/features/dictation.ts:591-608` |
| **FeatureNotifDictionary / Snippets / Styles / StylesReminder / SnippetsReminder** | Dictionary, expansion, and style discovery; actions view/save/customize. | Implemented | `src/main/features/dictation.ts:611`<br>`src/main/features/dictation.ts:615`<br>`src/main/features/dictation.ts:624` |
| **MoveableFlowBarLaunchModal** | Movable-bar announcement. | Implemented | `src/main/features/dictation.ts:618` |
| **FocusModeActivated / FocusModeDeactivated / FocusModeBlocked** | Focus on/off/block feedback. | Implemented | `src/main/shortcuts.ts:50`<br>`src/main/watchers.ts:25` |
| **InternalDataSharingOn / InternalDataSharingOff** | Internal diagnostics sharing state; not needed in Murmur. | Not applicable — Wispr internal telemetry controls are excluded from the offline build. | — |
| **IncidentSlowDictationDegraded / IncidentSlowDictationOutage** | Cloud status incident notices with View status. | UI-only (cloud) — no desktop surface; hosted incident notices do not apply to local Whisper. | — |
| **DegradedNetwork** | Cloud connectivity degradation. | UI-only (cloud) — no desktop surface; local Whisper does not require dictation connectivity. | — |
| **TranslationDetectedNotification** | Translation detection notice. | Not applicable — its copy explicitly launches Notetaker live translation (“Translate live transcript”), so it belongs to the Notetaker translation surface rather than core dictation. | — |
| **Remaining billing/team/trial CTA notifications** | MobileCTA, TeamCTA, TeamInviteCTA, TeamTrial CTA variants, Pro/Basic upgrade, domain/admin join, Vocabulary/Snippets CTA, annual/grace/trial-extension/trial-end, referrals, leader… | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-65` |
| **Remaining Notetaker/meeting notifications** | All `Notetaker*`, `Meeting*`, `Recording*`, calendar/consent/conference/summary/import notifications in the same registry belong to meeting capture, not core dictation; their inve… | Not applicable — these rows belong to the Notetaker section, not Dictation core. | — |

## Data model

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **History primary key** | `transcriptEntityId` UUID/string uniquely identifies a dictation. | Implemented | `src/main/db.ts:7-31` |
| **History text stages** | `asrText`, `formattedText`, `editedText`, `toneMatchedText`, and `pastedText` preserve recognition, cleanup, user edit, tone match, and final insertion independently. | Implemented | `src/main/db.ts:7-31`<br>`src/main/db.ts:204-218` |
| **History candidate stages** | `defaultAsrText`, `fallbackAsrText`, `defaultFormattedText`, `fallbackFormattedText`, desired variants, fallback flags, and divergence scores support recovery/evaluation. | Offline equivalent — stores default/local and optional fallback stage columns; Flow scoring/divergence telemetry is excluded. | `src/main/db.ts:204-218` |
| **History capture context** | Audio BLOB, Opus chunks, screenshot, AX text/HTML, textbox contents, app, URL, additional context, conversation, platform, and microphone. | Offline equivalent — stores recoverable WAV path plus process/title/executable, URL, selected text and optional UIA text; screenshots/Opus/cloud context are excluded. | `src/main/db.ts:7-31`<br>`src/main/db.ts:204-218`<br>`src/main/features/dictation.ts:225-284` |
| **History result context** | Status, timestamps, duration, speech duration, word count, latency, language/detected language, confidence, origin, command (`ptt\|popo\|lens\|command`), formatting/personalization settings, correction/replacement counts, and paste/edit metadata. | Offline equivalent — stores local status, timing, word count, app, mode, languages, cleanup/replacement and paste metadata; Flow cloud evaluation fields are excluded. | `src/main/db.ts:7-31`<br>`src/main/db.ts:301-309` |
| **History lifecycle** | `needsUploading`, share type, archived flag, feedback, app version, retry/edit attempts, and AI-revert state. Murmur should keep upload/share local/off. | Offline equivalent — local archive, feedback, retry and AI-revert state are retained; upload/share lifecycle is excluded. | `src/main/db.ts:7-31`<br>`src/main/features/dictation.ts:685-692` |
| **Dictionary** | UUID, phrase, replacement/plain and HTML, team dictionary ID, last-used/use counts, manual/source/observed source, snippet/star/deleted flags, timestamps; unique phrase per team d… | Offline equivalent — local phrase/replacement/snippet/star/source/usage/timestamps are retained; team/cloud sync fields are excluded. | `src/main/db.ts:34-46` |
| **Polish** | UUID, initial/final text and counts, app, processing time, status, undo flag, instruction, model/provider, diff/feedback, prompt/shortcut, linked instruct history, sync/timestamps. | Offline equivalent — local transform runs retain input/output, app, status, latency, error and timestamp; provider/sync fields are excluded. | `src/main/db.ts:48-58` |
| **InstructHistory** | UUID and linked transcript/Polish IDs plus routing/classifier/tool/session/edit audit fields. | Offline equivalent — instruct provider/model/latency/status/route are stored on local dictation history rather than a cloud routing table. | `src/main/db.ts:305-309`<br>`src/main/features/dictation.ts:458-474` |
| **UserVoicePreferences** | UUID, preference text, optional filter, local-sync marker, timestamps. | Offline equivalent — style instructions are stored in local per-app settings rather than a cloud-synced table. | `src/shared/settings.ts:79-86`<br>`src/main/db.ts:291-298` |
| **UserContext** | Singleton ID with serialized writing samples and Polish prompts plus modified time. | Offline equivalent — writing samples and transform prompts are local settings/database context. | `src/shared/settings.ts:85-86`<br>`src/main/db.ts:285-290` |
| **UsageOutbox** | Transcript ID, owner, words/durations/timezone/app/platform/command/corrections/replacements/status and retry timestamps; cloud usage upload is unnecessary in Murmur. | Not applicable — cloud usage upload and billing metering are excluded offline. | — |
| **RemoteNotifications** | UUID, type/key/title/text, read/archive/sync flags and timestamps. | Not applicable — hosted notification synchronization does not apply offline. | — |
| **Notification counters** | Config stores `lastShownTime` and `numTimesShown` for every toast type to enforce max-count/frequency and one-time education. | Implemented | `src/main/toasts.ts:29-42` |

## Settings & defaults

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **`shouldMuteAudio` → `true`** | Mute all system playback while dictating. | Implemented | `src/shared/settings.ts:259` |
| **`shouldPauseAudio` → `false`** | Do not pause media instead; experimental alternative to mute. | Implemented | `src/shared/settings.ts:260` |
| **`streamAudio` → `false` (captured)** | No user-visible stream toggle; local Murmur should stream chunks only to local ASR. | Offline equivalent — capture streams PCM chunks only to Murmur’s local process/Whisper pipeline. | `src/renderer/src/capture/main.ts:27-74`<br>`src/main/features/dictation.ts:724-730` |
| **`shouldAutoLearnWords` → `true`** | Learn dictionary candidates from edits/context. | Implemented | `src/shared/settings.ts:264` |
| **`shouldOCRScreenCapture` → `false`** | Do not OCR the screen for dictation context. | Implemented | `src/shared/settings.ts:293` |
| **`enableSounds` → `true`** | Play dictation and notification sounds. | Implemented | `src/shared/settings.ts:257` |
| **`selectedSoundFolder` → `null`** | Use default sounds. | Implemented | `src/shared/settings.ts:258` |
| **`openAtLogin` → `true`** | Launch helper/bar at Windows sign-in. | Implemented | `src/shared/settings.ts:252` |
| **`hideFlowBarPermanently` → `false`** | Keep bar available. | Implemented | `src/shared/settings.ts:253` |
| **`statusDockEdge` → `bottom`** | Dock floating bar at bottom. | Implemented | `src/shared/settings.ts:255` |
| **`useAxContext` → `true`** | Read accessibility textbox/app context. | Implemented | `src/shared/settings.ts:291` |
| **`cursorIdeIntegration` → `false` (captured)** | Legacy integration flag off. | Not applicable — legacy Wispr integration plumbing is not reproduced. | — |
| **`ideFileTagging` → `true`** | Enable spoken Cursor/Devin file tags. | Implemented | `src/shared/settings.ts:288` |
| **`emailAutoSignature` → `false`** | Do not append signature. | Implemented | `src/shared/settings.ts:266` |
| **`emailSignatureOption` → `written_with_flow`** | Signature style if enabled. | Implemented | `src/shared/settings.ts:266` |
| **`selectedLanguages` → `[en]`** | Recognize English; auto-detect preference is represented by picker state/flags. | Implemented | `src/shared/settings.ts:245` |
| **`usedLanguages` → `[en]`** | Historical spoken language list. | Implemented | `src/shared/settings.ts:245` |
| **`overrideAudioDeviceId` → `null`** | Use ranking/auto-detect. | Implemented | `src/shared/settings.ts:243` |
| **`rankedAudioDevices` → Auto-detect first** | Prefer default device, then communications/physical devices. | Implemented | `src/shared/settings.ts:244` |
| **`defaultTranscriptionFormat` → `Apply AI formatting`** | Format rather than raw paste. | Offline equivalent — formatted mode is the default whenever no per-app raw override matches. | `src/shared/settings.ts:267` |
| **`appTranscriptionFormats` → `[]`** | No app overrides. | Implemented | `src/shared/settings.ts:267` |
| **`aiFormatting` → `true`** | Smart cleanup active. | Offline equivalent — Smart Formatting and light cleanup are enabled by default. | `src/shared/settings.ts:270` |
| **`autoCleanup.level` → `light`** | Light cleanup; migrated. | Implemented | `src/shared/settings.ts:269` |
| **`autoCleanup.diffShownCount` → `0`** | No cleanup diff education viewed. | Implemented | `src/shared/settings.ts:294` |
| **`internal.isToneMatchEnabled` → `false`** | Tone-match pipeline inactive. | Offline equivalent — the equivalent top-level `toneMatchingEnabled` default is false. | `src/shared/settings.ts:292` |
| **`internal.isAutoInstructEnabled` → `false`** | Do not auto-route ordinary dictation to instruct. | Implemented | `src/shared/settings.ts:347` |
| **`internal.instructPasteOnEmptyContext` → `false`** | Do not force instruct output into an empty field. | Implemented | `src/shared/settings.ts:348` |
| **`polishEnabled` → `true`** | Transform feature available. | Offline equivalent — the equivalent `transformsEnabled` default is true. | `src/shared/settings.ts:278` |
| **`polishAutoPaste` → `true`** | Insert successful transform automatically. | Offline equivalent — the equivalent `transformAutoPaste` default is true. | `src/shared/settings.ts:279` |
| **`autoPolishAfterDictation` → `{active:false,promptName:polish}`** | Auto-apply off, default transform Polish. | Offline equivalent — the equivalent local transform ID is `polish` and auto-apply defaults off. | `src/shared/settings.ts:280` |
| **`commandModeEnabled` → `false`** | Advanced command shortcut gated off. | Implemented | `src/shared/settings.ts:283` |
| **`pressEnterCommandEnabled` → `false`** | Spoken submit disabled. | Implemented | `src/shared/settings.ts:284` |
| **`processingDelayNotificationEnabled` → `true`** | Show saved-audio delay warning. | Offline equivalent — the equivalent `notifications.processingDelay` default is true. | `src/shared/settings.ts:261` |
| **`focusModeEnabled` → `false`** | Distracting-app/site blocking off. | Offline equivalent — the equivalent `focusMode.enabled` default is false. | `src/shared/settings.ts:286` |
| **`contextualNudge.mode` → `not_set`** | Typing reminder scope not chosen. | Implemented | `src/shared/settings.ts:295` |
| **`notificationSettings.tipsAndSuggestions` → `true`** | Permit feature education. | Offline equivalent — the equivalent `notifications.suggestions` default is true. | `src/shared/settings.ts:261` |
| **`notificationSettings.featureHighlights` → `true`** | Permit feature announcements. | Offline equivalent — the equivalent `notifications.announcements` default is true. | `src/shared/settings.ts:261` |
| **`notificationSettings.milestonesAndProgress` → `true`** | Permit word/streak milestones. | Offline equivalent — the equivalent `notifications.milestones` default is true. | `src/shared/settings.ts:261` |
| **`shortcuts` packaged Windows defaults** | Ctrl+Win PTT; Ctrl+Win+Space hands-free; Ctrl+Win+Alt Lens; Shift+Alt+Z paste last; Shift+Alt+X copy last; Esc cancel. | Implemented | `src/shared/settings.ts:227-242` |
| **`modifierShortcut` Windows default → `Alt`** | Base modifier recorded as virtual-key 164 in captured profile. | Not applicable — Murmur stores complete shortcut chords and has no separate legacy modifier metadata. | — |
| **Captured migrated shortcuts** | Caps Lock PTT; Escape cancel; Ctrl+Win+Space hands-free; Ctrl+Alt+Win Lens; Shift+Alt+Z paste last; Shift+Alt+X copy last; Win+M+Space Notetaker. | Offline equivalent — Murmur ships current Windows defaults; it does not reproduce one captured user profile migration. | `src/shared/settings.ts:227-242` |

# Hub pages

## Hub shell and sidebar

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Collapsible sidebar** | A top-left control toggles the navigation rail; its accessible label is “Toggle sidebar,” and the persisted window option reopens it in its previous open/closed state. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:71-73`<br>`src/renderer/src/hub/shell/Shell.tsx:111-123` |
| **Main navigation landmark** | The primary list is exposed as “Main navigation,” separate from the secondary/footer navigation. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:128-150` |
| **Home / Dictation item** | The redesigned label is “Home”; the legacy label is “Dictation.” It opens the dashboard and recent dictations. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:42-44`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **Notetaker item** | Labeled “Notetaker”; the sidebar can show it even before setup, but its meeting experience is outside this inventory. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:42-45`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **Insights item** | Labeled “Insights”; a “NEW” nudge can be shown once, tracked independently from the page. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:42-46`<br>`src/renderer/src/hub/shell/Shell.tsx:129-144` |
| **Dictionary item** | Labeled “Dictionary”; opens personal/team vocabulary management. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:42-47`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **Snippets item** | Labeled “Snippets”; opens spoken shortcut/expansion management. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:42-48`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **Style item** | Labeled “Style”; opens automatic cleanup and per-context writing-style controls. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:42-50`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **My Voice item** | Alternate/older label “My Voice”; opens app-to-style mappings and style instructions. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:48-50`<br>`src/renderer/src/hub/style/StyleExperience.tsx:121-135` |
| **Transforms item** | Labeled “Transforms”; opens the post-dictation rewrite feature. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:49-51`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **Scratchpad item** | Sidebar copy says “Scratchpad” while the route label key is historically “Notes”; opens the notes library. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:50-52`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **My Tasks item** | Labeled “My Tasks”; opens extracted and manually entered tasks when the Todos feature flag is enabled. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:51-53`<br>`src/renderer/src/hub/shell/Shell.tsx:129-145` |
| **Memory item** | Labeled “Memory”; appears only for eligible accounts/flags. | Offline equivalent — Local memory is built from on-device meetings, notes, and dictations. | `src/renderer/src/hub/shell/Shell.tsx:53-55`<br>`src/main/features/memory.ts:62-83` |
| **Extensions item** | “Extension”/“Extensions” labels exist for an optional route. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/Shell.tsx:146-149` |
| **Invite your team footer** | Opens team invitation/join flows; the footer item is explicitly labeled “Invite your team.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/Shell.tsx:155-159`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:13-29` |
| **Referral footer** | Displays “Refer a friend,” “Get a free month,” or campaign-specific “Earn a prize.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/Shell.tsx:160-163`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:33-47` |
| **Settings footer** | Labeled “Settings”; opens the Settings page, which is inventoried separately. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:164-168` |
| **Help footer** | Labeled “Help”; opens a categorized help popover. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:169-176`<br>`src/renderer/src/hub/shell/HelpMenu.tsx:29-45` |
| **Secondary navigation landmark** | Footer links are exposed as “Secondary navigation.” | Implemented | `src/renderer/src/hub/shell/Shell.tsx:155-177` |
| **Pro Trial plan pill** | Subscription state can add a “Pro Trial” pill beside account/sidebar affordances. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:51-65` |
| **Basic limit CTA** | Shows remaining weekly words or the at-limit message, with “Upgrade to Pro” and unlimited-access copy. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Trial countdown CTA** | Shows “Trial ends in” plus day count; Growth and Enterprise variants change the prefix. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:51-65` |
| **Annual-plan nudge** | “Save 20% with an annual subscription!” offers “Switch plans.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Past-due CTA** | “Payment past due” offers “Update payment”; team admins instead see “Update billing.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Grace-period CTA** | Warns that a trial ended and asks for billing info to retain team access. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Promo redemption CTA** | “Claim your … of Pro” supports day/month/year durations and opens a payment summary. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Student plan CTA** | “Free unlimited access for students” offers “Claim free plan,” with no card required. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Mobile CTA** | “Flow on mobile 📱” offers “Get the app” for iPhone or Android. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/AccountMenu.tsx:25-31` |
| **Team invitation CTA** | Presents inviter/team name, “Accept invite” and “Decline”; a billing dialog explains whether the joiner becomes admin or supplies billing. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:13-29` |
| **Domain team discovery CTA** | “Join {{teamName}}” reports coworkers on the same domain and can grant a new Pro trial. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:13-29` |
| **Join request CTA** | Admins can accept a named person’s request; UI distinguishes trial creation from immediate billing and reports success/failure. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:13-29` |
| **Team-up CTA** | “🤝 Team up” reports teammate count and offers “Create team.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:13-29` |
| **Team payment failure CTA** | Admins update billing; members can email one or more admins. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:13-29` |
| **Notetaker setup checklist card** | “Set up Notetaker” shows progress and per-item Done/Skipped states. | Implemented | `src/renderer/src/hub/shell/NotetakerChecklist.tsx:59-76` |
| **Checklist: tour** | “Try Notetaker” launches a “Take 2-min tour”; the item can be skipped and later unskipped. | Implemented | `src/renderer/src/hub/shell/NotetakerChecklist.tsx:9-14`<br>`src/renderer/src/hub/shell/NotetakerChecklist.tsx:30-33`<br>`src/renderer/src/hub/shell/NotetakerChecklist.tsx:78-94` |
| **Checklist: calendar** | “Connect calendar”; skipping prompts “Are you sure?” and explains easier joining and accurate teammate labels. | Offline equivalent — Local `.ics` import replaces account calendar connection. | `src/renderer/src/hub/shell/NotetakerChecklist.tsx:9-14`<br>`src/renderer/src/hub/shell/NotetakerChecklist.tsx:30-36`<br>`src/renderer/src/hub/shell/NotetakerChecklist.tsx:77-77` |
| **Checklist: import** | “Import your past meetings” / “Import from Granola or Otter.” | Offline equivalent — Local files import past meetings instead of provider account access. | `src/renderer/src/hub/shell/NotetakerChecklist.tsx:9-14`<br>`src/renderer/src/hub/shell/NotetakerChecklist.tsx:37-48` |
| **Checklist: MCP** | “Set up MCP”; skip confirmation explains that AI tools can search notes, answer questions, and take actions from calls. | Implemented | `src/renderer/src/hub/shell/NotetakerChecklist.tsx:9-14`<br>`src/renderer/src/hub/shell/NotetakerChecklist.tsx:35-36`<br>`src/renderer/src/hub/shell/NotetakerChecklist.tsx:77-77` |
| **Checklist completion** | Replaces progress with “All set!” and “Go crush your next meeting.” | Implemented | `src/renderer/src/hub/shell/NotetakerChecklist.tsx:51-56` |

## Top bar, account menu, theme, and notifications

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Sidebar toggle** | Always available from the frame with an accessible name, independent of the active page. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:57-73`<br>`src/renderer/src/hub/shell/Shell.tsx:121-123` |
| **Account button** | Avatar/control is labeled “Account” and opens account actions. | Implemented | `src/renderer/src/hub/shell/Shell.tsx:74-80`<br>`src/renderer/src/hub/shell/AccountMenu.tsx:15-34` |
| **Free-plan summary** | Account menu says “You are on Flow Free” and can show “{{wordsLeft}} words left this week.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/AccountMenu.tsx:21-27` |
| **Get Flow Pro** | Account menu provides “Get Flow Pro”; top-level upgrade copy also appears as “Get Pro” or “Get unlimited access.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/Shell.tsx:82-85`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Manage account** | Opens Wispr account management. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/shell/AccountMenu.tsx:21-27` |
| **Manage team** | Opens team administration for eligible users. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Refer a friend** | Opens referral rewards from the account menu. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/AccountMenu.tsx:25-27`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:33-47` |
| **Download Flow for mobile** | Opens mobile download/QR flow. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/AccountMenu.tsx:25-31` |
| **Theme selector** | “Theme” offers Light, Dark, and System. System follows the Windows color scheme. | Implemented | `src/renderer/src/hub/shell/AccountMenu.tsx:29-31`<br>`src/renderer/src/lib/settings.ts:50-52` |
| **Notification bell** | Bell is labeled “Notifications” and announces unread count (“Notifications, {{count}} unread”). | Implemented | `src/renderer/src/hub/shell/Shell.tsx:61-66`<br>`src/renderer/src/hub/shell/Shell.tsx:89-94` |
| **Notification center** | Modal title is “Notifications”; filters are “New” and “Archived.” | Implemented | `src/renderer/src/hub/shell/NotificationCenter.tsx:41-49`<br>`src/main/features/notifications.ts:18-33` |
| **Notification row actions** | Individual items can be archived from a “More actions” menu. | Implemented | `src/renderer/src/hub/shell/NotificationCenter.tsx:50-65`<br>`src/main/features/notifications.ts:29-32` |
| **Mark all read** | “Mark all as read” clears unread state; failures produce a dedicated toast. | Implemented | `src/renderer/src/hub/shell/NotificationCenter.tsx:24-31`<br>`src/renderer/src/hub/shell/NotificationCenter.tsx:42-49` |
| **Archive all** | “Archive all” moves current items; failures distinguish archive-all from a single-item archive. | Implemented | `src/renderer/src/hub/shell/NotificationCenter.tsx:33-39`<br>`src/renderer/src/hub/shell/NotificationCenter.tsx:42-49` |
| **Empty notification state** | “No notifications yet” / “You’ll see tips, milestones, and new features announcements here.” | Implemented | `src/renderer/src/hub/shell/NotificationCenter.tsx:68-70` |
| **Caught-up notification state** | “You’re all caught up!” / “We’ll ping you when there’s something exciting again.” | Implemented | `src/renderer/src/hub/shell/NotificationCenter.tsx:68-70` |
| **Shared-note notification expiry** | A notification can resolve to “This Note is no longer available.” | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | — (hosted notification behavior; no offline desktop surface) |

## Home

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Personal greeting** | Shows “Welcome back, {{firstName}}” or “Welcome back!”; gated/new wording uses “Welcome” instead. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:84-88` |
| **Return-to-dictation prompt** | “Hey {{firstName}}, get back into the flow with [shortcut]” embeds the current push-to-talk shortcut. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:87-88` |
| **Today’s dictations** | Main list heading is “Today’s dictations,” with date and “Yesterday’s dictations” variants. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:112-120`<br>`src/renderer/src/hub/home/DictationList.tsx:164-179` |
| **Dictation empty state** | “No dictations yet,” “Don’t type, just speak! Try our voice-to-text tool,” and “Try dictation.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:127-136` |
| **Incomplete setup gate** | “Complete setup to use dictation” can be closed; setup concerns microphone/accessibility configuration. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:91-96` |
| **History search on Home** | Search affordance uses “Search past transcripts,” loading text “Searching your history…,” and query-specific no-results copy. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:112-126`<br>`src/renderer/src/hub/pages/HomePage.tsx:127-135` |
| **Dictation grouping** | Entries are grouped by Today/Yesterday/date and display localized time; an unknown timestamp falls back to 12:00am. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:10-17`<br>`src/renderer/src/hub/home/DictationList.tsx:109-113`<br>`src/renderer/src/hub/home/DictationList.tsx:164-179` |
| **Entry transcript** | Each row presents final/formatted text; dismissed rows explicitly say the transcription was dismissed. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:20-24`<br>`src/renderer/src/hub/home/DictationList.tsx:109-113` |
| **Copy transcript** | Per-entry button “Copy transcript”; success is “Transcript copied,” empty and clipboard-failure cases have distinct toasts. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:45-54`<br>`src/renderer/src/hub/home/DictationList.tsx:115-117` |
| **Paste-last hint** | After copy, UI may remind users that the last transcript can also be pasted with the configured shortcut. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:45-54` |
| **Audio playback** | Play/Pause controls operate on stored dictation audio. Silent audio explains that Flow detected no words. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:20-24`<br>`src/renderer/src/hub/home/DictationList.tsx:56-69`<br>`src/renderer/src/hub/home/DictationList.tsx:115-119` |
| **14-day audio expiry** | Play, download, and retry each explain when audio is unavailable because it is older than 14 days. | Not applicable — Murmur keeps local audio according to the user’s local retention setting, not Wispr’s 14-day cloud expiry. | — |
| **Retry transcript** | “Retry transcript” estimates seconds/minutes, is disabled while dictating, and reports retry failure. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:71-78`<br>`src/renderer/src/hub/home/DictationList.tsx:118-120` |
| **Recover interruption** | Interrupted or cancelled dictations say Flow can retry; dismissed rows expose “Recover.” | Implemented | `src/renderer/src/hub/home/DictationList.tsx:20-24`<br>`src/renderer/src/hub/home/DictationList.tsx:118-120` |
| **Undo AI edit** | Entry menu offers “Undo AI edit,” restoring pre-formatting text. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:121-132`<br>`src/main/features/history.ts:78-86` |
| **Redo AI edit** | Entry menu offers “Redo AI edit” after a revert. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:121-132`<br>`src/main/features/history.ts:78-86` |
| **Delete transcript** | Confirmation says deletion cannot be recovered; action text is “Yes, delete it.” | Implemented | `src/renderer/src/hub/home/DictationList.tsx:131-143`<br>`src/main/features/history.ts:68-73` |
| **Archive transcript** | Internal/list behavior supports archived/unarchived states and corresponding toasts. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:121-132`<br>`src/main/features/history.ts:74-77` |
| **Send feedback** | Per-entry “Send feedback” opens “Report to Improve Model,” accepts expected output, and sends or reports failure. | Offline equivalent — model feedback is saved and exportable locally instead of being submitted to Wispr. | `src/renderer/src/hub/home/DictationList.tsx:89-101`<br>`src/renderer/src/hub/home/DictationList.tsx:144-155`<br>`src/main/features/history.ts:102-121` |
| **Internal report form** | Internal builds can submit ASR text, desired formatted text, bug comments, and optionally accessibility screen context. | Not applicable — Wispr staff-only model diagnostics are excluded. | — |
| **Extract audio** | Internal overflow action saves the dictation audio when retained. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:121-132`<br>`src/main/features/history.ts:94-100` |
| **Open AX inspector** | Internal overflow action opens saved accessibility context in a separate inspector and can fail with a toast. | Offline equivalent — saved accessibility context opens in a local inline dialog; the Wispr staff inspector and reporting path are excluded. | `src/renderer/src/hub/home/DictationList.tsx:121-132`<br>`src/renderer/src/hub/home/DictationList.tsx:157-159` |
| **History disabled state** | Organization policy or “never store data” replaces the list with “History disabled” and policy-specific explanation. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:121-124` |
| **Total words tile** | Dashboard stat is labeled “total words.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:140-145` |
| **Average WPM tile** | Dashboard stat is labeled “wpm,” computed from word and speech duration totals. | Implemented | `src/main/features/stats.ts:56-64`<br>`src/main/features/stats.ts:109-123`<br>`src/renderer/src/hub/pages/HomePage.tsx:140-145` |
| **Daily/weekly streak tile** | Dashboard supports “day streak” and “week streak.” | Implemented | `src/main/features/stats.ts:81-102`<br>`src/renderer/src/hub/pages/HomePage.tsx:140-145` |
| **Top apps tile** | “Get back into your Flow” lists apps used for dictation; empty copy asks the user to start using Flow in any app. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:158-165` |
| **Weekly word-limit card** | Shows words left, warns near/at the limit, notes the Sunday 12 a.m. PT reset, and says the limit applies to dictation rather than Notetaker. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Voice Profile home card** | States include locked (“Discover your unique insights”), unlocked, new report, update ready, unavailable, and words remaining until generation/update. | Offline equivalent — the local card exposes locked, generate, ready, regenerate, and words-remaining states without hosted notification states. | `src/renderer/src/hub/pages/HomePage.tsx:147-156`<br>`src/main/features/stats.ts:128-147` |
| **Voice Profile insufficient data** | “Not enough data to refresh your profile” and locally stored word counts explain how many more words are needed. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:147-155` |
| **Home redesign announcement** | “Home has a new look” points out access to upcoming meetings/past notes and offers “Check it out.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:23-31`<br>`src/renderer/src/hub/pages/HomePage.tsx:98-110` |
| **First-use banner** | “Hold down [PTT] to dictate” says Flow works in email, messages, docs, and anywhere else. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:23-31`<br>`src/renderer/src/hub/pages/HomePage.tsx:98-110` |
| **Try another app banner** | “Flow works anywhere you type” with “Get started.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:23-31`<br>`src/renderer/src/hub/pages/HomePage.tsx:98-110` |
| **Post-onboarding dialog** | Asks “How would you like to use Flow first?” through typing-location choices and persists the selected use cases. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:71-73`<br>`src/renderer/src/hub/pages/HomePage.tsx:176-190` |
| **Use case: Chat with AI** | “Ask questions and ideate quickly.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Use case: Prompt Cursor or Devin** | “Ship code hands-free.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Use case: Draft an email** | “Get through your inbox faster.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Use case: Write a message** | “Stay in touch without typing.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Use case: Take a note** | “Capture thoughts and to-dos.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Use case: Write a document** | “Move long-form work forward.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Use case: Write a post or comment** | “Share updates effortlessly.” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Use case: Something else** | Generic exploration choice. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:12-20`<br>`src/renderer/src/hub/pages/HomePage.tsx:183-188` |
| **Resurrected-user dialog** | “Welcome back to Flow, You’ve been missed!” then asks what Flow can help with, accepts free text, and ends at “Let’s Flow!” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:69-70`<br>`src/renderer/src/hub/pages/HomePage.tsx:192-204` |
| **Welcome-back chooser** | Returning users are told “A lot has changed… Pick one to try first,” with voice-model and Notetaker cards. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:192-203` |
| **Canto 2 reveal** | “Your voice, upgraded” announces access to a named model and benefits for noise, languages, names, and specialized terms. | Not applicable — Canto 2 is a proprietary Wispr cloud model. | — |
| **Canto 2 technical details** | Expandable material explains real-world word error rate, multilingual evaluation, hard-term recall, false flips, dictionary capacity, and research link. | Not applicable — Canto 2 is a proprietary Wispr cloud model. | — |

## History

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Full dictation archive** | Page lists all retained dictations across apps rather than only today’s Home slice. | Implemented | `src/renderer/src/hub/pages/HistoryPage.tsx:9-29` |
| **History search** | Searches past transcript text with loading and no-results states. | Implemented | `src/renderer/src/hub/pages/HistoryPage.tsx:9-28`<br>`src/main/features/history.ts:53-63` |
| **Today/Yesterday sections** | Entries are grouped under relative headings and older dates. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:10-17`<br>`src/renderer/src/hub/home/DictationList.tsx:164-179` |
| **Source app context** | History records app and URL so rows can identify where the dictation occurred. | Implemented | `src/main/db.ts:209-217`<br>`src/renderer/src/hub/home/DictationList.tsx:103-114` |
| **Transcript variants** | Records preserve raw ASR, formatted, edited, tone-matched, fallback, and server-finalized text for retry/revert diagnostics. | Offline equivalent — Murmur preserves raw, formatted, edited, pasted, and revert state used by its local pipeline. | `src/main/db.ts:7-30`<br>`src/renderer/src/hub/home/DictationList.tsx:20-24` |
| **Audio controls** | Stored microphone and built-in audio support playback, extraction, and retry while retention permits. | Offline equivalent — locally retained microphone audio supports playback, export, and retry; cloud built-in audio does not apply. | `src/renderer/src/hub/home/DictationList.tsx:56-78`<br>`src/renderer/src/hub/home/DictationList.tsx:115-128`<br>`src/main/features/history.ts:88-100` |
| **Row status** | Empty, interrupted, dismissed, failed microphone, archived, and successfully formatted states have distinct UI. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:20-24`<br>`src/renderer/src/hub/home/DictationList.tsx:109-119` |
| **Overflow menu** | Delete, retry, undo/redo AI edit, extract audio, open AX inspector, and internal row-data views are available conditionally. | Implemented | `src/renderer/src/hub/home/DictationList.tsx:118-143`<br>`src/renderer/src/hub/home/DictationList.tsx:144-159` |
| **History row inspector** | Internal dialog has Dictation/Instruct tabs, loading/failure states, and full source details. | Not applicable — Wispr staff-only dictation diagnostics are excluded. | — |
| **Feedback state** | Stored feedback supports positive/negative or report text tied to the transcript. | Offline equivalent — report text and expected output are stored with the local transcript; cloud positive/negative model feedback is not submitted. | `src/renderer/src/hub/home/DictationList.tsx:89-101`<br>`src/main/features/history.ts:102-121` |

## Insights

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Insights tabs** | Current variants expose “Your Flow,” “Your usage,” “Your voice,” and “Leaderboard.” | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:219-229` |
| **Header snapshot** | Legacy stats header reads “You’ve been Flowing. Hard.” with a personal productivity subtitle. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:220-224` |
| **Your usage overview** | Combines total words, dictation speed, streak, and where dictation happens. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:84-131` |
| **Total words dictated** | Splits Desktop and Mobile totals, shows this-month percentage and comparison with the same point last month. | Offline equivalent — this Windows clone reports desktop totals and local month comparisons; it has no mobile client. | `src/renderer/src/hub/pages/InsightsPage.tsx:77-79`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:101-106` |
| **Word-count fun facts** | Converts totals into equivalents such as tweets, postcards, essays, cover letters, articles, book chapters, scripts, manuals, newsletters, podcast seasons, or books. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:15-22`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:101-106` |
| **No-word state** | “You’ve written nothing yet—start dictating!” | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:84-87` |
| **WPM gauge** | Displays words per minute and compares against global typing speeds. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:80-94` |
| **WPM percentile copy** | Can say faster than 90/95/97% of typers or top 5/3/2/1% of Flow users. | Offline equivalent — Murmur compares against bundled typing-speed baselines rather than Wispr cloud percentiles. | `src/renderer/src/hub/pages/InsightsPage.tsx:12-12`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:80-94` |
| **Low-data WPM state** | “Use Flow more to see your WPM improve.” | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:87-94` |
| **Corrections tile** | Separates filler/grammar “words corrected” from “dictionary fixes,” including counts and tooltips. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:96-100`<br>`src/main/features/stats.ts:53-64` |
| **Desktop usage** | Shows total apps used and app-level usage. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:107-115` |
| **Usage categories** | Classifies activity as AI prompts, Documents, Emails, Personal messages, Work messages, or Other tasks. | Implemented | `src/shared/apps.ts:6-18`<br>`src/shared/apps.ts:71-78`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:107-115` |
| **Usage intensity** | Labels Light, Moderate, or Power usage. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:80-95` |
| **Most-used app** | Highlights the top application with “This is where your ideas come to life.” | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:107-110` |
| **Total apps flowed** | Progress taglines range from trying Slack/Docs/Notion to “always in flow state.” | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:107-110` |
| **Daily streak** | Shows current and longest daily streak; zero-state invites the user to start one. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:24-32`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:117-130` |
| **Weekly streak** | Shows consecutive active weeks with milestone-specific encouragement. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:24-32`<br>`src/main/features/stats.ts:96-102` |
| **Activity heatmap** | Calendar grid uses day/month labels, Less/More legend, earlier/later navigation, and hover totals for words/top app/apps used. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:117-130` |
| **Streak milestone copy** | Daily milestones have bespoke messages from day one through one year and beyond; weekly milestones cover welcome through “Flow legend.” | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:24-32`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:117-130` |
| **Voice Profile generation** | “Generate profile” / “Regenerate profile,” with building, ready, failed, notification-ready, and next-update progress states. | Offline equivalent — local generation exposes locked, building, ready, failure, regenerate, and word-progress states without hosted notification delivery. | `src/renderer/src/hub/pages/InsightsPage.tsx:154-186`<br>`src/main/features/stats.ts:128-152`<br>`src/main/features/stats.ts:167-187` |
| **Voice Profile privacy statement** | UI claims dictations are private, only stored locally, and the report is based on local data. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:166-174`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:188-192` |
| **Voice Profile summary** | Generated narrative describes the user’s speaking/writing character and exposes its creation date. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:177-186`<br>`src/main/features/stats.ts:167-187` |
| **Persona** | Visual persona vocabulary includes analysis, brainstorm, coding, collaboration, deep thought, leadership, long writing, multilingual, on-the-go, presenting, reporting, support, an… | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:177-185` |
| **Catchphrase** | Generated profile selects a recurring phrase, with placeholders/fallbacks before data exists. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/main/features/stats.ts:150-180`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:188-190` |
| **Most-used word** | Profile displays the most frequent notable word. | Implemented | `src/main/features/stats.ts:153-160`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:188-190` |
| **Most-corrected word** | Profile displays the term most often removed/corrected. | Implemented | `src/main/features/stats.ts:171-184`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:188-190` |
| **Peak time and place** | Profile identifies when and in what app/context the user dictates most. | Implemented | `src/main/features/stats.ts:160-166`<br>`src/main/features/stats.ts:171-184`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:188-190` |
| **Milestone locks** | Profile fields can remain locked until the next word milestone; the UI displays words until unlock/update. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:166-174`<br>`src/main/features/stats.ts:128-147` |
| **Share insights** | Share control offers “Copy image” and cards titled Flow Highlights, Flow Streak, Flow Superlatives, How fast you Flow, Total words dictated, When/Where you Flow, and Your Voice Pr… | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:13-14`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:35-72`<br>`src/renderer/src/hub/pages/InsightsPage.tsx:209-233` |
| **For-you meeting analytics** | Optional redesign charts meeting time by topic over the last five weeks, recorded count, average duration, and people with most shared time. | Offline equivalent — Murmur analyzes on-device meetings with the configured local CLI. | `src/renderer/src/hub/pages/InsightsPage.tsx:132-149`<br>`src/main/features/stats.ts:206-230`<br>`src/main/features/stats.ts:250-265` |
| **Meeting topic locks** | Explains that topics appear after analysis or after recording a stated number of additional meetings. | Implemented | `src/renderer/src/hub/pages/InsightsPage.tsx:132-136` |
| **Cloud Sync warning** | Insights can warn that profile/usage accuracy is reduced with Private Cloud Sync off; admin/HIPAA states have separate messages. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sync warning has no offline desktop surface) |
| **Team leaderboard** | Sorts/ranks team members by total words, desktop/mobile words, WPM, and current daily streak; supports This week, Past weeks, All time, pagination, and “Jump to me.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/InsightsPage.tsx:224-229` |
| **Leaderboard refresh** | Explicitly says team leaderboard refreshes hourly. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/InsightsPage.tsx:224-229` |
| **Leaderboard empty/error states** | Handles no usage, missing account/rank, load failures, and retry. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/pages/InsightsPage.tsx:224-229` |
| **Leaderboard team gates** | Offers Create team, Invite team members, Request to join, Open team settings, or Enterprise upgrade. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/InsightsPage.tsx:224-229` |
| **Leaderboard share** | Generates team/all-week share text. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/InsightsPage.tsx:224-229` |

## Dictionary

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Vocabulary list** | “Dictionary” stores words Flow should recognize, including names, jargon, and uncommon terms. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:58-85`<br>`src/main/features/dictionary.ts:88-100` |
| **Add word** | “Add new” opens “Add to vocabulary” with a word field and “Add word.” | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:58-63`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:124-137` |
| **Correction rule** | “Correct a misspelling” adds incorrect→correct replacement behavior and explains automatic substitution during dictation. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:124-138`<br>`src/main/features/dictionary.ts:65-85` |
| **Edit word/replacement** | Edit dialog distinguishes “Edit word” from “Edit replacement,” with Cancel/Save changes. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:124-137` |
| **Delete word** | Personal/team/department/organization confirmation titles explain permanent deletion. | Offline equivalent — local permanent deletion and singular/plural confirmation are implemented; team/department variants do not apply. | `src/renderer/src/hub/vocab/VocabPage.tsx:76-88`<br>`src/main/features/dictionary.ts:125-128` |
| **Star word** | Rows can be starred/unstarred and sorted starred-first. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:13-16`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:77-83`<br>`src/main/features/dictionary.ts:101-123` |
| **Auto-learned indicator** | Sparkle tooltip says “Flow learned this word automatically.” | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:77-83` |
| **Search vocabulary** | Placeholder “Search your vocabulary”; empty state says no matching words. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:66-85`<br>`src/main/features/dictionary.ts:91-99` |
| **Sort vocabulary** | Newest first, Oldest first, Alphabetical A–Z, or Starred first. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:13-16`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:66-71`<br>`src/main/features/dictionary.ts:25-30` |
| **Import** | “Import” enters bulk dictionary import. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:36-44`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:58-63` |
| **Sync status** | Manual sync and “Dictionary last synced {{relativeTime}}” are shown for account-backed sync. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Bulk selection** | Bulk toolbar can delete selected words or share count with team/department. | Offline equivalent — local multi-select and bulk delete are implemented; hosted team/department sharing is unavailable. | `src/renderer/src/hub/vocab/VocabPage.tsx:74-88` |
| **Bulk delete** | Singular/plural confirmation and success/failure toasts. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:46-49`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:74-88` |
| **Share with team** | Moves/shares personal words to team vocabulary; disabled tooltip directs users to set up a team. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Department/organization scope** | Department-scoped and whole-organization badges/tooltips distinguish who receives vocabulary. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Admin approval** | Shared-dictionary approval can leave words pending while they remain personal; dedicated pending/failure/success messages exist. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Duplicate protection** | Detects existing personal/team/department words and correction collisions. | Offline equivalent — local phrase and correction collisions are rejected; hosted team/department collisions do not apply. | `src/main/features/dictionary.ts:65-80`<br>`src/main/features/dictionary.ts:101-122` |
| **Validation** | Empty word is rejected; unchanged edit reports “No changes made.” | Implemented | `src/main/features/dictionary.ts:65-74`<br>`src/main/features/dictionary.ts:101-116` |
| **Organization-disabled state** | Warns that shared Dictionary is disabled while saved personal words still apply. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Dictionary education banner** | Explains corrections apply to dictations and meeting notes and offers “Add new word.” | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:93-95` |

## Snippets

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Snippet list** | “Snippets” stores a spoken trigger and its expansion for repeated email, link, address, bio, or prompt text. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:58-85`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:97-99` |
| **Add snippet** | “Add new” opens “Add snippet” with trigger and Expansion fields. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:58-63`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:124-137` |
| **Expansion length counter** | Editor displays current/max characters and rejects overlong expansions. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:137-158`<br>`src/main/features/dictionary.ts:65-73` |
| **Required pair validation** | Both snippet and expansion are required. | Implemented | `src/main/features/dictionary.ts:65-72`<br>`src/main/features/dictionary.ts:101-109` |
| **Similar-trigger warning** | Add/update succeeds but warns when the trigger is similar to an existing snippet and recommends distinct phrases. | Implemented | `src/main/features/dictionary.ts:32-38`<br>`src/main/features/dictionary.ts:75-85`<br>`src/main/features/dictionary.ts:118-123` |
| **Edit snippet** | Dialog supports editing and “Save changes.” | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:124-137` |
| **Delete snippet** | Personal/team/department/organization confirmation variants explain permanent deletion. | Offline equivalent — local permanent deletion and singular/plural confirmation are implemented; team/department variants do not apply. | `src/renderer/src/hub/vocab/VocabPage.tsx:74-88`<br>`src/main/features/dictionary.ts:125-128` |
| **Search snippets** | Placeholder “Search your snippets”; empty state says none were found. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:66-85`<br>`src/main/features/dictionary.ts:91-99` |
| **Sort snippets** | Newest, Oldest, or Alphabetical A–Z. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:13-16`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:66-71`<br>`src/main/features/dictionary.ts:25-30` |
| **Import snippets** | Separate bulk import entry point. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:36-44`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:58-63` |
| **Sync status** | Manual sync and last-synced tooltip. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Bulk actions** | Delete or share selected snippets with team/department, with singular/plural states. | Offline equivalent — local multi-select and bulk delete are implemented; hosted team/department sharing is unavailable. | `src/renderer/src/hub/vocab/VocabPage.tsx:74-88` |
| **Shared attribution** | Tooltips show shared with team/department/org and optionally “by {{name}}” or “by you.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Admin approval** | Pending shared snippets remain personal until approval. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Organization-disabled state** | Warns shared Snippets are disabled while saved snippets still apply. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/vocab/VocabPage.tsx:62-75` |
| **Example snippets** | Education banner demonstrates “intro email,” “my LinkedIn,” “rewrite prompt,” “company intro,” and “support message.” | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:97-99` |
| **Rich-text snippets** | Feature flag enables HTML expansion storage (`replacementHtml`) alongside plain expansion. | Implemented | `src/main/db.ts:311-313`<br>`src/main/features/dictionary.ts:40-62`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:137-156` |

## Style and My Voice

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Style page** | Title “Style” with tabs Auto cleanup, Work messages, Email, Personal messages, and Other. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:27-38` |
| **Auto cleanup explanation** | Says the selected cleanup applies automatically to every dictation across all apps and original text remains recoverable via Undo AI edit. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:144-149` |
| **Cleanup None** | Transcribes exactly what was said, including mistakes. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:20-24`<br>`src/renderer/src/hub/style/StyleExperience.tsx:144-149` |
| **Cleanup Light** | Removes filler words and fixes grammar. This is the captured default. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:20-24`<br>`src/shared/settings.ts:272-278`<br>`src/renderer/src/hub/style/StyleExperience.tsx:144-149` |
| **Cleanup Medium** | Edits for clarity and conciseness. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:20-24`<br>`src/renderer/src/hub/style/StyleExperience.tsx:144-149` |
| **Cleanup High** | Rewrites for brevity and polish. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:20-24`<br>`src/renderer/src/hub/style/StyleExperience.tsx:144-149` |
| **Context tabs** | Each style explicitly states the app family it applies to: workplace messengers, major email apps, personal messengers, or all others. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:10-15`<br>`src/renderer/src/hub/style/StyleExperience.tsx:27-36`<br>`src/renderer/src/hub/style/StyleExperience.tsx:56-65` |
| **Formal style** | “Caps + Punctuation,” demonstrated with context-specific previews. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:16-19`<br>`src/renderer/src/hub/style/StyleExperience.tsx:47-61` |
| **Casual style** | “Caps + Less punctuation.” | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:16-19`<br>`src/renderer/src/hub/style/StyleExperience.tsx:47-61` |
| **Very casual style** | “No Caps + Less punctuation.” | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:16-19`<br>`src/renderer/src/hub/style/StyleExperience.tsx:47-61` |
| **Excited style** | “More exclamations.” | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:16-19`<br>`src/renderer/src/hub/style/StyleExperience.tsx:47-61` |
| **Gen Z style** | No caps plus slang, available in the personal style set. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:41-48`<br>`src/renderer/src/hub/style/StyleExperience.tsx:56-61` |
| **English-only disclaimer** | Style formatting currently says it applies only in English, with more languages coming. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:66-78` |
| **Personalization wizard** | “Let’s personalize Flow to you” walks work messages, emails, personal messages, and other apps, then says “You’re all set!” | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:156-173` |
| **My Voice page** | “How you sound in different contexts” lists built-in and custom voice styles. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:81-98`<br>`src/renderer/src/hub/style/StyleExperience.tsx:121-128` |
| **Style-to-app mapping** | “Automatically apply in these apps or websites”; includes an “All other apps” bucket. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:56-65`<br>`src/renderer/src/hub/style/StyleExperience.tsx:121-135` |
| **Style editor** | Supports style name, preferred style, edit/cleanup level, instructions, and delete. | Implemented | `src/renderer/src/hub/style/StyleExperience.tsx:81-120`<br>`src/renderer/src/hub/style/StyleExperience.tsx:128-135` |
| **Custom style prompts** | UI marks custom style prompts as “coming soon” in this build. | Offline equivalent — custom per-context and named-style instructions are fully editable and applied locally rather than marked coming soon. | `src/renderer/src/hub/style/StyleExperience.tsx:66-75`<br>`src/renderer/src/hub/style/StyleExperience.tsx:128-135` |

## Transforms

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Transforms page** | Title “Transforms,” Beta badge, master toggle, and education copy that transforms text to sound however the user wants. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/transforms/TransformExperience.tsx:32-41`<br>`src/main/features/transforms.ts:43-47` |
| **Transform master toggle** | Disabling turns off one-shortcut rewriting and resets shortcuts to default. | Implemented | `src/renderer/src/hub/transforms/TransformExperience.tsx:20-33`<br>`src/main/features/transforms.ts:83-90` |
| **Built-in Polish transform** | Improves clarity and conciseness while aiming to preserve the user’s voice. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/shared/settings.ts:178-187`<br>`src/main/features/transforms.ts:25-40` |
| **Built-in Prompt Engineer** | Converts messy spoken thoughts into a structured, optimized AI prompt. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/shared/settings.ts:188-197`<br>`src/main/features/transforms.ts:25-40` |
| **Default rewrite rules** | Make concise, maintain tone, reword for clarity, reorder for readability, and add structure; individual defaults are selectable. | Implemented | `src/shared/settings.ts:168-186`<br>`src/renderer/src/hub/transforms/TransformExperience.tsx:64-71` |
| **Additional capabilities** | Copy advertises translating to any language and optimizing text for an LLM. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/transforms/TransformExperience.tsx:45-61`<br>`src/main/features/transforms.ts:25-47` |
| **My Transforms** | Custom transforms appear under “My Transforms”; “Create New” / “Create your own” uploads a prompt. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/transforms/TransformExperience.tsx:32-40`<br>`src/renderer/src/hub/transforms/TransformExperience.tsx:45-61` |
| **Custom transform editor** | Requires a name and transformation prompt, with placeholder examples like “Boss Mode.” | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/transforms/TransformExperience.tsx:45-61` |
| **Custom rules** | Polish prompt accepts additional rules; duplicate rule text is rejected. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/transforms/TransformExperience.tsx:64-71`<br>`src/main/features/transforms.ts:25-40` |
| **Keyboard shortcut** | Each transform can have a shortcut; UI says “Choose a keyboard shortcut” and “to use.” | Implemented | `src/renderer/src/hub/transforms/TransformExperience.tsx:45-61` |
| **Auto Apply After Dictation** | Runs a chosen transform on every dictation before paste; transform selector is disabled until Auto Apply is on. | Implemented | `src/renderer/src/hub/transforms/TransformExperience.tsx:32-35`<br>`src/main/features/dictation.ts:597-601` |
| **Try-it-yourself control** | Input says “Try ‘Make me sound like a CEO’ or select a prompt,” with send and writing-example upload actions. | Implemented | `src/renderer/src/hub/transforms/TransformExperience.tsx:74-80` |
| **Writing samples** | Add/edit modal accepts sample emails/messages/docs, enforces a minimum word count, and shows current/max words. | Offline equivalent — local samples enforce 50–2,000 words and are saved on-device; there is no separate hosted sample manager. | `src/renderer/src/hub/transforms/TransformExperience.tsx:64-71`<br>`src/renderer/src/hub/transforms/TransformExperience.tsx:74-80` |
| **Before/after preview** | Labels Original and Polish, with example source and transformed text. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/transforms/TransformExperience.tsx:74-80` |
| **Diff viewer** | “See changes” opens a diff; actions include copy, thumbs up/down, accept edits, undo, retry, and bad/good result feedback. | Implemented | `src/renderer/src/hub/transforms/TransformExperience.tsx:74-80`<br>`src/renderer/src/hub/transforms/DiffDialog.tsx:8-18` |
| **Transform completion coachmark** | After highlighting text and pressing the shortcut, says “Transformed!” and teaches See changes or Undo. | Implemented | `src/main/features/transforms.ts:110-149` |
| **Processing/error states** | “Done,” see changes, retry/regenerate errors, failed save, and reset success. | Implemented | `src/main/features/transforms.ts:56-70`<br>`src/main/features/transforms.ts:110-148`<br>`src/renderer/src/hub/transforms/TransformExperience.tsx:20-20` |
| **Reset defaults** | Confirmation restores built-ins and removes all custom transforms. | Implemented | `src/renderer/src/hub/transforms/TransformExperience.tsx:20-20`<br>`src/renderer/src/hub/transforms/TransformExperience.tsx:36-41`<br>`src/main/features/transforms.ts:162-170` |

## Scratchpad window

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Separate Scratchpad window** | Notes can open in a compact standalone Electron window independent of the hub. | Implemented | `src/main/features/notes.ts:131-149`<br>`src/renderer/src/scratchpad/App.tsx:129-143` |
| **Compact/expand controls** | User can “Compact window” or “Expand window.” | Implemented | `src/renderer/src/scratchpad/App.tsx:129-137` |
| **Sidebar collapse** | “Collapse Notes” hides the recent-notes rail. | Implemented | `src/renderer/src/scratchpad/App.tsx:129-152` |
| **Tabs** | Supports multiple note tabs; tab strip has an accessibility label and “New tab (⌘T)” copy (platform rendering should become Ctrl+T on Windows). | Implemented | `src/renderer/src/scratchpad/App.tsx:49-54`<br>`src/renderer/src/scratchpad/App.tsx:61-69`<br>`src/renderer/src/scratchpad/App.tsx:138-143` |
| **New note** | Creates a local note; empty library says “No notes yet.” | Implemented | `src/renderer/src/scratchpad/App.tsx:88-88`<br>`src/renderer/src/scratchpad/App.tsx:145-152`<br>`src/main/features/notes.ts:85-105` |
| **Recent notes** | Sidebar lists recent notes and loads additional pages with “Load more.” | Implemented | `src/renderer/src/scratchpad/App.tsx:41-42`<br>`src/renderer/src/scratchpad/App.tsx:145-152` |
| **Search notes** | Search field, clear action, and “No matching notes.” | Implemented | `src/renderer/src/scratchpad/App.tsx:41-42`<br>`src/renderer/src/scratchpad/App.tsx:145-152`<br>`src/main/features/notes.ts:167-173` |
| **Rich-text editor** | Supports Bold, Italic, Underline, blockquote, inline code, bullet list, numbered list, checklist, link, and table. | Implemented | `src/renderer/src/scratchpad/RichEditor.tsx:155-171` |
| **Link dialog** | Text and URL fields with Apply, Remove, and Cancel. | Implemented | `src/renderer/src/scratchpad/RichEditor.tsx:86-109`<br>`src/renderer/src/scratchpad/RichEditor.tsx:171-177` |
| **Table editing** | Insert row above/below, insert column left/right, delete row/column/table. | Implemented | `src/renderer/src/scratchpad/RichEditor.tsx:137-153`<br>`src/renderer/src/scratchpad/RichEditor.tsx:166-169` |
| **Image attachment** | Drop zone says “Drop images to attach”; images are stored with dimensions, content type, and byte size. | Implemented | `src/renderer/src/scratchpad/RichEditor.tsx:110-136`<br>`src/renderer/src/scratchpad/RichEditor.tsx:171-172`<br>`src/main/features/notes.ts:237-255` |
| **Dictate into note** | Editor exposes “[PTT] to dictate.” | Implemented | `src/renderer/src/scratchpad/App.tsx:153-164` |
| **Formatting menu** | “Formatting” toggle exposes rich-text commands. | Implemented | `src/renderer/src/scratchpad/App.tsx:159-168`<br>`src/renderer/src/scratchpad/RichEditor.tsx:155-170` |
| **Copy** | Copies note content and confirms “Copied to clipboard.” | Implemented | `src/renderer/src/scratchpad/App.tsx:109-110`<br>`src/renderer/src/scratchpad/App.tsx:162-165` |
| **Delete note** | Deletes with “Note deleted” success or “Failed to delete note.” | Implemented | `src/renderer/src/scratchpad/App.tsx:177-195`<br>`src/main/features/notes.ts:180-184` |
| **Transforms panel** | “Transforms” accepts “Follow up or ask a question,” submits with Enter/shortcut, can regenerate suggestions, and reports failure. | Implemented | `src/renderer/src/scratchpad/App.tsx:111-127`<br>`src/renderer/src/scratchpad/App.tsx:177-183`<br>`src/main/features/notes.ts:194-225` |
| **Message preview** | Optional preview shows how a note/message will appear before sending. | Implemented | `src/renderer/src/scratchpad/App.tsx:153-167` |
| **Send to active app** | “Send in {{appName}}” inserts/sends note content into the detected application. | Implemented | `src/renderer/src/scratchpad/App.tsx:169-174`<br>`src/main/features/notes.ts:227-235` |
| **Version history** | Lists Created, Dictated, Typed edits, Transform, and Custom transform versions; supports loading/empty states. | Implemented | `src/renderer/src/scratchpad/App.tsx:12-14`<br>`src/renderer/src/scratchpad/App.tsx:71-78`<br>`src/renderer/src/scratchpad/App.tsx:177-184` |
| **Close** | Dedicated Close control dismisses the window. | Implemented | `src/renderer/src/scratchpad/App.tsx:129-136` |

## Notes library and sharing

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Scratchpad library page** | Hub page title is “Scratchpad” with a Beta badge, search, recent/pinned notes, and new note. | Implemented | `src/renderer/src/hub/pages/ScratchpadPage.tsx:40-43`<br>`src/renderer/src/hub/pages/ScratchpadPage.tsx:50-75`<br>`src/renderer/src/hub/pages/ScratchpadPage.tsx:76-113` |
| **Grid/list preference** | Notes page persists its view type; captured value is grid. | Implemented | `src/shared/settings.ts:354-357`<br>`src/renderer/src/hub/pages/ScratchpadPage.tsx:85-92` |
| **Pin/unpin** | Notes can be pinned, with accessible pin/unpin labels and failure toast. | Implemented | `src/renderer/src/hub/pages/ScratchpadPage.tsx:91-108`<br>`src/main/features/notes.ts:107-128` |
| **Delete note confirmation** | Warns “Once deleted it cannot be recovered.” | Implemented | `src/renderer/src/hub/pages/ScratchpadPage.tsx:115-129`<br>`src/main/features/notes.ts:180-184` |
| **Last refreshed** | Sync tooltip reports relative refresh time. | Implemented | `src/renderer/src/hub/pages/ScratchpadPage.tsx:27-35`<br>`src/renderer/src/hub/pages/ScratchpadPage.tsx:76-89` |
| **Flow Bar toggle** | “Add to Flow Bar” exposes Scratchpad globally from the floating bar. | Implemented | `src/shared/settings.ts:255-260`<br>`src/renderer/src/hub/pages/ScratchpadPage.tsx:52-63` |
| **Scratchpad hotkey** | Modal sets/disables “Open Scratchpad”; empty pill says “Click to enable shortcut.” | Implemented | `src/shared/settings.ts:229-244`<br>`src/renderer/src/hub/pages/ScratchpadPage.tsx:45-48`<br>`src/renderer/src/hub/pages/ScratchpadPage.tsx:52-63` |
| **Cloud Sync banner** | Explains that Private Cloud Sync is required for desktop/mobile note sync, with user/admin/HIPAA/org-blocked variants. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Sync-disabled tooltip** | “Your notes aren’t syncing because Private Cloud Sync is off.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Shared notes list** | “Shared with you” list supports loading, empty, error, unavailable, and “View more.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Shared-note popover** | Announces one note by sender/title or a batch, with View Note/View shared Notes. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Share notes dialog** | Searches people/emails, suggests meeting participants, supports add-all, and announces recipient changes. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Share roles** | Owner, Contributor, and Viewer role controls. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Visibility** | Only invited, Anyone with the link, or Everyone at domain with link; captions distinguish summary-only from transcript access. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Copy share link** | Copies summary link and explains when invitations are required for transcript access. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Share restrictions** | Handles org-disabled sharing, Cloud Sync requirement, Enterprise-only domain sharing, rate limits, external-recipient ineligibility, and missing notes. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |
| **Shared folders** | Add/remove note from shared folders. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted sharing/sync behavior; no offline desktop surface) |

## Tasks / Todos

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **My Tasks page** | Title “My Tasks”; current captured feature flag is off, so the page is hidden unless enabled. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:89-118` |
| **Task source** | Meeting-derived tasks show “From {{meetingName}}” and can open the source note. | Offline equivalent — tasks link to their locally stored source meeting. | `src/renderer/src/hub/pages/TasksPage.tsx:148-170`<br>`src/main/features/todos.ts:39-46` |
| **Manual task** | “Add task” / “New task” creates a local open todo, with “Untitled task” fallback. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:61-65`<br>`src/renderer/src/hub/pages/TasksPage.tsx:113-118`<br>`src/main/features/todos.ts:59-77` |
| **Completion checkbox** | Toggles status with an accessible label containing the title. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:84-87`<br>`src/renderer/src/hub/pages/TasksPage.tsx:148-169` |
| **By date created** | Sections include Yesterday, Last week, and Older. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:15-25`<br>`src/renderer/src/hub/pages/TasksPage.tsx:45-59`<br>`src/renderer/src/hub/pages/TasksPage.tsx:129-148` |
| **By priority** | Tab exists but currently displays “Priority is coming soon.” | Offline equivalent — Murmur implements working local priorities instead of a coming-soon placeholder. | `src/renderer/src/hub/pages/TasksPage.tsx:45-53`<br>`src/renderer/src/hub/pages/TasksPage.tsx:100-108`<br>`src/renderer/src/hub/pages/TasksPage.tsx:172-183` |
| **Search tasks** | Search/clear/close actions and “No tasks match your search.” | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:38-43`<br>`src/renderer/src/hub/pages/TasksPage.tsx:100-112`<br>`src/renderer/src/hub/pages/TasksPage.tsx:194-199` |
| **Archive task** | Individual archive/unarchive with undoable toast. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:67-73`<br>`src/renderer/src/hub/pages/TasksPage.tsx:172-187` |
| **Archived tab** | Loading and “Nothing archived” empty state; archived tasks can be restored. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:38-43`<br>`src/renderer/src/hub/pages/TasksPage.tsx:100-108`<br>`src/renderer/src/hub/pages/TasksPage.tsx:184-199` |
| **Archive all** | Confirms count by section and notes restoration is possible. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:89-98`<br>`src/renderer/src/hub/pages/TasksPage.tsx:206-220`<br>`src/main/features/todos.ts:99-105` |
| **Bulk actions** | Archive, restore, or permanently delete selected tasks; delete cannot be undone. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:75-82`<br>`src/renderer/src/hub/pages/TasksPage.tsx:120-127`<br>`src/renderer/src/hub/pages/TasksPage.tsx:221-232` |
| **Task coachmark** | “Your tasks live here!” explains action items from notes/meetings and offers “Check it out.” | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:89-98` |
| **Empty state** | “No tasks yet” / “Action items from your meetings show up here.” | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:194-199` |
| **Connect apps** | Teases task sync as “coming in a few weeks.” | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/TasksPage.tsx:200-204` |
| **Calendar automation** | Add to calendar form has title, start/end, guests, description, reauth/not-connected errors, and success. | Offline equivalent — Murmur exports a local `.ics` event instead of using calendar OAuth. | `src/renderer/src/hub/pages/TasksPage.tsx:265-290`<br>`src/main/features/todos.ts:113-138` |
| **Email automation** | Send email form has To, Subject, Body, sending/success/failure, and Gmail reauth/connect states. | Offline equivalent — Murmur opens a `mailto:` draft and keeps a local automation record. | `src/renderer/src/hub/pages/TasksPage.tsx:252-282`<br>`src/main/features/todos.ts:106-112` |

## Memory

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Memory start screen** | “Build your memory” says Flow reads the last 90 days of meetings and connected sources to build inspectable documents. | Offline equivalent — memory is built from recent on-device meetings, dictations, and notes. | `src/renderer/src/hub/pages/MemoryPage.tsx:97` |
| **Background start** | “Start” runs in the background; generic, rate-limited, unavailable, and read-only states are distinct. | Offline equivalent — local background build is idempotent and exposes running/failure/retry state; hosted account rate-limit/read-only gates do not apply. | `src/renderer/src/hub/pages/MemoryPage.tsx:98` |
| **Agents list** | Email agent reads Gmail, Meeting agent reads Notetaker meetings, Slack agent reads Slack; Offload and Dreamer agents also appear. | Offline equivalent — local meeting, dictation, notes, and Dreamer agents replace hosted sources; cloud agents show unavailable. | `src/renderer/src/hub/pages/MemoryPage.tsx:170` |
| **Catch-up progress** | Reports done/total and per-source email/meeting counts, capped at 999+, with source date windows. | Offline equivalent — local source counts and run state replace the hosted done/total queue, cap, and cloud windows. | `src/renderer/src/hub/pages/MemoryPage.tsx:119` |
| **Documents tab** | Tree groups Knowledge, People, Preferences, Projects, Timeline, and Other. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/MemoryPage.tsx:9` |
| **Document templates** | Facts, Decisions, Procedures, Assistant, Dictation, Email/Slack writing style, meeting prep/summaries/nudges. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/MemoryPage.tsx:120` |
| **Document editor** | Opens content, context, source, version and last-changed-by metadata; supports Edit/Save with preserved-changes error. | Implemented | `src/renderer/src/hub/pages/MemoryPage.tsx:133` |
| **People index/contact detail** | Shows email, role/company, last met, meeting counts, mentions/invites, and deleted/merged state. | Offline equivalent — Murmur builds a local speaker index with last-met and meeting metrics, without cloud contact profiles. | `src/renderer/src/hub/pages/MemoryPage.tsx:167` |
| **Document history** | Earlier versions identify agent and date and can show line-level changes. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/MemoryPage.tsx:133` |
| **Diff viewer** | Added/removed lines, unchanged-line expansion, unchanged state, failure, and too-long truncation. | Implemented | `src/renderer/src/hub/pages/MemoryPage.tsx:157` |
| **Change banner** | Shows what an agent, Setup, or user changed, optionally from a titled source, and marks affected tree documents. | Implemented | `src/renderer/src/hub/pages/MemoryPage.tsx:123` |
| **Events tab** | Newest-first source events with Today/Yesterday/Coming up, waiting counts, filters, and no-match/end states. | Offline equivalent — newest-first local agent/source events replace hosted connector events. | `src/renderer/src/hub/pages/MemoryPage.tsx:167` |
| **Event sources** | Gmail, Slack message/channel/DM, Notetaker meeting, Voice Offload, removed-source events, and initial Setup. | Offline equivalent — events come from local meetings, dictations, notes, setup, and Dreamer; Gmail/Slack remain unavailable. | `src/renderer/src/hub/pages/MemoryPage.tsx:170` |
| **Agent explanation** | Per event says queued/running/changed/no change/skipped/failed/removed/setup and which agent acted. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/MemoryPage.tsx:180` |
| **Dreamer** | Nightly 1–5 a.m. local slot tidies documents and updates writing style, or reports no change. | Implemented | `src/renderer/src/hub/pages/MemoryPage.tsx:173` |
| **Links tab** | Ranks links from email, Slack, and meetings, preferring direct shares and links with memory notes; shows host/share count/date/source. | Offline equivalent — links are ranked from local notes, meetings, and dictations. | `src/renderer/src/hub/pages/MemoryPage.tsx:170` |
| **Search every document** | Searches names/frontmatter/current content, shows line numbers and writer run, supports truncation, no-match, and back-to-results. | Implemented | `src/main/features/memory.ts:174`<br>`src/renderer/src/hub/pages/MemoryPage.tsx:136`<br>`src/renderer/src/hub/pages/MemoryPage.tsx:140` |
| **Run chips** | Displays agent/status, reason such as Nightly tidy-up, and overflow count. | Implemented | `src/renderer/src/hub/pages/MemoryPage.tsx:118` |
| **Status vocabulary** | Queued, Running, Scheduled, Waiting, Changed memory, No changes, Skipped, Didn’t finish. | Implemented | `src/renderer/src/hub/pages/MemoryPage.tsx:181` |
| **Staff details** | Internal tools show stages, model calls/token input-output, approximate cost, rules, IDs, failures, and debug log entry kinds. | Not applicable — Wispr staff-only diagnostics are excluded. | — |
| **Debug sync** | “Sync all sources” queues work or says a sync already waits. | Not applicable — Wispr staff-only cloud sync is excluded. | — |
| **Delete all memory** | Confirmation stops jobs and deletes documents, Inbox items, and source progress; handles race/residual failures. | Implemented | `src/renderer/src/hub/pages/MemoryPage.tsx:148` |
| **Availability gates** | Temporarily unavailable, unavailable for account, agents off, read-only, loading, and retry states. | Offline equivalent — local Memory exposes idle, running, failed, and retry states; account/read-only cloud gates do not apply. | `src/renderer/src/hub/pages/MemoryPage.tsx:174` |

## Skills and Ask actions

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Skills gallery** | Tabs Built-in, My Skills, and Shared with team; categories Before a meeting, After a meeting, Across meetings, and More Skills. | Offline equivalent — Built-in and My Skills work locally; Shared with team shows an offline notice. | `src/renderer/src/hub/pages/SkillsPage.tsx:15` |
| **Search Skills** | Searches by name and displays query-specific empty state. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:146` |
| **Built-in skills** | Includes action items, follow-up email, project update/retro, discovery recap, CRM update, decision log, open questions, coaching, client readout, customer feedback, campaign brie… | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/SkillsPage.tsx:180` |
| **Skill detail** | Shows instructions, author (Wispr/you/teammate), sharing scope, edited-by metadata, and Use/Edit/Save a copy/Delete actions. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:216` |
| **Create Skill** | Editor requires name, one-line description, instructions, and slash command; optional run scope/audience controls. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/SkillsPage.tsx:190` |
| **Slash command validation** | Lowercase letters/numbers and single hyphens; required, reserved, personal collision, and team collision errors. | Offline equivalent — local syntax, reserved, required, and personal-collision validation works; team collisions do not apply. | `src/renderer/src/hub/pages/SkillsPage.tsx:98` |
| **Run scope** | One meeting, Multiple meetings, or both; helper text explains meeting chat versus Ask Wispr. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:200` |
| **Audience** | Just me, My team, My department, Whole company; shared skills cannot become private again. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/SkillsPage.tsx:145`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:180` |
| **Shared editing** | Team/department members can run, edit, and delete shared skills; only admins can change company skills. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/SkillsPage.tsx:145`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:180` |
| **Skill limits** | Personal/team maximum produces create/save limits; rate limiting and unavailable states are explicit. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/SkillsPage.tsx:145`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:180` |
| **Shadowed commands** | Personal or team skill can override another skill with the same slash command; UI explains which runs. | Implemented | `src/main/db.ts:314`<br>`src/main/features/skills.ts:53`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:218` |
| **Concurrent deletion** | If deleted on another device/from team while editing, user can save as a new personal skill. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/SkillsPage.tsx:145`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:180` |
| **Ask input** | Chat composer says “Ask anything,” supports send, stop, scroll-to-bottom, thinking duration, and stopped/failed states. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:149`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:164`<br>`src/main/features/skills.ts:130` |
| **Tool steps** | Exposes steps such as finding participants, reading summary, searching meetings, drafting email, and saving/removing memory with Waiting/Running/Done/Blocked/Failed. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:194`<br>`src/main/features/skills.ts:130` |
| **Memory action in chat** | Chat can save or remove facts from memory and announces first saved memory. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:145`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:198`<br>`src/main/features/memory.ts:185` |
| **Gmail draft action** | Editable To/Cc/Subject/content, account identity, send countdown/undo, success/partial/failure/retry, and external-recipient confirmation. | Offline equivalent — local draft handoff replaces Gmail account automation. | `src/renderer/src/hub/pages/SkillsPage.tsx:131` |
| **Slack draft action** | Selects person/channel, handles guests/private/deactivated recipients, edits/copies/sends, and can hand off to Slack. | Offline equivalent — local draft handoff replaces Slack account automation. | `src/renderer/src/hub/pages/SkillsPage.tsx:229` |
| **Notion page action** | Creates/updates a page, handles partial content and uncertain completion, and opens the result. | Offline equivalent — local draft handoff replaces Notion account automation. | `src/renderer/src/hub/pages/SkillsPage.tsx:123` |
| **Connector recovery** | Connect/sign in/reconnect/switch account; handles offline, outage, timeout, cancelled auth, revoked access, missing permissions, admin block, wrong account, and rate limit. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/pages/SkillsPage.tsx:145`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:180` |
| **Safe draft fallback** | When a connector is unavailable/not offered, user can still edit and copy the draft. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:224` |

## Referral, banners, mobile, and help

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Referral modal** | Tabs Refer, Past referrals, and Apply referral; title changes between earning and giving rewards. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:33`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:45` |
| **Referral link** | Displays invite link with Copy and destructive regenerate warning. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:33`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:45` |
| **Email invitations** | Accepts up to a configured count, validates addresses, requires at least one, and reports sending/success/failure. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:13` |
| **Referral reward rules** | Friend receives one month Pro; referrer receives one or promotional two months after the friend dictates 2,000 words. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted referral campaign behavior has no offline desktop surface) |
| **Reward application** | Rewards auto-apply to next desktop subscription payment; unsubscribed users must upgrade, while IAP/team users may only give rewards. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted referral campaign behavior has no offline desktop surface) |
| **Past referrals** | Separates Pending invites, Referrals, Rewards given, and Student challenge; statuses include not signed up, under 2,000 words, complete, and upgraded. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:33`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:45` |
| **Referral reminders** | “Remind them” sends email with sending/success/error states. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted referral campaign behavior has no offline desktop surface) |
| **Apply referral code** | Validates nonempty code, applies credit next billing cycle, and reports progress/failure. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted referral campaign behavior has no offline desktop surface) |
| **Student challenges** | Campus-branded variants offer $50, tiered $160, or $1,000 leaderboard rewards based on qualified referrals and countdown. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (hosted referral campaign behavior has no offline desktop surface) |
| **Dictionary banner** | Personal/team variants explain correct spelling and shared jargon. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:92` |
| **Snippets banner** | Explains spoken expansions and team reuse. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:52` |
| **Style banner** | Promotes customized writing styles. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:30`<br>`src/renderer/src/hub/pages/HomePage.tsx:105` |
| **Transforms banner** | “Transform works anywhere you write,” with How it works/Try it out. | Implemented | `src/renderer/src/hub/transforms/TransformExperience.tsx:34` |
| **Scratchpad banner** | “For quick thoughts you want to come back to,” offering Start new note. | Implemented | `src/renderer/src/hub/pages/ScratchpadPage.tsx:68` |
| **Microphone quiz banner** | “Working around other people?” offers setup guidance. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:28` |
| **Mouse Flow banner** | “Flow using your mouse” / “Keyboards? Who needs them!” | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:29` |
| **IDE tagging banner** | Promotes automatic @file and variable tagging in Cursor/Devin. | Implemented | `src/renderer/src/hub/pages/HomePage.tsx:31`<br>`src/renderer/src/hub/pages/HomePage.tsx:106` |
| **Banner dismissal** | Promotional banners have a Dismiss action and individual persisted dismissal keys. | Implemented | `src/renderer/src/hub/vocab/VocabPage.tsx:54` |
| **Get mobile dialog** | QR code or SMS link, country/phone validation, sending/success/failure, Cancel. | UI-only (mobile/team/billing) — Wispr mobile, team, billing, or hosted sharing services are unavailable offline. | `src/renderer/src/hub/shell/AccountMenu.tsx:27`<br>`src/renderer/src/hub/shell/HelpMenu.tsx:37` |
| **Help essentials** | Shortcuts, Microphone, Languages, and Try mobile app. | Implemented | `src/renderer/src/hub/shell/HelpMenu.tsx:33` |
| **Help updates** | What’s New. | Implemented | `src/renderer/src/hub/shell/HelpMenu.tsx:39`<br>`src/renderer/src/hub/shell/HelpMenu.tsx:47` |
| **Help contact** | Help Center, Talk to support, and Contact sales. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/HelpMenu.tsx:40`<br>`src/renderer/src/hub/shell/HelpMenu.tsx:54` |
| **Contact form tabs** | “Report an issue” and “Share Feedback,” with request type Account & Data Management/Billing/Issue. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/HelpMenu.tsx:40`<br>`src/renderer/src/hub/shell/HelpMenu.tsx:54` |
| **Feedback attachments** | Attach/remove images, configured max file count/total MB, and eligibility verification requirement for discounts. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/HelpMenu.tsx:61` |
| **Discount requests** | Student, Education, Accessibility Support, Non-Profit, Military, Senior Citizen, or no discount. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | `src/renderer/src/hub/shell/HelpMenu.tsx:40`<br>`src/renderer/src/hub/shell/HelpMenu.tsx:54` |
| **Feedback failure fallback** | If submission fails, copy says the message was copied to clipboard to try again. | Implemented | `src/renderer/src/hub/shell/HelpMenu.tsx:20` |

## Data model

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **History** | Primary key `transcriptEntityId`; stores raw/formatted/edited/tone-matched/fallback/server-finalized text, timestamps, app/URL, status, duration/speech duration, word and correcti… | Offline equivalent — Murmur stores the raw/formatted/edited local pipeline fields, timings, app, audio path, archive/revert, feedback, and diagnostics it uses. | `src/main/db.ts:7` |
| **Dictionary** | UUID, phrase, optional replacement and rich HTML, team dictionary ID, last/frequency used, manual/auto source metadata, snippet/star/deleted flags, created/modified dates; unique… | Offline equivalent — Murmur stores local phrase/replacement, snippet/star/source, frequency, and timestamps without team/cloud metadata. | `src/main/db.ts:34` |
| **Notes** | UUID, title, preview, rich content, searchable content, created/modified, synced/deleted/finalized/pinned. | Offline equivalent — Murmur stores local rich content, preview, search text, pin/delete state, and timestamps without cloud sync fields. | `src/main/db.ts:60` |
| **NoteVersions** | UUID, note ID, content, source, optional transform ID/prompt, creation time. | Implemented | `src/main/db.ts:72` |
| **NoteImages** | UUID, note ID, image BLOB, dimensions, bytes, MIME type, creation time, optional cloud object key/upload flag/signed URL/expiry. | Offline equivalent — Murmur stores local image bytes, dimensions, byte size, MIME type, and creation time without cloud object URLs. | `src/main/db.ts:81` |
| **Todos** | UUID, optional meeting ID, title, status (`open` default), deleted/archived flags, created/modified, synced, floating sort order. | Offline equivalent — Murmur stores local source meeting, title, status, priority, archive/delete, order, and timestamps without sync state. | `src/main/db.ts:89` |
| **Automations** | UUID, entity kind/ID, automation kind, JSON payload (`{}` default), creation time; backs task email/calendar actions. | Implemented | `src/main/db.ts:186` |
| **Polish** | UUID, initial/polished text and word counts, app, processing time/status, undo flag, instruction, upload state, dates, model/provider, diff count, feedback, prompt name, shortcut,… | Offline equivalent — `transform_runs` stores local transform input/output, app, status, processing time, error, and timestamp instead of Wispr upload/model fields. | `src/main/db.ts:48` |
| **UserContext** | Singleton-like integer ID containing serialized writing samples and polish prompts plus modified time. | Implemented | `src/main/db.ts:285` |
| **UserVoicePreferences** | UUID, preference text, optional filter, upload state, created/updated. | Implemented | `src/main/db.ts:291` |
| **RemoteNotifications** | UUID, type/key/title/text, archived/read flags, timestamps, sync state. | Offline equivalent — Murmur stores local notification type/key/title/text/read/archive/timestamp without hosted sync state. | `src/main/db.ts:141` |
| **SharedNotes** | Share slug, title/notes/summary/search text, owner identity/avatar, caller role (`viewer` default), dates, optional meeting/event/via/recorded duration. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **Statistics cache** | Total words, total duration, nonempty duration, average WPM, week/day streak, words today/week, last transcript time, and used-app list. | Offline equivalent — statistics are computed directly from local history instead of trusting a cloud cache. | `src/main/features/stats.ts:111` |
| **Voice profile cache** | Processing state and generated title/description, peak time/app, catchphrase, headline, persona, most-used/removed words, milestone. | Offline equivalent — the generated local profile is cached in the on-device key-value store. | `src/main/features/stats.ts:184` |

## Settings & defaults

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **`prefs.user.theme` → `light`** | Hub starts in light theme; user can select dark or system. | Implemented | `src/shared/settings.ts:249` |
| **`prefs.user.renderOptions.sidebarOpen` → `true`** | Main sidebar starts expanded. | Implemented | `src/shared/settings.ts:350` |
| **`prefs.user.renderOptions.width` / `height` → `1350` / `850`** | Captured hub window dimensions. | Implemented | `src/main/windows.ts:59` |
| **`prefs.user.uiZoomFactor` → `1`** | 100% UI scale. | Implemented | `src/shared/settings.ts:251`<br>`src/main/windows.ts:45` |
| **`prefs.user.defaultTranscriptionFormat` → `Apply AI formatting`** | New dictations use formatted output. | Offline equivalent — Light cleanup is the local formatted-output default. | `src/shared/settings.ts:269` |
| **`prefs.user.aiFormatting` → `true`** | AI cleanup is enabled. | Offline equivalent — local cleanup and transforms are enabled by default. | `src/shared/settings.ts:269`<br>`src/shared/settings.ts:278` |
| **`prefs.user.autoCleanup.level` → `light`** | Removes fillers/fixes grammar by default. | Implemented | `src/shared/settings.ts:269` |
| **`prefs.user.shouldAutoLearnWords` → `true`** | Dictionary can learn corrected words automatically. | Implemented | `src/shared/settings.ts:264` |
| **`prefs.user.dictionarySort` → `Newest`** | Dictionary opens newest-first. | Implemented | `src/shared/settings.ts:351` |
| **`prefs.cache.lastTeamDictionarySyncTime` → `null`** | No team dictionary sync recorded in captured profile. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.user.polishEnabled` → `true`** | Transforms feature enabled. | Implemented | `src/shared/settings.ts:278` |
| **`prefs.user.polishAutoPaste` → `true`** | Transform output pastes automatically where supported. | Implemented | `src/shared/settings.ts:279` |
| **`prefs.user.autoPolishAfterDictation.active` → `false`** | Automatic transform after every dictation is off. | Implemented | `src/shared/settings.ts:280` |
| **`prefs.user.autoPolishAfterDictation.promptName` → `polish`** | Built-in Polish is preselected if auto-apply is enabled. | Implemented | `src/shared/settings.ts:280` |
| **`prefs.user.polishInstructions.default.*`** | Enabled: Make more concise, Maintain your tone, Reword for clarity, Reorder for readability, Add structure; disabled: Clarify main point, Refine phrasing for impact. | Implemented | `src/shared/settings.ts:171` |
| **`prefs.user.userVoices.work/email/personal/other`** | Built-ins map Slack/Teams, Gmail/Outlook/Superhuman, Messages/WhatsApp/WeChat/Messenger, and all remaining apps; each captured at Light cleanup + Formal style. | Implemented | `src/shared/settings.ts:198` |
| **`prefs.user.notesViewType` → `grid`** | Notes library defaults to grid. | Implemented | `src/shared/settings.ts:352` |
| **`prefs.user.scratchpadInFlowBar` → `false`** | Scratchpad button is hidden from Flow Bar. | Implemented | `src/shared/settings.ts:254` |
| **`prefs.user.lastSetScratchpadShortcut` → empty** | No explicit Scratchpad shortcut is configured. | Implemented | `src/shared/settings.ts:348` |
| **`prefs.user.internal.scratchpadSidebarOpen` → `false`** | Standalone Scratchpad note rail starts collapsed. | Implemented | `src/renderer/src/scratchpad/App.tsx:23` |
| **`prefs.user.internal.scratchpadDefaultNewTab` → `false`** | Opening Scratchpad does not force a fresh tab. | Implemented | `src/shared/settings.ts:263` |
| **`prefs.user.internal.scratchpadOpenLastActivePinned` → `false`** | Does not force reopening last pinned note. | Implemented | `src/shared/settings.ts:263` |
| **`prefs.user.internal.scratchpadOpenBehavior` → `default`** | Uses standard open behavior. | Offline equivalent — Murmur names the same reopen-last-note behavior `resume`; absent/invalid notes still create a fresh note. | `src/shared/settings.ts:263`<br>`src/main/features/notes.ts:137` |
| **`prefs.user.cloudSync` → `false`** | Notes/insights sharing banners warn that cross-device sync is unavailable. | Not applicable — cross-device cloud sync does not apply offline. | — |
| **`prefs.user.defaultNoteVisibility` → `anyone_with_link`** | New share dialogs default to link visibility. | Not applicable — hosted sharing visibility does not apply offline. | — |
| **`prefs.user.lastNoteSyncTime` → `0`** | No note sync has completed in captured profile. | Not applicable — hosted note sync does not apply offline. | — |
| **`prefs.user.lastTodoSyncTime` → `0`** | No todo sync has completed. | Not applicable — hosted task sync does not apply offline. | — |
| **`prefs.user.memoryIntroSeen` → `false`** | Memory onboarding has not been acknowledged. | Offline equivalent — the local intro remains visible until the first memory build, so the same unseen/seen outcome is derived from persisted memory state rather than a duplicate flag. | `src/renderer/src/hub/pages/MemoryPage.tsx:91` |
| **`prefs.user.postOnboardingCompleted` → `false`** | Post-onboarding use-case flow remains eligible. | Implemented | `src/shared/settings.ts:208` |
| **`prefs.user.postOnboardingStep` → `click_textbox`** | Captured dialog/tutorial is at the textbox interaction step. | Not applicable — this is hosted tutorial bookkeeping; Murmur persists the user-visible post-onboarding eligibility and completion instead. | `src/shared/settings.ts:29`<br>`src/renderer/src/hub/pages/HomePage.tsx:177` |
| **`prefs.user.typingLocations` → `[chatting_with_ai]`** | Selected first-use goal is chatting with AI. | Offline equivalent — Murmur persists the user’s selected local use cases rather than preloading an account value. | `src/shared/settings.ts:220`<br>`src/renderer/src/hub/pages/HomePage.tsx:72` |
| **`prefs.user.userInformation.role` → `developer`** | Captured About Yourself occupation. | Offline equivalent — Murmur persists the role selected during local onboarding rather than a captured account value. | `src/shared/settings.ts:218` |
| **`prefs.user.userInformation.industry` → `freelancer`** | Captured work classification. | Not applicable — captured Wispr account trait is not a desktop feature. | — |
| **`prefs.user.userInformation.writingNeeds` → `[detailed_ai_prompts]`** | Personalization signal prioritizes detailed AI prompts. | Offline equivalent — Murmur persists locally selected writing needs rather than a captured account value. | `src/shared/settings.ts:221` |
| **`prefs.user.lastNotificationReadTime`** | Timestamp used to derive notification unread state. | Implemented | `src/shared/settings.ts:355` |
| **`prefs.user.notificationSettings.*` → `true`** | Tips/suggestions, feature highlights, milestones/progress, team updates, and team leaderboard updates are all enabled. | Offline equivalent — local tips, announcements, milestones, and delay notifications default on; team-only settings do not apply. | `src/shared/settings.ts:261` |
| **`prefs.cache.statistics.totalWords` → `10288`** | Captured local total shown by Home/Insights. | Offline equivalent — total words are computed from local history rather than seeded to a captured account value. | `src/main/features/stats.ts:111` |
| **`prefs.cache.statistics.averageWPM` → about `139.8`** | Captured average speech speed. | Offline equivalent — average WPM is computed from local words and speech duration. | `src/main/features/stats.ts:111` |
| **`prefs.cache.statistics.weekStreak` / `dayStreak` → `0` / `0`** | No active captured streak. | Offline equivalent — streaks are computed from local activity rather than seeded captured values. | `src/main/features/stats.ts:111` |
| **`prefs.cache.voiceProfile.voiceProfileWordCount` → `6`** | Only six words counted toward the next profile milestone. | Offline equivalent — profile progress uses the actual local word count. | `src/main/features/stats.ts:118` |
| **`voiceProfile.processing_status` → `NOT_STARTED`** | No generated Voice Profile exists; all generated fields are null. | Offline equivalent — local profile state is derived from history and cached generation state. | `src/main/features/stats.ts:128` |
| **`prefs.user.subscription.plan` → `FLOW_BASIC`** | Free-plan sidebar/account states apply. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.user.subscription.status` → `none`** | No active subscription. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.user.subscription.isSubscribed` → `false`** | Upgrade/referral reward claim messaging uses unsubscribed path. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.user.subscription.totalTrialDays` → `14`** | Team/promo copy uses a 14-day Pro trial. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.user.subscription.credits` → `0`** | No referral credits captured. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.cache.referralCode` → account-specific code** | Generates the referral invite URL. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.cache.referrals` → `[]`** | Past referrals empty state applies. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **`prefs.user.personalizationBannerDismissed` → `false`** | Personalization banner remains eligible. | Offline equivalent — one local `dismissedBanners` collection persists per-banner eligibility. | `src/shared/settings.ts:353`<br>`src/renderer/src/hub/pages/HomePage.tsx:65` |
| **`prefs.user.microphoneQuizBannerDismissed` → `false`** | Microphone setup banner remains eligible. | Offline equivalent — one local `dismissedBanners` collection persists per-banner eligibility. | `src/shared/settings.ts:353`<br>`src/renderer/src/hub/pages/HomePage.tsx:28` |
| **`prefs.user.mouseFlowBannerDismissed` → `false`** | Mouse Flow banner remains eligible. | Offline equivalent — one local `dismissedBanners` collection persists per-banner eligibility. | `src/shared/settings.ts:353`<br>`src/renderer/src/hub/pages/HomePage.tsx:29` |
| **`prefs.user.polishBannerDismissed` → `false`** | Transform banner remains eligible. | Offline equivalent — one local `dismissedBanners` collection persists per-banner eligibility. | `src/shared/settings.ts:353`<br>`src/renderer/src/hub/transforms/TransformExperience.tsx:34` |
| **`prefs.user.defaultBannerDismissed` → `false`** | Basic hold-to-dictate banner remains eligible. | Offline equivalent — one local `dismissedBanners` collection persists per-banner eligibility. | `src/shared/settings.ts:353`<br>`src/renderer/src/hub/pages/HomePage.tsx:25` |
| **Feature flag `homepage-redesign` → enabled, `test`** | Home label/layout uses redesign. | Not applicable — remote feature-flag plumbing is not reproduced; Murmur ships one Home experience. | — |
| **Feature flag `new-insights-and-voice-profile` → enabled, `insights`** | New Insights/Profile experience is eligible. | Not applicable — remote feature-flag plumbing is not reproduced. | — |
| **Feature flag `insights-redesign` → disabled** | Legacy/current Insights layout wins over the newest redesign. | Not applicable — remote feature-flag plumbing is not reproduced; Murmur ships one Insights experience. | — |
| **Feature flag `insights-topics` → disabled** | Meeting-topic analytics are hidden. | Not applicable — remote feature-flag plumbing is not reproduced. | — |
| **Feature flag `team-insights` → enabled** | Team leaderboard UI can appear when entitlement allows. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **Feature flag `rich-text-snippets` → enabled** | Snippet HTML expansion is available. | Implemented — Murmur ships rich-text snippets enabled locally without remote feature-flag plumbing. | `src/shared/types.ts:88`<br>`src/renderer/src/hub/vocab/VocabPage.tsx:138` |
| **Feature flags `department-scoped-dictionary` / `department-scoped-snippets` → disabled** | Department UI is dormant despite localized copy. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **Feature flag `todos` → disabled** | My Tasks page is hidden in the captured account. | Not applicable — remote feature-flag plumbing is not reproduced. | — |
| **Feature flag `scratchpad` → disabled** | Standalone Scratchpad product exposure is off despite complete bundled UI. | Not applicable — remote feature-flag plumbing is not reproduced. | — |
| **Feature flag `scratchpad-cross-device-image-sync` → enabled** | Images may sync when note/cloud policy permits. | Not applicable — cross-device cloud image sync does not apply offline. | — |
| **Feature flag `wispr-memory` → disabled** | Memory page is hidden. | Not applicable — remote feature-flag plumbing is not reproduced. | — |
| **Feature flag `ask-skills` → enabled** | Skills are available in Ask surfaces. | Not applicable — remote feature-flag plumbing is not reproduced; local Skills are always available. | — |
| **Feature flag `ask-skills-team-sharing` → enabled** | Team/shared skill audiences are enabled. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **Feature flag `remote-notifications` → enabled** | Bell/notification synchronization is active. | Not applicable — hosted notification synchronization does not apply offline. | — |
| **Feature flag `hide-referrals` → disabled** | Referral footer/account items are visible. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **Feature flag `student-referral-challenge` → disabled** | Student prize campaign UI is dormant. | UI-only (cloud) — hosted account, team, billing, sharing, or connector behavior is unavailable offline. | — (cloud-only background data/flag behavior; no offline desktop surface) |
| **Feature flag `notetaker-sidebar-checklist` → enabled, `treatment`** | Setup checklist card appears for eligible unfinished users. | Not applicable — remote experiment plumbing is not reproduced. | — |
# Notetaker

## Recording entry points and lifecycle

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Start a new note** | “New note,” “Start,” and “Start Notetaker” open the Notepad and begin capture; tooltips expose the configured keyboard shortcut. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:96-103`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:161-172`<br>`src/renderer/src/recorder/main.tsx:107-134` |
| **Start from upcoming meeting** | A scheduled row can “Join meeting,” “Start notes,” or “Join + Start”; the combined action launches the conference URL and starts capture. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:200-216`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:105-108` |
| **Start from meeting detection** | Detection cards identify a generic meeting or Zoom, Google Meet, Teams, Slack, or Webex and offer Start Notetaker versus dismiss. | Implemented | `src/main/features/recorder.ts:525-540` |
| **Global join/start shortcut** | One shortcut is described as joining a meeting when one is available or starting Notetaker otherwise. | Implemented | `src/main/features/recorder.ts:506-523` |
| **Recorder phases** | Persistent state distinguishes idle, awaiting audio, active/transcribing, stopping/finishing, abandoned, complete, and failed processing states. | Offline equivalent — recorder state covers idle, awaiting audio, recording, paused, finalizing, done, and an explicit error field; cloud abandoned/failed-job states are unnecessary. | `src/shared/types.ts:176`<br>`src/main/features/recorder.ts:44` |
| **Start admission** | Starting can be refused by incomplete setup, organization policy, consent requirements, another active recording, weekly quota, or unavailable live transcription. | Offline equivalent — local setup, device permission, active-recording, quota, and Whisper availability gates replace hosted organization-policy admission. | `src/main/features/recorder.ts:161-175`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:93-103` |
| **Awaiting audio** | A newly started recording can wait for valid capture before becoming active rather than immediately treating silence as content. | Implemented | `src/main/features/recorder.ts:258-260`<br>`src/renderer/src/recorder/main.tsx:156` |
| **Stop** | The active control is “Stop” with accessible text “Stop listening”; completion moves through “Finishing up…” before post-processing. | Implemented | `src/renderer/src/recorder/main.tsx:148`<br>`src/renderer/src/recorder/main.tsx:169` |
| **Pause/resume capture state** | The packaged recorder tracks explicit capture-pause changes and resume results; the normal user-facing continuation is “Resume” / “Take notes.” | Implemented | `src/main/features/recorder.ts:603-613`<br>`src/renderer/src/recorder/main.tsx:146-148` |
| **Resume old meeting** | A stopped meeting can be resumed later; if resumption is rejected, the fallback action is “Record new meeting.” | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:129-138`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:166-168` |
| **Switch recording** | Starting another meeting while one is active asks whether to switch, start a new meeting note, or switch to a named meeting; actions are No, Start, Switch, and “Switching…”. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:96-118`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:310-322`<br>`src/main/features/recorder.ts:178-182` |
| **Stop-and-switch confirmation** | The meeting list asks “Stop Notetaker?” and explains that the current recording can be resumed later; confirmation is “Stop and switch.” | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:293` |
| **Single active recording** | Recorder state and switch dialogs imply one active meeting capture at a time. | Implemented | `src/main/features/recorder.ts:161-165`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:93-96` |
| **Untitled recording** | Manual capture can begin as “Untitled meeting” / “Untitled note” and be titled later. | Implemented | `src/main/features/recorder.ts:182-198`<br>`src/renderer/src/recorder/main.tsx:138` |
| **Short accidental capture** | If only a few words were captured, “Started by mistake?” offers Keep or Discard. | Implemented | `src/renderer/src/recorder/main.tsx:181` |
| **No-audio stop** | Stopping with no captured audio produces “Stopped meeting — No audio was recorded.” | Implemented | `src/main/features/recorder.ts:390-392` |
| **Delete meeting** | Deletion permanently removes note and transcript and cannot be undone; failures leave the meeting intact with an error. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:240`<br>`src/main/features/meetings.ts:342-347` |
| **Window controls** | Meeting recorder supports Close, Minimize, Maximize/Restore, and Full Screen. | Implemented | `src/renderer/src/recorder/main.tsx:145-153`<br>`src/main/features/recorder.ts:642-657` |
| **Recorder crash recovery** | The recorder error boundary says “Something went wrong. Reload to keep recording,” preserving the recording process while reloading UI. | Implemented | `src/renderer/src/recorder/main.tsx:19-33` |
| **Open live note** | The hub can focus the currently recording meeting via “Open live meeting note.” | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:153-156`<br>`src/main/features/recorder.ts:675-680` |
| **Open meeting in hub** | Main-process IPC exposes opening the meeting detail in the hub from recorder/status surfaces. | Offline equivalent — the ready notification opens the local meeting detail in the hub. | `src/main/features/recorder.ts:452-454` |
| **Window size persistence** | Recorder IPC supports setting size, querying maximized state, minimizing to dock, and zooming. | Offline equivalent — Murmur persists Notepad width/height and reports maximized state; native window controls handle minimize/zoom. | `src/main/features/recorder.ts:637-657`<br>`src/renderer/src/recorder/main.tsx:74-85` |
| **Split screen with call** | “Split screen with meeting” arranges the call and Notepad side by side; Accessibility permission is required for window arrangement. | Implemented | `src/renderer/src/recorder/main.tsx:149`<br>`src/main/meetings/split-screen.ts:13-29` |
| **Notepad default view** | Start behavior can keep Notepad hidden, open it, or open side by side. | Implemented | `src/main/features/recorder.ts:280-283`<br>`src/shared/settings.ts:309` |
| **Screen-share hiding** | A setting can exclude Notepad and Flow Bar from screenshots/screen capture; copy reminds users this does not replace consent. | Implemented | `src/main/features/recorder.ts:258-260`<br>`src/renderer/src/recorder/main.tsx:157` |
| **Screen-share education** | A notification warns that Flow Bar and Notepad otherwise appear in screen shares and screenshots and links to settings. | Implemented | `src/renderer/src/recorder/main.tsx:157` |
| **Meeting menu-bar indicator** | Optional menu-bar copy shows the next meeting name and countdown while preserving the base Flow icon/menu when disabled. | Offline equivalent — Murmur stores a local tray preference but does not reproduce Wispr’s hosted countdown state. | `src/shared/settings.ts:346` |
| **Guided tour recording** | A seeded two-minute tour can start a demo meeting, be paused/resumed, skipped, or quit after a confirmation emphasizing the tutorial’s value. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:176-181`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:201-206`<br>`src/renderer/src/recorder/main.tsx:154-164`<br>`src/renderer/src/recorder/main.tsx:190-196` |
| **Tour demo isolation** | Meetings have an `isTourDemo` flag so demo recordings can be treated separately from real meetings and quota history. | Implemented | `src/main/features/recorder.ts:182-205`<br>`src/main/features/recorder.ts:475-483` |
| **First-meeting onboarding** | Welcome and beta modals pitch transcript, summary, and action-ready notes; a first accidental/short meeting branches to calendar connect or guided tour. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:159-166`<br>`src/main/features/recorder.ts:408-423` |
| **First-meeting completion** | Ready-state modal links to the generated meeting note and can celebrate summary, decisions, and next steps. | Implemented | `src/renderer/src/recorder/main.tsx:171` |

## Audio capture and device handling

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Microphone capture** | Microphone permission is a required setup gate labeled “Capture what you say.” | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:114-121` |
| **System-audio capture** | System audio is a separate setup gate labeled “Capture what others say.” | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:118-122` |
| **Windows system capture** | Feature flags explicitly cover Windows system-capture restart/time and a Windows silent sink, indicating OS-native loopback handling. | Offline equivalent — Windows loopback capture provides the local system-audio path. | `src/renderer/src/capture/main.ts:155-184` |
| **Input/output selector** | An Audio popover exposes Input and Output device choices and closes independently of the note. | Implemented | `src/renderer/src/recorder/main.tsx:145`<br>`src/renderer/src/recorder/main.tsx:172-180` |
| **Live audio levels** | The audio panel displays levels when available and “Audio levels unavailable” otherwise. | Implemented | `src/renderer/src/recorder/main.tsx:143-151` |
| **Mic-only warning** | When system audio is off, a banner says only the mic is recording and requires restarting the meeting after turning system audio back on to capture others. | Implemented | `src/main/features/recorder.ts:622-631`<br>`src/renderer/src/recorder/main.tsx:158` |
| **System audio off notification** | “System audio turned off” offers “Turn on system audio.” | Implemented | `src/main/features/recorder.ts:622-631` |
| **System stream dropped** | If remote-participant audio disappears, Notetaker warns that only the mic is being recorded and suggests switching speakers/headphones back. | Offline equivalent — dropped system audio produces a mic-only warning and direct local capture retry. | `src/main/features/recorder.ts:622-631`<br>`src/renderer/src/recorder/main.tsx:158` |
| **Capture recovery probe** | Packaged feature flags include system-audio probing, silence-floor detection, dropped-audio cards, and capture recovery. | Offline equivalent — Murmur retries the local capture window directly instead of Wispr feature-flag probes. | `src/renderer/src/capture/main.ts:204-219`<br>`src/main/features/recorder.ts:615-620` |
| **No capture at all** | After trying to restart capture, “Notetaker isn't getting any audio” offers Dismiss or Restart Flow, then asks the user to record again. | Implemented | `src/main/features/recorder.ts:290-318`<br>`src/main/features/recorder.ts:721-730` |
| **Mic silence timer** | After three minutes without mic sound, a warning names the selected mic and suggests checking mute/device selection. | Implemented | `src/main/features/recorder.ts:223-229` |
| **Escalated mic silence** | Continued silence escalates to “Still there? Notetaker isn't hearing anything”; both levels offer Ignore or Microphone settings. | Implemented | `src/main/features/recorder.ts:110-123`<br>`src/main/features/recorder.ts:240-246`<br>`src/renderer/src/recorder/main.tsx:168` |
| **Automatic mic rescue** | The main bundle identifies meeting apps and can switch to a meeting-matched mic; notification names previous mic, new mic, and app and offers Undo. | Not applicable — browser capture APIs do not expose Wispr's meeting-app mic rescue. | — |
| **Mic switch card** | A persistent card can show which mic is recording for the current meeting app and be dismissed. | Not applicable — browser capture APIs do not expose Wispr's meeting-app mic rescue. | — |
| **Virtual-device filtering** | Packaged logic recognizes loopback devices such as BlackHole, VB-Cable/VB-Audio, Zoom Audio Device, and Microsoft Teams Audio. | Offline equivalent — Murmur filters virtual, loopback, stereo-mix, VoiceMeeter, cable, and system-audio devices from the primary microphone list. | `src/renderer/src/hub/settings/SettingsDialog.tsx:223-227` |
| **Mic unavailable mid-meeting** | Recorder says “Microphone unavailable — stop and resume the meeting to retry.” | Implemented | `src/renderer/src/recorder/main.tsx:159` |
| **Connection lost** | “We lost the connection. Your audio was saved,” preserving locally captured audio up to the failure. | Offline equivalent — Capture is written incrementally on-device, so a network-connection-loss state is unnecessary. | `src/main/features/recorder.ts:659-673`<br>`src/main/features/recorder.ts:567-595` |
| **Offline recording choice** | If live transcript is unavailable, the user can Cancel or “Record offline”; audio is saved on-device for later transcription. | Not applicable — Murmur always records locally. | — |
| **Offline reassurance** | During a meeting the transcript panel says, “You're offline. Don't worry, we're still recording!” | Implemented | `src/renderer/src/recorder/main.tsx:168`<br>`src/main/features/recorder.ts:659-673` |
| **Offline gap marker** | Transcript records “Offline for {{duration}} — audio was captured and will be transcribed after the meeting.” | Not applicable — local recording has no network-streaming gap. | — |
| **Sleep gap marker** | Transcript records device sleep duration; a separate stop notification can say Notetaker stopped when the computer slept. | Implemented | `src/main/features/recorder.ts:683-695` |
| **Failed live start with saved audio** | Start failure distinguishes no audio (nothing saved) from failed live transcription with on-device audio retained. | Offline equivalent — Murmur’s local no-audio retry and crash recovery replace cloud live-start failure variants. | `src/main/features/recorder.ts:273-279`<br>`src/main/features/recorder.ts:567-595` |
| **Retry start** | Failed recording offers Try again or Discard. | Implemented | `src/renderer/src/recorder/main.tsx:163` |
| **Low disk warning** | “Storage almost full” estimates remaining recording minutes and asks the user to free space. | Implemented | `src/main/features/recorder.ts:237-245`<br>`src/renderer/src/recorder/main.tsx:160` |
| **Storage-full processing state** | Post-processing pauses with “Storage full. Free up space on your computer, then retry.” | Implemented | `src/main/features/recorder.ts:334-340`<br>`src/renderer/src/recorder/main.tsx:160-163` |
| **Audio encoding** | Meeting rows track encode retries, upload deferral, upload time, and recording stop sequence so interrupted encoding can resume safely. | Offline equivalent — Crash-safe PCM files and a final WAV replace cloud encode/upload retry fields. | `src/main/features/recorder.ts:321-343`<br>`src/main/features/recorder.ts:567-587` |
| **Incremental Opus encoding** | Packaged workers include standard and incremental Opus encoders for long-running capture without retaining all PCM in memory. | Offline equivalent — crash-safe incremental PCM persistence replaces cloud-oriented Opus streaming. | `src/main/features/recorder.ts:659-673` |
| **Local audio durability** | Recording-stop sequence and “audio saved up to here” copy indicate chunk/sequence-based recovery across network failures. | Offline equivalent — PCM chunks are appended on-device and recovered after restart rather than tracked by cloud stop sequences. | `src/main/features/recorder.ts:659-673`<br>`src/main/features/recorder.ts:567-595` |

## Meeting detection, calendar matching, and automatic behavior

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Supported detected platforms** | Native detection enumerates Google Meet, Zoom, Microsoft Teams, and Slack; UI also has Webex and generic meeting copy. | Implemented | `src/main/features/recorder.ts:525-540` |
| **Browser meeting detection** | Known meeting URLs include `meet.google.com`, `app.zoom.us`, and other conferencing sites across Chrome-family, Firefox, Safari, Arc, Edge, and related browsers. | Implemented | `src/main/features/recorder.ts:525-535` |
| **Desktop app detection** | Known process/bundle identities cover Zoom, Teams, Slack, Webex, Dialpad, Gather, Aircall, Discord, and other call apps. | Implemented | `src/main/features/recorder.ts:525-535` |
| **Signal fusion** | Detection state records platform, active app/process evidence, conference identity, calendar match, preread, and whether a recording is already active. | Offline equivalent — Murmur combines foreground process/title and visible meeting-window evidence locally. | `src/main/features/recorder.ts:530-540` |
| **Calendar late matching** | Analytics/state include late-matched and late-linked detected meetings, allowing a recording to acquire calendar identity after start. | Not applicable — local ICS import has no hosted late-linking service. | — |
| **Detection notification** | Default `autoDetectMeetingsEnabled=true` produces a prompt rather than starting automatically. | Implemented | `src/shared/settings.ts:304-305`<br>`src/main/features/recorder.ts:530-540` |
| **Detection do-nothing mode** | Settings offer “Notify me” versus “Do nothing.” | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:373`<br>`src/main/features/recorder.ts:530-540` |
| **Ignored-prompt adaptation** | Repeatedly closing or ignoring prompts can offer notification management or automatically disable notices with a Turn back on action. | Implemented | `src/main/features/recorder.ts:536-559` |
| **Re-enable reminder** | “Never miss meeting notes” asks to turn notifications back on; actions are Not now and “Yes, remind me.” | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:170-175` |
| **Auto-start opt-in** | Disabled by default; banners and post-meeting prompts explain that Notetaker starts as soon as a meeting begins and can always be stopped. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:177-182`<br>`src/main/features/recorder.ts:489-499` |
| **Auto-start dependency** | Auto-start requires automatic meeting detection; settings explain the dependency. | Offline equivalent — The local detector drives auto-start directly; no separate hosted dependency state is stored. | `src/main/features/recorder.ts:530-540` |
| **Auto-start consent gate** | Automatic capture refuses to start when organizational consent policy requires confirmation. | Offline equivalent — Murmur uses an optional copy-to-chat consent notice instead of organization policy automation. | `src/main/features/recorder.ts:284-291` |
| **Auto-start rapid-stop nudge** | Two quick stops trigger an offer to disable auto-start or keep it enabled. | Implemented | `src/main/features/recorder.ts:425-440` |
| **Auto-start undo** | When disabled through the nudge, a notification offers Undo. | Implemented | `src/main/features/recorder.ts:431-439` |
| **Uncalendared auto-start experiment** | A packaged flag allows auto-start from detection even when no calendar event matches. | Offline equivalent — Local process detection can auto-start without calendar data; no experiment flag is needed. | `src/main/features/recorder.ts:534-540` |
| **Auto-end** | Enabled by default; Notetaker stops automatically when the call ends. | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:377`<br>`src/main/features/recorder.ts:561-564` |
| **Auto-ended recovery** | “Notetaker stopped” offers Resume when termination was premature. | Implemented | `src/main/features/recorder.ts:394-406` |
| **Silence stop** | Notification state includes “Recording stopped silence,” distinguishing silence-based ending from normal stop. | Implemented | `src/main/features/recorder.ts:230-235`<br>`src/main/features/recorder.ts:394-406` |
| **Calendar-end check-in** | Recorder can check at scheduled end time before continuing a long capture. | Offline equivalent — Murmur uses one-hour and hard-limit safety timers rather than calendar-end cloud evidence. | `src/main/features/recorder.ts:247-252` |
| **One-hour check-in** | Long-meeting check-in is enabled by default and has a dedicated one-hour notification. | Implemented | `src/main/features/recorder.ts:248` |
| **Maximum-length check-in** | A warning fires shortly before the configured hard maximum. | Implemented | `src/main/features/recorder.ts:247-252` |
| **Maximum recording choices** | Settings expose 30 minutes, 1, 2, 3, 4, or 6 hours; live default is 2 hours. | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:376`<br>`src/shared/settings.ts:306` |
| **Open Notepad on record** | Enabled by default through `notetakerOpenWindowOnRecord`. | Offline equivalent — The notepadView setting opens the local Notepad when recording starts. | `src/main/features/recorder.ts:280-283`<br>`src/shared/settings.ts:309` |
| **Adaptive auto-hide** | If the user repeatedly closes Notepad at start, an offer asks to hide it by default; acceptance is undoable. | Implemented | `src/renderer/src/recorder/main.tsx:104-114`<br>`src/renderer/src/recorder/main.tsx:181` |
| **Auto-open summary** | Enabled by default; when notes are ready the Notepad opens directly to Summary. | Implemented | `src/main/features/recorder.ts:443-459`<br>`src/shared/settings.ts:312` |
| **Adaptive summary suppression** | Repeatedly closing auto-opened summaries triggers “Don't open summary after meetings?”; acceptance is undoable. | Implemented | `src/renderer/src/recorder/main.tsx:115-120`<br>`src/renderer/src/recorder/main.tsx:183` |
| **Automatic speaker-name detection** | Enabled by default and reads participant names from the meeting UI/calendar so transcript names can be attributed. | Implemented | `src/main/features/recorder.ts:207-212`<br>`src/main/features/recorder.ts:353-368` |
| **Meeting room evidence** | Calendar events store room data and a feature flag supports meeting-room evidence for identity matching. | Not applicable — local ICS data has no hosted room enrichment. | — |

## Consent and privacy controls

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Persistent consent reminder** | Recorder displays “Always get consent when transcribing others. Learn more.” | Implemented | `src/renderer/src/recorder/main.tsx:162`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:398-405` |
| **Organization consent gate** | Before capture, policy can require a modal: “Obtain consent to start Notetaker,” with Cancel or Consent obtained. | Offline equivalent — Organization policy has no offline authority; Murmur provides a user-controlled consent notice. | `src/renderer/src/hub/settings/SettingsDialog.tsx:398-405` |
| **Default chat notice** | Default message: “Hi everyone — quick note that I'm using Wispr Notetaker to transcribe this meeting so I can stay present. Let me know if you'd like me to turn it off.” | Offline equivalent — Murmur uses the same consent intent with local branding and a focus-oriented default message. | `src/shared/settings.ts:314`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:398-405` |
| **Automatic consent posting** | Optional setting posts a consent notice to meeting chat when Notetaker starts. | Offline equivalent — Murmur safely offers Copy / I’ve posted it instead of automating another app’s chat. | `src/renderer/src/hub/settings/SettingsDialog.tsx:398-405`<br>`src/main/features/recorder.ts:284-291` |
| **Custom consent text** | User can edit the posted message, leave it unchanged for default, or Reset to default. | Offline equivalent — The consent message is editable in local settings and copied to the meeting chat manually. | `src/renderer/src/hub/settings/SettingsDialog.tsx:398-405` |
| **Admin-locked consent text** | Organization policy can set a message that members cannot edit. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Chat automation accessibility** | Failure caused by missing Accessibility permission offers “Open System Settings.” | Not applicable — Murmur intentionally does not automate another app's meeting chat. | — |
| **Posting failure fallback** | If automatic posting fails, UI asks the user to send the copy manually or obtain permission directly. | Not applicable — Murmur uses a safe clipboard consent workflow rather than chat automation. | — |
| **Copy consent message** | Copy action has explicit success and failure feedback. | Implemented | `src/renderer/src/recorder/main.tsx:162` |
| **Quit after notice failure** | User may continue after handling consent or “Quit and discard meeting.” | Not applicable — Murmur uses a safe clipboard consent workflow rather than chat automation. | — |
| **Discard confirmation** | Discarding after consent failure warns that recording, notes, and transcript are irrecoverably removed and nothing is saved. | Not applicable — Murmur uses a safe clipboard consent workflow rather than chat automation. | — |
| **Calendar notice** | For organizer-owned Google Calendar events, Wispr can add a Notetaker notice or notice plus notes link to the event description. | UI-only (mobile/team/billing) — requires Wispr account, team, billing, or hosted sharing services unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Calendar notice availability** | It is organizer-only and Google-only; Outlook shows “Not available … yet.” | UI-only (mobile/team/billing) — requires Wispr account, team, billing, or hosted sharing services unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Per-meeting controls** | Upcoming meeting menu can override calendar notice and auto-share audience before the meeting. | Offline equivalent — Local calendar rows provide join, brief, snooze, and start controls; hosted notice/share overrides are omitted. | `src/renderer/src/hub/pages/NotetakerPage.tsx:200-216` |
| **Meeting status disclosure** | Rows show whether notice/link and auto-share are on, and after completion describe what was added/shared. | Offline equivalent — Rows disclose local consent and filing state, not hosted share delivery. | `src/renderer/src/hub/pages/NotetakerPage.tsx:237-245` |
| **HIPAA/BAA block** | Personal or team HIPAA BAA policy can make Notetaker unavailable and direct an owner/admin to revoke it. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Blocked attendee domains** | Organization admins can block Notetaker when invitees match configured domains; dialog lists triggering attendees. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Private Cloud Sync gate** | Team policy can require cloud sync before Notetaker is available; members are told to contact an admin. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Transcript retention policy** | Admin-defined duration triggers a 24-hour warning before older transcripts are deleted. | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:390`<br>`src/main/features/meetings.ts:236-258` |
| **Deleted-transcript state** | Drawer explicitly says transcript was deleted by retention policy and links to retention settings. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:180-185`<br>`src/main/features/meetings.ts:236-258` |
| **Private thoughts** | “My thoughts” are explicitly excluded when sharing the note. | Offline equivalent — My thoughts stay in the local note and are never uploaded or shared. | `src/renderer/src/recorder/main.tsx:164-167` |
| **Org insights toggle** | New meetings can be visible to an organization’s AI for insights; each meeting may override the default. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |

## Live transcript, diarization, and corrections

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Live transcript panel** | Enabled by default; words appear while Notetaker is active. | Implemented | `src/renderer/src/recorder/main.tsx:90-102`<br>`src/renderer/src/recorder/main.tsx:164-168` |
| **First utterance prompt** | Empty transcript greets with “Welcome to Notetaker!” and “Try saying ‘Hi Notetaker’.” | Implemented | `src/renderer/src/recorder/main.tsx:168` |
| **Toggle transcript** | Meeting UI can show/hide the live transcript without stopping capture. | Implemented | `src/renderer/src/recorder/main.tsx:164-168` |
| **Postprocess promise** | Live view explains that after the meeting Wispr improves the transcript and labels speakers. | Implemented | `src/renderer/src/recorder/main.tsx:168` |
| **Live reconnect** | Main-process API can force reconnection of the streaming transcript. | Offline equivalent — Local ASR has no streaming network connection to reconnect. | `src/main/features/recorder.ts:615-620` |
| **Live viewer registration** | Renderer registers a live transcript viewer separately from capture, so closing/reopening UI need not stop recording. | Offline equivalent — The recorder window subscribes to local recorder events independently of capture. | `src/renderer/src/recorder/main.tsx:90-99` |
| **Speaker placeholders** | Before attribution, transcript uses You, Them, numbered speakers, and room “voice {{voice}}” labels. | Implemented | `src/main/features/recorder.ts:124-140`<br>`src/main/features/recorder.ts:353-368` |
| **Speaker count** | Transcript reports singular/plural speaker counts. | Offline equivalent — The library derives participant count from distinct local speaker IDs. | `src/renderer/src/hub/pages/MeetingPage.tsx:142-145` |
| **After-meeting naming** | Tooltip says speaker names will be added after the meeting. | Implemented | `src/renderer/src/recorder/main.tsx:168` |
| **Streaming labels experiment** | Feature flags support desktop streaming speaker labels and quick-summary live labels. | Not applicable — proprietary streaming experiments are excluded. | — |
| **Assign speaker names** | User can open “Assign speaker names,” label a speaker, and apply the assignment. | Implemented | `src/main/features/meetings.ts:286-290`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:186-200` |
| **Calendar-assisted identities** | Participant names and identity contacts are stored with meetings to map diarized voices to people. | Offline equivalent — Local ICS data has no participant identities; users rename speakers directly. | `src/main/features/recorder.ts:207-212` |
| **Speaker-map revisions** | Meetings persist generated speaker map, pending-push state, draft transcript timestamp, and separate user assignment edits. | Offline equivalent — Direct transcript edits replace Wispr’s cloud speaker-map revision protocol. | `src/main/features/meetings.ts:279-318` |
| **Room-label edits** | A separate field stores manual edits to room/voice labels. | Offline equivalent — Direct speaker renaming replaces a separate cloud room-label field. | `src/main/features/meetings.ts:286-290` |
| **Play speaker clip** | Labeling UI can play or stop a short clip of a selected speaker’s voice. | Implemented | `src/main/features/meetings.ts:331-340`<br>`src/renderer/src/hub/notetaker/SpeakerClipButton.tsx:16-48` |
| **Voice embedding utility process** | `voiceEmbedderHost.js` runs ONNX inference outside the Electron main process and returns an embedding per PCM sample request. | Not applicable — proprietary cloud diarization models are excluded. | — |
| **Embedding integrity** | The host verifies the model file SHA-256 before initialization and returns `sha_mismatch` on failure. | Not applicable — proprietary cloud diarization models are excluded. | — |
| **Embedding preprocessing** | It converts 16 kHz speech into overlapping 400-sample windows at 160-sample hops, applies mean removal/pre-emphasis, FFT power, mel features, log scaling, and feature centering. | Not applicable — proprietary cloud diarization models are excluded. | — |
| **Embedding minimum clip** | A clip with no complete feature frame fails as `clip_too_short`. | Not applicable — proprietary cloud diarization models are excluded. | — |
| **Embedding runtime** | Windows/non-macOS uses CPU ONNX with single intra/inter-op threads; macOS probes CoreML and falls back to CPU on timeout/error/non-finite output. | Not applicable — proprietary Wispr voice-embedding runtime is excluded. | — |
| **Embedding isolation and cleanup** | Samples are zero-filled after each request; utility process supports timeout, restart limit, and explicit kill. | Not applicable — proprietary Wispr voice-embedding utility process is excluded. | — |
| **Embedding role** | Voice vectors support speaker relinking/diarization; names remain a separate user/calendar attribution layer. | Not applicable — proprietary cloud diarization models are excluded. | — |
| **Edit transcript line** | Line menu enters editable text with Save edit, Cancel edit, and Saving edit… states. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:87-96`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:190-200` |
| **Empty correction guard** | A transcript correction cannot be empty. | Implemented | `src/main/features/meetings.ts:292-299` |
| **Optimistic conflict guard** | If the source line changed elsewhere, save fails with “This line changed elsewhere.” | Implemented | `src/main/features/meetings.ts:292-311` |
| **Save failure retry** | Correction failures preserve edit state and offer Try again. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:87-96`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:190-195` |
| **Original versus edited** | Corrected lines are marked Edited and can reveal “Original transcript.” | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:197-200` |
| **Revert correction** | Revert restores original text. | Implemented | `src/main/features/meetings.ts:313-318`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:200` |
| **Delete transcript line** | Delete marks a line deleted; Undo is available immediately. | Implemented | `src/main/features/meetings.ts:320-329`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:99-108` |
| **Correction identity** | Corrections bind meeting, artifact digest/revision, transcript entry ID, original text, and edited text, preventing application to the wrong ASR artifact. | Implemented | `src/main/features/meetings.ts:292-311` |
| **Transcript search** | Drawer searches transcript text, shows current/total match count, and provides previous/next navigation. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:66-70`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:173-179` |
| **Copy transcript** | Copy has copied, failed, and no-transcript states. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:111-123` |
| **Copy meeting Markdown** | Whole meeting can be copied as Markdown with success/failure feedback. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:142-143`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:208-213` |
| **Imported transcript gaps** | Zoom, Granola, Fireflies, Otter, and generic imports each explain when no transcript came with the source. | Offline equivalent — Generic local imports show an empty transcript/summary state; provider-specific cloud variants are omitted. | `src/renderer/src/hub/pages/NotetakerPage.tsx:237-245` |
| **New-audio staleness** | Transcript warns when a newer recording exists than the displayed transcript. | Offline equivalent — The summary warns on newer local audio; transcript artifacts are updated directly. | `src/renderer/src/hub/pages/MeetingPage.tsx:215-217` |

## Live translation and language handling

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Translate live transcript** | Transcript menu offers “Translate transcript,” with Beta badge and target-language search. | Offline equivalent — A local language picker uses the configured CLI translation without a hosted Beta menu. | `src/main/features/recorder.ts:59-66`<br>`src/renderer/src/recorder/main.tsx:161` |
| **Translation discovery** | A callout says “Translate this meeting live” and can be dismissed. | Implemented | `src/main/features/recorder.ts:261-271` |
| **Automatic language nudge** | When another language is detected, notification offers Not now or Translate live transcript. | Implemented | `src/main/features/recorder.ts:68-102` |
| **Active language state** | Header says “Translating to {{language}}.” | Implemented | `src/renderer/src/recorder/main.tsx:161` |
| **Original access** | Each translated row states its detected source language and keeps Original available. | Implemented | `src/main/features/recorder.ts:128-140`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:197` |
| **Unknown source language** | Row can say only “Translated. Original available” when detection is uncertain. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:197` |
| **Switch target language** | Changing target displays “Changing language…” and reassures that transcript capture continues. | Implemented | `src/renderer/src/hub/notetaker/SummaryLanguagePicker.tsx:31-64` |
| **Turn translation off** | Turning off translation also preserves ongoing transcript capture. | Implemented | `src/renderer/src/recorder/main.tsx:161` |
| **Offline limitation** | Translation is unavailable while live transcript is offline. | Offline equivalent — Translation uses the configured local CLI and is not gated by network transcript state. | `src/main/features/recorder.ts:59-66` |
| **Translation fallback** | Failure shows original language rather than blank content. | Implemented | `src/main/features/recorder.ts:59-66`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:197` |
| **Switch error** | Failure to change target asks the user to try again. | Offline equivalent — CLI errors are reported through the standard local toast path. | `src/renderer/src/hub/notetaker/SummaryLanguagePicker.tsx:53-63` |
| **Unsupported-language warning** | Notetaker states the current supported-language count and warns that other languages may have errors. | Implemented | `src/main/features/recorder.ts:68-102`<br>`src/main/features/recorder.ts:266-270` |
| **Older English-only warning** | A retained variant warns that non-English transcripts may contain more errors and offers Continue anyway. | Not applicable — local Whisper does not use the retired English-only cloud model. | — |
| **Per-language nudge suppression** | Preferences remember languages already warned and translation-detection languages already shown. | Implemented | `src/shared/settings.ts:340-341` |

## My thoughts, meeting note, and media

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Private manual notes** | “My thoughts” editor says: “Write your notes here. We'll make a separate summary at the end.” | Implemented | `src/renderer/src/recorder/main.tsx:164-168` |
| **Live note persistence** | Manual text is saved independently as `Meetings.notes`, with pending-push state separate from generated summary. | Implemented | `src/main/features/meetings.ts:273-278` |
| **Save failure badge** | Unsaved editor changes show “Couldn't save changes.” | Implemented | `src/renderer/src/recorder/main.tsx:167` |
| **Dictate into notes** | Editor exposes the push-to-talk key (“{{pttKey}} to dictate”) and can finish-and-paste or cancel dictation. | Offline equivalent — Global dictation can target the focused notes editor; Notepad has no separate cloud dictate transaction. | `src/renderer/src/recorder/main.tsx:167` |
| **Summary-ready inline link** | Notes placeholder changes to “Your summary is ready. Check it out →”. | Implemented | `src/renderer/src/recorder/main.tsx:167` |
| **First-notes coachmark** | First transcript experience points out “Take your own notes here.” | Implemented | `src/renderer/src/recorder/main.tsx:165` |
| **Insert images** | Notes accept PNG, JPEG, WebP, GIF, and BMP with per-note count and per-file MB limits surfaced dynamically. | Implemented | `src/renderer/src/hub/notetaker/MeetingNotesEditor.tsx:5-7`<br>`src/renderer/src/hub/notetaker/MeetingNotesEditor.tsx:45-68` |
| **Meeting media state** | Images store dimensions, bytes, content type, local blob, remote key, registration/upload/deleted/failed state, and expiring retrieval URL. | Offline equivalent — Murmur stores note images locally and has no remote meeting-media upload lifecycle. | `src/main/db.ts:256-270` |
| **Meeting sections** | Pills navigate Brief, My Notes, Summary, Action Items, and generated Artifacts. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:168` |
| **Section append** | Chat can generate and append a named section with Generating, added, and failed states. | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:64-76`<br>`src/main/features/meetings.ts:446-458` |
| **Document recovery** | If an unsaved generated summary is recovered, UI says it is available in Docs. | Not applicable — hosted document recovery does not apply to locally persisted notes. | — |

## Summary generation, versions, and feedback

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Automatic end-of-meeting summary** | After capture, pipeline uploads/reads audio, transcribes/refines, then summarizes into a short meeting note. | Implemented | `src/main/features/recorder.ts:443-455`<br>`src/main/meetings/summary.ts:27-60` |
| **Processing phases** | UI distinguishes Uploading audio, Transcribing audio/Refining transcript, Summarizing/Generating summary, Complete, Failed, and Abandoned. | Offline equivalent — Murmur shows local transcribing, refining, summarizing, complete, and failed states; cloud upload and abandoned-job phases do not apply. | `src/renderer/src/hub/pages/MeetingPage.tsx:223-228`<br>`src/renderer/src/recorder/main.tsx:169` |
| **Progress counter** | Generation presents “step {{n}} of {{total}}” and accessible running status. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **Friendly upload copy** | Upload stage is framed as turning the meeting into a two-minute read and can include meeting duration. | Offline equivalent — the local first processing step reports meeting duration and frames the result as a two-minute read without an upload stage. | `src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **Transcription copy** | Stage can include word or speaker counts while “Getting every word.” | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **Summarization copy** | Stage says it is finding action items and decisions / turning conversation into next steps. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/MeetingPage.tsx:223-228`<br>`src/main/meetings/summary.ts:27-34` |
| **Retry pipeline** | Recoverable failure offers Retry/Retrying; reruns distinguish uploading new audio, updating transcript, and updating notes. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:147-160`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **No source for summary** | If neither transcript nor audio exists, summary generation is unavailable. | Implemented | `src/main/meetings/summary.ts:27-31`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **Too-short meeting** | A meeting can be explicitly “too short to summarize.” | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **Imported summary headings** | Imported output is labeled Summary (Zoom), Summary (Granola AI), Summary (Fireflies), or Summary (Otter AI). | Offline equivalent — Imports retain importSource chips; Murmur does not brand third-party summary headings. | `src/renderer/src/hub/pages/NotetakerPage.tsx:237-245` |
| **Imported no-summary state** | “This meeting came without a summary.” | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:237-245`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **Manual generate** | Imported or otherwise unsummarized meetings can offer “Generate summary.” | Implemented | `src/main/meetings/summary.ts:27-34`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:223-228` |
| **Summary read time** | Display estimates `{{minutes}} min read`. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:215-220` |
| **Copy summary** | Dedicated accessible copy action reports “Copied summary.” | Offline equivalent — a dedicated Copy markdown action reports success; local clipboard failure uses the shared renderer error path rather than a separate summary state. | `src/renderer/src/hub/pages/MeetingPage.tsx:208-213` |
| **Search summary** | Meeting summary has an in-section search box. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:71-75`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:208-210` |
| **Enhanced Summary label** | Generated section is explicitly labeled Enhanced Summary. | Implemented | `src/renderer/src/recorder/main.tsx:169`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:217` |
| **Refinement pass** | Refinement first identifies speakers, then polishes summary and marks “Summary refined.” | Implemented | `src/main/features/recorder.ts:345-373`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:217` |
| **Refinement illustration topics** | Example structure includes TL;DR, Decisions, and Next steps. | Offline equivalent — The local summary prompt requests concise structured headings, decisions, and actions. | `src/main/meetings/summary.ts:6-14` |
| **New recording staleness** | Summary warns “New audio since this summary” / “New recording since this summary” and offers Update Summary. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:215-217` |
| **Update safety** | Failed update keeps and displays the previous summary. | Offline equivalent — Regeneration writes a new summary only after valid output and retains version history. | `src/main/meetings/summary.ts:58` |
| **Candidate summary** | Meeting stores candidate summary plus metadata separately from delivered/current summary for comparison or healing. | Offline equivalent — Prior and generated summaries are versioned locally instead of keeping a cloud candidate slot. | `src/main/meetings/summary.ts:35-60` |
| **Delivered summary** | A distinct delivered summary field preserves what was sent/shown after later regeneration. | Implemented | `src/main/meetings/summary.ts:51-55` |
| **Summary preview** | Compact preview is stored separately for meeting-list rendering. | Offline equivalent — The meeting list derives its preview from the current local summary. | `src/main/meetings/store.ts:75-98` |
| **Summary comparison** | Internal comparison presents Summary 1 and 2; user can prefer either, choose Neither is good, or No clear preference. | Not applicable — Wispr's internal summary experiment is excluded. | — |
| **Comparison selection** | Editing is disabled until a summary is selected; chosen version becomes the meeting summary and vote is saved. | Not applicable — Wispr's internal summary experiment is excluded. | — |
| **Thumb feedback** | Positive/negative feedback opens tailored optional-note dialog and can be removed later. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:220`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:243` |
| **Feedback safeguards** | Changed-summary and rate-limit states prevent rating the wrong version or submitting too quickly. | Offline equivalent — Feedback is bound to the summary generation timestamp locally; hosted rate limiting does not apply. | `src/main/features/meetings.ts:585-593` |
| **Summary language picker** | Summary can be generated/read in a selected language, with Auto (detected language) and Original rows. | Implemented | `src/renderer/src/hub/notetaker/SummaryLanguagePicker.tsx:25`<br>`src/main/meetings/summary.ts:70` |
| **Language generation state** | UI distinguishes generating, switching, updating, and active translated summary. | Implemented | `src/renderer/src/hub/notetaker/SummaryLanguagePicker.tsx:25-70` |
| **Stale translated version** | If source changes, UI says the selected language needs regeneration and temporarily shows Original. | Implemented | `src/renderer/src/hub/notetaker/SummaryLanguagePicker.tsx:28-70`<br>`src/main/meetings/summary.ts:70-101` |
| **Unavailable translated version** | Missing language version falls back to Original; excessive new languages are throttled for an hour. | Not applicable — separate cloud summary localization is excluded. | — |
| **Summary templates** | No named summary-template picker appears under the assigned UI prefixes; reusable output formats are exposed as Skills and chat-generated sections instead. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:15-16`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:208-211` |
| **Meeting versions** | Each saved content version records source, optional transform ID/prompt, and timestamp, supporting generated-format history without overwriting provenance. | Implemented | `src/main/db.ts:227-235`<br>`src/main/meetings/summary.ts:35-56` |
| **Ready notification** | “Your summary is ready!” names the meeting or says “Synthesized your notes,” with View summary. | Implemented | `src/main/features/recorder.ts:449-459` |
| **Completion celebration** | Ready view compresses duration/word count into a “2 min read” and rotates celebratory copy. | Implemented | `src/renderer/src/recorder/main.tsx:171` |

## Chat with a meeting, Ask Wispr, and Skills

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Per-meeting chat** | Drawer tab “Chat” starts with “Ask anything about this meeting.” | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:103-117` |
| **Ask anything field** | Placeholder is “Ask anything,” or “Ask anything, or type / for Skills” when Skills are enabled. | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:103-117` |
| **Suggested prompts** | Built-ins include What did I miss?, Write a follow-up email, Identify blind spots, Make notes longer, Make me sound smart, and Suggest questions. | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:14-21`<br>`src/renderer/src/hub/notetaker/MeetingChatRail.tsx:120-121` |
| **What did I miss** | Catch-up compares recent content and can answer “Nothing new since you last looked.” | Implemented | `src/main/features/meetings.ts:365-377` |
| **Flow summary insertion** | Chat can generate a Flow summary and add it to meeting notes. | Offline equivalent — Chat answers can be added to My thoughts, including generated summaries. | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:111-114` |
| **Artifacts** | Chat can create named artifacts and reports “Created artifact: {{title}}”; fallback title is Artifact. | Implemented | `src/main/features/meetings.ts:446-458`<br>`src/renderer/src/hub/notetaker/MeetingChatRail.tsx:64-76` |
| **Edit meeting notes from chat** | Agent can report “Updated meeting notes.” | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:111-114` |
| **Stop generation** | Chat supports explicit Stop processing and marks an interrupted response `[Request stopped]`. | Implemented | `src/main/features/meetings.ts:370-386`<br>`src/renderer/src/hub/notetaker/MeetingChatRail.tsx:116` |
| **Incomplete response** | Partial stream is retained with “This response did not complete” and Retry. | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:39-59`<br>`src/renderer/src/hub/notetaker/MeetingChatRail.tsx:111-114` |
| **Error handling** | Request/send/save failures keep the chat and invite retry. | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:39-59` |
| **Multiple chat sessions** | Meeting drawer can switch sessions, start New chat, rename, load history, and delete with irreversible confirmation. | Implemented | `src/main/features/meetings.ts:392-424`<br>`src/renderer/src/hub/notetaker/MeetingChatRail.tsx:78-109` |
| **Chat history paging** | Empty, loading, load-more, month-relative, and error states are defined. | Offline equivalent — The complete local meeting thread loads at once; remote paging states do not apply. | `src/main/features/meetings.ts:422-424` |
| **Shared-note chat privacy** | Chat on a shared note is usable but not saved. | UI-only (mobile/team/billing) — requires Wispr account, team, billing, or hosted sharing services unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Cross-meeting Ask** | Global “Ask about your meetings” accepts natural-language requests such as “open action items from yesterday.” | Implemented | `src/main/features/meetings.ts:426-433`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:113-125` |
| **Search-to-Ask handoff** | No-match meeting search can ask Wispr about the entered query. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:249-253` |
| **Response copy** | Ask response can be copied with success/failure feedback. | Implemented | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:111-114` |
| **Persistent agent trajectory** | Chat agent state stores trajectory, display sequence, revision, and draft edits separately from message rows. | Offline equivalent — Murmur persists user/assistant messages, not proprietary cloud agent trajectories. | `src/main/features/meetings.ts:349-388` |
| **Message ordering** | Messages track local order, optional server/assigned sequence, turn ID, role, status, JSON content/metadata/feedback, and timestamps. | Offline equivalent — Local chat rows use creation order, role, status, and timestamps without server sequences. | `src/main/features/meetings.ts:349-388` |
| **Chat sync lifecycle** | Chats track upload state, soft deletion, last access for eviction, meeting association, kind, title, and whether note sharing is allowed. | UI-only (mobile/team/billing) — requires Wispr account, team, billing, or hosted sharing services unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Skills menu** | Browse all Skills from the meeting chat, search, or type slash commands. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/notetaker/MeetingChatRail.tsx:116-117`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:211-232` |
| **Skill scopes** | A Skill runs on one meeting, multiple meetings, or both; one-meeting Skills run in meeting chat or against latest meeting in Ask Wispr. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/SkillsPage.tsx:218-232` |
| **Built-in action Skills** | List action items, Follow-up email, Decision log, Open questions, Coach me, Project update, Project retro, Long session breakdown, Study guide, and Draft tickets. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/main/features/skills.ts:20-40` |
| **Built-in domain Skills** | CRM update, Discovery recap, Product brief/PRD, Campaign brief, Client-ready readout, Interview feedback, and Leadership update. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/main/features/skills.ts:20-40` |
| **Cross-meeting Skills** | Outstanding to-dos, Recent decisions, Recap my week, In-flight projects, Customer feedback, Account issue digest, and Prep me for this meeting. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/main/features/skills.ts:20-40` |
| **Custom Skill editor** | User supplies name, one-line description, instructions/rules/output format, lowercase slash command, run scope, and audience. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/renderer/src/hub/pages/SkillsPage.tsx:224-232` |
| **Slash validation** | Commands allow lowercase letters/numbers with single hyphens; required, reserved, personal collision, and team collision errors are explicit. | Offline equivalent — local validation covers syntax, reserved commands, and personal collisions; team collisions do not exist offline. | `src/renderer/src/hub/pages/SkillsPage.tsx:98-112`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:224-230` |
| **Skill limits** | Per-user/team maximum is surfaced dynamically; user must delete one before adding another. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Skill sharing** | Audience can be Just me, department, team, or whole company, with admin-only company controls and irreversible shared status. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Skill shadowing** | Personal/team command can override another shared Skill and detail/menu explains which slash command runs. | Offline equivalent — Commands are locally unique, so shared-scope shadowing is unnecessary. | `src/renderer/src/hub/pages/SkillsPage.tsx:218-220` |
| **Skill copy/edit/delete** | Shared or built-in Skills can be copied; editable Skills support save/discard; deletion warns existing chat answers remain. | Implemented | `src/renderer/src/hub/pages/SkillsPage.tsx:218-224`<br>`src/renderer/src/hub/pages/SkillsPage.tsx:265` |
| **Concurrent Skill edits** | Deleted-on-another-device/team cases let the user save changes as a new personal Skill. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |

## Action items and Todos

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Summary extraction** | Generated summary extracts action items with owners and deadlines where available. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/main/features/recorder.ts:307-316`<br>`src/main/meetings/summary.ts:27-56` |
| **Meeting action-item section** | Section shows remaining items, supports Add action item, Mark all as completed, Archive all, and View all in Tasks. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:231` |
| **Empty meeting tasks** | “No remaining action items for this meeting.” | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:231` |
| **Todo provenance** | Each Todo may reference a meeting; task list displays “From {{meetingName}}” and can open the source note. | Implemented | `src/main/features/todos.ts:22-30`<br>`src/renderer/src/hub/pages/TasksPage.tsx:150-165` |
| **Manual task** | Users can add a task from a meeting or global My Tasks using “New task.” | Implemented | `src/main/features/todos.ts:59-76`<br>`src/renderer/src/hub/pages/MeetingPage.tsx:231` |
| **Completion** | Checkbox changes open/completed status with accessible title-aware label. | Implemented | `src/main/features/todos.ts:78-94`<br>`src/renderer/src/hub/pages/TasksPage.tsx:150-165` |
| **Archive lifecycle** | Tasks can be archived/unarchived, bulk archived, restored, or permanently deleted; toasts offer Undo. | Implemented | `src/main/features/todos.ts:96-111`<br>`src/renderer/src/hub/pages/TasksPage.tsx:118-135` |
| **Archive all confirmation** | Meeting/global archive confirmation varies singular/plural and notes items can be restored from Archived. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:231`<br>`src/renderer/src/hub/pages/TasksPage.tsx:205-212` |
| **Task views** | Tabs include By date created, By priority, and Archived; priority currently says it is coming soon. | Offline equivalent — Murmur implements date, priority, and archived views locally; priority is functional rather than coming soon. | `src/renderer/src/hub/pages/TasksPage.tsx:103-110` |
| **Task search** | Search/clear/close states and “No tasks match your search” are defined. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:175-196` |
| **Task date groups** | Recent groups include Yesterday, Last week, and Older. | Implemented | `src/renderer/src/hub/pages/TasksPage.tsx:16-25` |
| **Task ordering** | Persistent real-valued `sortOrder` supports stable manual ordering without rewriting all tasks. | Implemented | `src/main/features/todos.ts:50-70` |
| **Calendar action automation** | A task can create a calendar event with title, start/end, description, and guests; requires connected Google Calendar. | Offline equivalent — uses local Whisper, local files, deterministic code, or the configured Claude/Codex CLI instead of a hosted service. | `src/main/features/todos.ts:112-139` |
| **Email action automation** | A task can draft/send email with To, Subject, and Body; requires connected Gmail. | Offline equivalent — local email drafts replace connected-account sending. | `src/renderer/src/hub/pages/TasksPage.tsx:250-260` |
| **Task connector errors** | Calendar/email actions distinguish not connected, reauthentication required, generic error, and success. | Offline equivalent — Local mailto/ICS actions avoid account reauthentication states. | `src/main/features/todos.ts:112-139` |

## Calendar connection, schedule, and briefs

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Calendar choice onboarding** | User chooses Google/Outlook/iCloud/none/other; current live preference is `none`. | Offline equivalent — A local `.ics` source replaces provider account choice. | `src/renderer/src/hub/settings/SettingsDialog.tsx:487-496` |
| **Google Calendar OAuth** | Connect/Connecting/Connected/Failed states open browser authorization. | Offline equivalent — Local `.ics` file/URL import replaces Google OAuth. | `src/renderer/src/hub/settings/SettingsDialog.tsx:487-496` |
| **Outlook OAuth** | Separate Outlook connecting/connected copy exists; some older onboarding still labels Outlook “coming soon.” | Offline equivalent — Local `.ics` file/URL import replaces Outlook OAuth. | `src/renderer/src/hub/settings/SettingsDialog.tsx:487-496` |
| **iCloud limitation** | UI says iCloud is not compatible yet and promises notification when available. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Permission completeness** | Google requires “Select all”; Outlook requires calendar access on Microsoft’s permission screen. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Reconnect calendar** | Disconnected state asks to reconnect to keep schedule synced. | Offline equivalent — Re-importing or refreshing a local `.ics` source replaces account reconnection. | `src/renderer/src/hub/settings/SettingsDialog.tsx:487-496` |
| **Manual sync** | Hub offers Sync calendar and reports Syncing, just now, minutes/hours ago, or weekday/time. | Offline equivalent — Refreshing imported `.ics` data replaces cloud calendar sync. | `src/main/features/meetings.ts:195-210` |
| **Upcoming meetings** | Today/tomorrow schedule displays title, time, attendees, color, RSVP, conference URL, and Now/Conflict/Declined/Maybe states. | Implemented | `src/main/meetings/ics.ts:56-93`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:192-216` |
| **Upcoming empty state** | Connected calendar says no more meetings today/tomorrow; disconnected state prompts connection. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:219-225` |
| **Join action menu** | Upcoming row has accessible open/close menu and primary Join meeting. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:200-216` |
| **Reminder timing** | Scheduled prompts can fire right before (15 sec), 1 minute, 2 minutes, or Never; default is 15 seconds before and enabled. | Implemented | `src/shared/settings.ts:303`<br>`src/main/features/meetings.ts:214-233` |
| **Remind later** | Upcoming notification can snooze for two minutes. | Implemented | `src/main/features/meetings.ts:569-574`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:213` |
| **Calendar identity enrichment** | Connection is pitched as adding meeting titles, participant names, accurate speaker labels, and richer summaries. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Pre-meeting brief** | Calendar event can carry preread title/content/summary and completed version. | Offline equivalent — Murmur creates a local brief from similarly titled past meetings. | `src/main/features/meetings.ts:576-584`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:290` |
| **Brief UI** | Detail tab “Brief” can be shown/hidden and includes join/start CTA. | Implemented | `src/renderer/src/hub/pages/MeetingPage.tsx:168-171`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:290` |
| **Brief context** | Connectors can enrich briefs with recent conversations, open commitments, unresolved decisions, and external app context. | Offline equivalent — The local brief uses prior Murmur meetings, not third-party connectors. | `src/main/features/meetings.ts:576-584` |
| **Missing Slack context** | Banner invites connecting Slack to include relevant message context. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Calendar event controls** | Event records per-event notetaker notice and auto-share overrides. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Recurring event identity** | `seriesKey`, occurrence start, alternate conference URL, connector key, rooms, and external ID support robust matching. | Offline equivalent — The ICS parser expands recurrence into stable local occurrence IDs. | `src/main/meetings/ics.ts:27-53`<br>`src/main/meetings/ics.ts:77-93` |

## Meeting library, search, folders, and sharing

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Library tabs** | My notes/Past notes, Shared with me, and Folders; shared tab announces unread count. | Offline equivalent — Past notes, Today, Shared with me, and Folders are visible; Shared is an offline notice without unread sync. | `src/renderer/src/hub/pages/NotetakerPage.tsx:229-235` |
| **Past meeting row** | Shows title, relative date/time, length, participant count, summary placeholder, task completion chip, and import-source chip. | Offline equivalent — Rows show local title/date/duration/people/tasks/import source and summary state. | `src/renderer/src/hub/pages/NotetakerPage.tsx:237-245` |
| **Daily view** | Today page shows Up Next plus done-for-day summaries with meeting, duration, word, and people counts. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:235-236` |
| **Meeting search** | Searches personal/shared notes with source, date (Today/7/30 days/any), attendee, and folder filters. | Offline equivalent — Local search covers title, transcript, notes, summary, date range, and folder; hosted attendee/source filters are absent. | `src/main/meetings/store.ts:75-98`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:229-233` |
| **Search warnings** | Invalid words/date, capped results/scan, and temporary search failure are distinct. | Not applicable — local deterministic search has no remote cap/failure states. | — |
| **Locked history** | Limited seats can access/search only last 30 days; older notes remain saved but locked pending upgrade/full seat. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Restore locked meeting** | After access returns, UI says notes and summary will reappear once restored to the device. | Offline equivalent — No local note is locked; the offline edition keeps all history available. | `src/renderer/src/hub/pages/NotetakerPage.tsx:235` |
| **Create/edit folder** | Folder has name and optional description used for automatic-use suggestions. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:263-288` |
| **Folder picker** | Search personal/shared folders, create new, add/remove note, and show chips/overflow. | Implemented | `src/renderer/src/hub/notetaker/MeetingFolderPicker.tsx:15-64` |
| **Folder deletion** | Deletes only folder; notes remain in library, while members lose access obtained only through that folder. | Offline equivalent — Deleting a local folder leaves its meetings intact; there are no remote members. | `src/renderer/src/hub/pages/NotetakerPage.tsx:296-306` |
| **Folder ownership** | Detail shows owner, people, description, note count, and “Only you” for private folders. | Offline equivalent — All local folders show Only you, description, and meeting count. | `src/renderer/src/hub/pages/NotetakerPage.tsx:263-275` |
| **Shared folder membership** | Add/remove email members with invalid, duplicate, self, no-account, ineligible, batch-max, and already-member errors. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Folder access grants** | Folder can be shared to individuals, department, or entire company; admin policy can prohibit grants. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Leave folder** | Member can leave after warning that notes accessible through it will be lost. | Offline equivalent — All folders are local and owned by the user, so Delete replaces a member leave flow. | `src/renderer/src/hub/pages/NotetakerPage.tsx:296-306` |
| **Folder links** | Copy/open link handles anonymous/no access, unsynced, deleted, and connection errors. | Not applicable — hosted folder links do not apply offline. | — |
| **Folder sharing block** | Admin may freeze sharing while retaining membership; owner/member copy explains visibility and filing consequences. | Not applicable — hosted folder sharing does not apply offline. | — |
| **Folder duplicate meeting versions** | If multiple people add the same meeting, Versions dialog lists copies and folders and lets user choose which to open. | Not applicable — hosted sync conflicts do not apply offline. | — |
| **Suggested folder** | App can recommend a shared folder for a note with Add or Skip. | Offline equivalent — Folder descriptions support manual filing; Murmur does not run a hosted shared-folder recommender. | `src/renderer/src/hub/pages/NotetakerPage.tsx:281-288` |
| **Recurring-series sync** | Adding/removing a recurring meeting can offer automatic future series filing and optional past backfill. | Not applicable — hosted recurring-series sync does not apply offline. | — |
| **Company-domain sync** | Adding a meeting with a company domain can offer automatic future filing and optional past meetings. | Not applicable — hosted organization sync does not apply offline. | — |
| **Sync safety** | Series/domain sync has caps, partial-backfill warning, and separate stop-sync confirmation; shared-folder copy discloses visibility. | Not applicable — hosted folder sync does not apply offline. | — |
| **Share note dialog** | Search people/email, add suggested participants or all participants, clear recipients, and Share. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Share visibility** | Options are invited only, everyone at domain with link, or anyone with link. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Summary versus transcript access** | Links share summary only; explicit invite is required for transcript unless organization allows it. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Transcript lock explanation** | Shared recipient is told owner must invite their email, or that organization policy never shares transcripts. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Share roles** | Owner, Contributor, and Viewer roles are represented. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Share delivery** | Invitation email tracks pending/sent/failed and reports rejected/ineligible recipients. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Share errors** | Handles cloud-sync disabled, org sharing disabled, enterprise-only domain sharing, not found, rate limit, clipboard, and generic failure. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **Shared folders from share dialog** | A note can be added to or removed from shared folders while managing access. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |

## Imports

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Import hub entry** | Empty past-notes page offers “Import meetings”; setup card says Granola or Otter, while dedicated flows exist for Zoom, Granola, and Fireflies. | Offline equivalent — The reachable importer accepts local audio/transcript files and offers cloud-provider offline notices. | `src/renderer/src/hub/pages/NotetakerPage.tsx:249-259`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Zoom OAuth connection** | “Import from Zoom” connects a paid Zoom account and imports meetings the user hosted with transcript or summary. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Zoom picker window** | Lists hosted meetings from the last 30 days, newest content status, duration, transcript/summary badges, pagination, select all, and multi-select import. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Zoom ineligible rows** | Greyed rows explain no content, still processing, already imported, or not importable. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Zoom import outcomes** | Counts already imported, policy-blocked, previously deleted, inaccessible, not ready, empty, outside retention, unsupported, and failed meetings. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Zoom background import** | Import runs on servers after window closes, reports progress count, completion/partial/no-new toast, and preserves meetings imported before cancellation/failure. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Zoom reconnect** | Expired access requires reconnect; timeout, account forbidden, read failure, feature unavailable, and server switch-off are distinct. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Granola account import** | Flow connects/signs into Granola, gathers/list meetings, imports notes, summary, and transcript, and can resume a disrupted/paused run. | Offline equivalent — Murmur reads Granola’s local cache instead of signing into an account. | `src/main/features/meetings.ts:486-507` |
| **Granola local export import** | Accepts Granola `.zip` or `.csv` export and validates UTF-8, headers, archive consistency, CSV presence, row count, size, and non-empty meetings. | Implemented | `src/main/features/meetings.ts:149-181`<br>`src/main/features/meetings.ts:508-533` |
| **Granola progress** | Shows current/total and warns not to close app; transcript hydration may continue in background after meeting records are imported. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:59-64`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:168` |
| **Granola cancellation** | Confirmation explains already written meetings remain and import can be finished later. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:168`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:295` |
| **Granola resumability** | Import run snapshots/manifest, cancellation request, timestamps, account hash, and per-transcript queue attempts/state allow restart. | Offline equivalent — Already imported/deleted local records are skipped; no cloud run manifest is needed. | `src/main/features/meetings.ts:486-507` |
| **Granola queue deduplication** | Transcript queue has unique source document identity and claim/reap indexes to prevent duplicate concurrent hydration. | Offline equivalent — Local import is single-process and skips tombstoned records; no hydration queue exists. | `src/main/features/meetings.ts:486-507` |
| **Granola source uninstall** | macOS-oriented flow can offer to uninstall Granola after successful migration, with manual Trash fallback. | Not applicable — Granola's macOS uninstall flow does not apply on Windows. | — |
| **Fireflies API-key connection** | User opens Developer settings, copies API key, and pastes it; access is read-only and key regeneration revokes it. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Fireflies eligibility** | Only meetings organized by the user with transcript or summary appear, newest first. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Fireflies reconnect** | Invalid/regenerated key, forbidden account, read failure, unavailable feature, and lost access each have tailored copy. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Fireflies import progress** | Supports pagination, import progress, complete/partial/none/stopped toast, policy block, reconnect requirement, and server switch-off. | UI-only (cloud) — requires a hosted or third-party account service unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:255-258`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:292` |
| **Import provenance** | Meeting `importSource` drives source chips and source-specific transcript/summary headings. | Offline equivalent — importSource drives visible local source chips. | `src/main/features/meetings.ts:62-83`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:237-245` |
| **Import deletion memory** | Zoom explicitly does not re-import meetings the user deleted earlier. | Offline equivalent — Local import tombstones prevent deleted Granola records from returning. | `src/main/features/meetings.ts:342-345`<br>`src/main/features/meetings.ts:493-500` |
| **Retention enforcement on import** | Source meetings older than transcript-retention policy are not imported. | Offline equivalent — Local retention is enforced over stored meetings; cloud provider imports are unavailable. | `src/main/features/meetings.ts:236-258` |

## Limits, failures, and notifications

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Weekly quota warning** | At one note remaining, banner states the weekly limit and reset date. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Weekly quota reached** | Start is blocked with “You have no meeting notes left this week”; actions are OK or Upgrade. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Live quota state** | Current profile stores counted IDs, count 0, limit 50, remaining 50, week start, and next reset. | Offline equivalent — Murmur stores a simple local limit/remaining counter, not Wispr’s weekly account envelope. | `src/shared/settings.ts:331`<br>`src/main/features/recorder.ts:175` |
| **New-note quota tooltip** | Disabled entry point shows reset date. | UI-only (mobile/team/billing) — requires Wispr account, team, billing, or hosted sharing services unavailable offline. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **30-day history limit** | Limited seat can retain but not open/search older meetings until seat/plan upgrade. | UI-only (cloud) — rendered as unavailable because Murmur has no Wispr account/commerce/team backend. | `src/renderer/src/hub/shell/CloudDialogs.tsx:57-65` |
| **Processing rate limit** | “Servers are busy” retries automatically, optionally at a stated time. | Not applicable — local processing has no hosted rate limit. | — |
| **Slow upload** | Meeting remains saved and asks retry on a faster network. | Not applicable — local processing has no upload stage. | — |
| **Unreachable upload service** | Suggests disabling VPN/work-network restrictions or switching network; toast says network may be blocking upload. | Not applicable — local processing has no upload service. | — |
| **Waiting for connection** | Processing can remain queued rather than failing while offline. | Offline equivalent — Local processing proceeds offline; it never waits for a cloud connection. | `src/main/features/recorder.ts:112-158` |
| **Full audio unavailable** | Retry is disabled when the complete recording no longer exists. | Not applicable — audio remains in local storage. | — |
| **Summary notification** | Ready notification opens summary and can identify the meeting. | Implemented | `src/main/features/recorder.ts:449-459` |
| **Recording stopped notification** | Can open the saved meeting; variants cover normal, silence, calendar end, auto-end, and sleep. | Implemented | `src/main/features/recorder.ts:394-406` |
| **Post-short-meeting nudge** | Dedicated notification encourages trying Notetaker again after a too-short recording. | Implemented | `src/main/features/recorder.ts:408-423` |
| **Recorder discovery nudges** | First/second prompts vary between notes, action items, transcription, and “nothing joins the call,” with later/not-this-one/no-thanks choices. | Implemented | `src/main/features/recorder.ts:475-501` |
| **Calendar-page nudge** | Promises speaker attribution, action items, and full summary, with Connect calendar or Not now. | Implemented | `src/renderer/src/hub/pages/NotetakerPage.tsx:219-225` |
| **Translation notifications** | Intro modal, callout, and detected-language notification each track whether shown. | Implemented | `src/main/features/recorder.ts:68-102`<br>`src/main/features/recorder.ts:261-271` |
| **Skills callout** | “Introducing Skills” explains reusable follow-ups/updates and can browse or dismiss. | Implemented | `src/main/features/recorder.ts:460-468` |
| **Retention notifications** | Modal/banner warn 24 hours before policy removal and deep-link to Notetaker. | Implemented | `src/main/features/meetings.ts:236-258` |
| **Import completion notification** | Zoom has a dedicated finished notification in addition to in-app toasts. | Offline equivalent — Local imports report completion with in-app toasts; Zoom server import is unavailable. | `src/renderer/src/hub/pages/NotetakerPage.tsx:66-92` |
| **Notification throttling state** | Each named notification stores last shown time and count to enforce eligibility/max-display rules. | Offline equivalent — Murmur stores generic local nudge counters, not every Wispr notification key. | `src/main/features/recorder.ts:104-108` |

## Data model

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **`Meetings` identity** | `id` PK; title; created/modified timestamps; calendar external ID and occurrence start; identity contacts; participant names; import source; tour-demo marker. | Offline equivalent — the local table stores core identity, timestamps, import source, and tour marker; Wispr contact/calendar-sync identity fields are omitted. | `src/main/db.ts:101-117`<br>`src/main/db.ts:220-226` |
| **`Meetings` lifecycle** | synced, deleted, finalized, endedAt, recordedMs, latest stop sequence, server-recording-live, current/pending job, and server modification stamp. | Offline equivalent — local deletion, end time, duration, processing phase, and audio timestamps replace cloud sync/job lifecycle fields. | `src/main/db.ts:101-117`<br>`src/main/db.ts:220-226` |
| **`Meetings` transcript pipeline** | live transcript pending/uploaded/retries, transcript ready/deleted, refine status/retries/stop sequence/failure, audio upload/defer/encode retries, and refined upload/fetch stamps. | Offline equivalent — transcript, summary status, audio path, and processing phase cover the local ASR pipeline without upload/retry stamps. | `src/main/db.ts:101-117`<br>`src/main/db.ts:220-226` |
| **`Meetings` content** | private notes, summary, candidate summary/metadata, delivered summary, preview, summary language, and per-field pending-push flags. | Offline equivalent — private notes, current/delivered summary, and update timestamps are local; candidate/language push fields are omitted. | `src/main/db.ts:101-117`<br>`src/main/db.ts:220-226` |
| **`Meetings` speakers** | avatar pick, speaker artifact upload/retries, speaker map/draft timestamp, generated assignments, user assignment edits, room-label edits, and document draft timestamp. | Not applicable — proprietary Wispr speaker-artifact, embedding, and cloud speaker-map schema is excluded. | — |
| **`Meetings` sharing/policy** | share slug/visibility, org insights and pending state, history locked, content withheld, feedback, ready event IDs, and ready booleans. | UI-only (cloud) — hosted sharing and organization policy have no local schema; the Shared tab shows an offline notice. | `src/renderer/src/hub/pages/NotetakerPage.tsx:235` |
| **`MeetingVersions`** | UUID PK, meeting ID, full content, source, optional transform ID/prompt, and creation time. | Implemented | `src/main/db.ts:227-235`<br>`src/main/meetings/summary.ts:35-56` |
| **`MeetingMedia`** | media UUID, meeting ID, BLOB, dimensions/bytes/type, remote key, registered/uploaded/deleted/failed flags, and expiring GET URL. | Offline equivalent — Murmur has local note-image BLOB storage; remote registration/upload/URL state is unnecessary. | `src/main/db.ts:256-270` |
| **`TranscriptCorrections`** | UUID, meeting, artifact revision/digest, entry ID, original/edited text, created/updated; unique `(artifactDigest, entryId)` index. | Implemented | `src/main/db.ts:237-248`<br>`src/main/features/meetings.ts:292-311` |
| **`NotetakerChats`** | chat/user/kind/meeting/title, upload state, deletedAt, created/modified/accessed timestamps, and `shareNote`; indexes support meeting history, eviction, and upload. | Offline equivalent — one durable local thread is represented by meeting_chat; cloud user/upload/eviction fields are unnecessary. | `src/main/db.ts:132-140` |
| **`NotetakerChatMessages`** | message/chat/user/turn identity; local, server, and assigned ordering; role/status; JSON content, metadata, feedback; timestamps. | Offline equivalent — local rows store ID, meeting, role, content, status, and timestamp without server ordering metadata. | `src/main/db.ts:132-140`<br>`src/main/features/meetings.ts:349-388` |
| **`NotetakerChatAgentStates`** | one row per chat with user, JSON trajectory, display sequence, revision, update time, and JSON draft edits. | Not applicable — proprietary hosted chat-agent trajectory state is excluded. | — |
| **`CalendarEvents`** | external ID PK, title/start/end/status, conference and alternate URLs, connector, series, organizer/RSVP/color, participants/names/rooms, sync/notify stamps. | Not applicable — local ICS events are parsed into memory/KV and do not require Wispr’s cloud calendar schema. | — |
| **`CalendarEvents` preread/control** | preread title/content/summary/version/completed version/dispatched time plus per-event calendar notice and auto-share settings. | Offline equivalent — a brief is generated from local prior meetings; hosted notice/share controls are omitted. | `src/main/features/meetings.ts:576-584` |
| **`Todos`** | UUID, optional meeting ID, title, open/completed status, deleted/archived flags, created/modified, sync flag, and real-valued sort order. | Offline equivalent — the local table has meeting provenance, title, status, archive/delete flags, timestamps, priority, and real sort order; cloud sync flags are omitted. | `src/main/db.ts:89-99`<br>`src/main/features/todos.ts:50-94` |
| **`Folders`** | UUID, owner, name/description, owner flag, counts, JSON grants, access-via type, sharing-blocked flag, and timestamps. | Offline equivalent — local private folders store name, description, timestamp, and derived meeting count; cloud owner/grant fields are omitted. | `src/main/db.ts:119-130`<br>`src/main/meetings/store.ts:116-120` |
| **`FolderMeetings`** | composite folder/meeting PK with share slug, adding user/time, event key, and recorded duration; meeting lookup index. | Offline equivalent — a local composite folder/meeting key provides filing without hosted share/event metadata. | `src/main/db.ts:126-130` |
| **`SharedNotes`** | share slug PK, title/notes/summary/search text, owner identity/avatar, caller role, meeting/event identity, access path, duration, and timestamps. | Not applicable — hosted shared-note records do not apply offline. | — |
| **`GranolaImportRun`** | run/user/account hash, JSON snapshot/manifest, cancellation request, created/updated; user-update index. | Not applicable — cloud import-run snapshots do not apply to the synchronous local-cache importer. | — |
| **`GranolaTranscriptQueue`** | queue/source document/meeting/user/account, state, attempts, last error, timestamps; unique source document plus claim/reap indexes. | Not applicable — the synchronous local-cache importer has no cloud transcript hydration queue. | — |
| **Observed database state** | All listed Notetaker-area tables contained zero rows in the supplied profile copy; schema/defaults, migrations, config, and packaged UI therefore provide the inventory evidence. | Not applicable — supplied-profile row counts are observed data, not an implemented feature. | — |

## Settings & defaults

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **`prefs.user.autoDetectMeetingsEnabled` → `true`** | detect supported calls and surface Notetaker prompt. | Implemented | `src/shared/settings.ts:304-305`<br>`src/main/features/recorder.ts:530-540` |
| **`prefs.user.notetakerAutoStartEnabled` → `false`** | do not begin capture automatically when a meeting starts. | Implemented | `src/shared/settings.ts:305`<br>`src/main/features/recorder.ts:530-540` |
| **`prefs.user.notetakerAutoStartOptInState` → `None`** | auto-start choice has not yet been made. | Implemented | `src/shared/settings.ts:318` |
| **`prefs.user.notetakerAutoEndEnabled` → `true`** | stop when call-end evidence is detected. | Implemented | `src/shared/settings.ts:307`<br>`src/main/features/recorder.ts:561-564` |
| **`prefs.user.notetakerLongMeetingCheckInEnabled` → `true`** | show long-recording safety check-ins. | Implemented | `src/shared/settings.ts:319`<br>`src/main/features/recorder.ts:247-248` |
| **`prefs.user.notetakerMaxRecordingLength` → `2hr`** | hard-stop target is two hours, with warning beforehand. | Implemented | `src/shared/settings.ts:306`<br>`src/main/features/recorder.ts:206-206` |
| **`prefs.user.notetakerLiveTranscriptEnabled` → `true`** | show streaming transcript in Notepad. | Implemented | `src/shared/settings.ts:310`<br>`src/renderer/src/recorder/main.tsx:164-168` |
| **`prefs.user.notetakerAttributeNamesEnabled` → `true`** | display speaker labels/names. | Implemented | `src/shared/settings.ts:311`<br>`src/renderer/src/recorder/main.tsx:168` |
| **`prefs.user.notetakerAutoDetectParticipantNamesEnabled` → `true`** | read meeting participants to assist attribution. | Implemented | `src/shared/settings.ts:320`<br>`src/main/features/recorder.ts:207-212` |
| **`prefs.user.notetakerNotepadOnStart` → `open`** | open Notepad when capture starts. | Implemented | `src/shared/settings.ts:309`<br>`src/main/features/recorder.ts:280-283` |
| **`prefs.user.notetakerOpenWindowOnRecord` → `true`** | bring up recorder window on recording. | Offline equivalent — notepadView=open is the local setting that opens Notepad on record. | `src/shared/settings.ts:309`<br>`src/main/features/recorder.ts:280-283` |
| **`prefs.user.notetakerSplitScreenJoinEnabled` → `false`** | do not auto-arrange call and Notepad side by side. | Implemented | `src/shared/settings.ts:321` |
| **`prefs.user.hideMeetingRecorderInScreenShare` → `false`** | Notepad/Flow Bar remain visible to screen capture unless changed. | Implemented | `src/shared/settings.ts:308`<br>`src/main/features/recorder.ts:258-260` |
| **`prefs.user.notetakerAutoOpenSummaryEnabled` → `true`** | open ready summary after a meeting. | Implemented | `src/shared/settings.ts:312`<br>`src/main/features/recorder.ts:443-459` |
| **`prefs.user.notetakerAutoOpenSummaryCloseCount` → `0`** | no early-close evidence yet for adaptive disable offer. | Implemented | `src/shared/settings.ts:323`<br>`src/renderer/src/recorder/main.tsx:115-120` |
| **`prefs.user.notetakerEarlyNotepadCloseCount` → `0`** | no evidence yet for adaptive auto-hide offer. | Offline equivalent — the local counter defaults to zero and drives the on-device adaptive auto-hide prompt. | `src/shared/settings.ts:324`<br>`src/renderer/src/recorder/main.tsx:104-114` |
| **`prefs.user.notetakerAutoHidePromptShown` → `false`** | auto-hide recommendation has not been shown. | Offline equivalent — the local flag defaults false and suppresses the on-device recommendation after it has been handled. | `src/shared/settings.ts:325`<br>`src/renderer/src/recorder/main.tsx:104-114` |
| **`prefs.user.notetakerCalendarNotificationsEnabled` → `true`** | send scheduled meeting reminders. | Implemented | `src/shared/settings.ts:326`<br>`src/main/features/meetings.ts:214-233` |
| **`prefs.user.notetakerCalendarNotificationTiming` → `15_seconds_before`** | notify right before meeting. | Implemented | `src/shared/settings.ts:303`<br>`src/main/features/meetings.ts:214-233` |
| **`prefs.user.notetakerCalendarChoice` → `none`** | no calendar provider selected in supplied profile. | Implemented | `src/shared/settings.ts:327` |
| **`prefs.user.notetakerCalendarNotice` → `off`** | do not modify organizer event descriptions. | UI-only (cloud) — the preference defaults off, and hosted event-description modification is unavailable. | `src/shared/settings.ts:328`<br>`src/renderer/src/hub/shell/CloudDialogs.tsx:11-21` |
| **`prefs.user.notetakerConsentChatMessage` → `null`** | use default consent message. | Offline equivalent — Murmur stores a branded default message directly and allows local editing/copying. | `src/shared/settings.ts:313-314`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:398-405` |
| **`prefs.user.notetakerAutoShareNotes` → `off`** | do not automatically share notes. | UI-only (cloud) — shared notes are unavailable offline. | `src/renderer/src/hub/pages/NotetakerPage.tsx:235` |
| **`prefs.user.notetakerAutoShareNotesType` → `all`** | if auto-share is enabled, its scope setting currently targets all meetings. | Not applicable — hosted auto-sharing does not apply offline. | — |
| **`prefs.user.notetakerOrgInsightsDefault` → `true`** | new meetings default visible to org insights where policy supports it. | Not applicable — hosted organization insights do not apply offline. | — |
| **`prefs.user.notetakerMenuBarMeetingEnabled` → `true`** | show next meeting/countdown in menu bar. | Offline equivalent — showNextMeetingInTray defaults true as the local tray preference. | `src/shared/settings.ts:346` |
| **`prefs.user.notetakerTranscriptRetention` → `never_delete`** | user-level local preference does not age out transcripts; org policy may override. | Offline equivalent — transcriptRetentionDays=null means local transcripts never expire. | `src/shared/settings.ts:334` |
| **`prefs.user.notetakerQuota` → limit `50`, remaining `50`** | weekly metered-note envelope in supplied account; resets weekly. | Offline equivalent — Murmur stores the simple local default counter shown; it has no Wispr account week/reset metadata. | `src/shared/settings.ts:331` |
| **`prefs.user.notetakerMeetingCount` → `0`** | no counted Notetaker meetings in supplied profile. | Implemented | `src/shared/settings.ts:332` |
| **`prefs.user.notetakerHasRecordedRealMeeting` → `false`** | first-real-meeting onboarding remains eligible. | Implemented | `src/shared/settings.ts:333` |
| **`prefs.user.notetakerTutorialCompleted` → `false`** | guided tour remains incomplete. | Offline equivalent — guided-tour completion is recorded through the local checklist banner key rather than this Wispr preference. | `src/renderer/src/hub/shell/NotetakerChecklist.tsx:22-27` |
| **`prefs.user.notetakerTranscriptRetention` policy cache fields → `null`** | no last-known organization retention override/banner dismissal. | Offline equivalent — the local retention warning timestamp defaults null; organization-policy cache fields are absent. | `src/shared/settings.ts:334-335` |
| **`prefs.user.granolaImported` → `false`** | Granola migration not completed. | Implemented | `src/shared/settings.ts:336` |
| **`prefs.user.granolaImportBannerDismissed` → `false`** | import promotion remains eligible. | Not applicable — Wispr campaign/banner cache plumbing is excluded. | — |
| **`prefs.user.granola/firefliesExportPromptedAt` → `null`** | competitor migration prompts have not been spent. | Implemented | `src/shared/settings.ts:337-338` |
| **`prefs.user.internal.meetingRecorderAggressiveAutoSave` → `false`** | normal save cadence rather than experimental aggressive autosave. | Implemented | `src/shared/settings.ts:339` |
| **`prefs.cache.meetingDrawer` → `{isOpen:false,heightPx:0}`** | transcript/chat drawer initially closed with no persisted height. | Not applicable — Wispr cache-layout plumbing is excluded. | — |
| **`prefs.cache.notetakerLastTab` → `null`** | no previous Notetaker section to restore. | Not applicable — Wispr cache-layout plumbing is excluded. | — |
| **`prefs.cache.notetakerUnsupportedLanguagesWarned` → `[]`** | no language warning suppressed yet. | Implemented | `src/shared/settings.ts:340` |
| **`prefs.cache.translationDetectedShownLanguages` → `[]`** | translation nudge eligible for every detected language. | Implemented | `src/shared/settings.ts:341` |
| **`prefs.cache.accessFlags.access.show-notetaker-ui` → enabled** | Notetaker navigation/UI is available. | Not applicable — Wispr feature-flag plumbing is excluded; Notetaker is always available locally. | — |
| **`prefs.cache.accessFlags.access.notetaker-ask` → enabled** | Ask/chat feature is available. | Not applicable — Wispr feature-flag plumbing is excluded; local meeting chat is always available. | — |
| **`prefs.cache.accessFlags.access.notetaker-history-limit-*` → enabled** | account participates in history-limit eligibility/activation logic. | Not applicable — Wispr account access-flag plumbing does not apply offline. | — |
| **`syncCoordinator.timestamps.meetings/meetings_shared/folders/calendar/notetaker_policy` → epoch** | supplied profile has not synced these domains yet. | UI-only (cloud) — Murmur has no cloud sync coordinator; the Shared tab displays the offline state. | `src/renderer/src/hub/pages/NotetakerPage.tsx:235` |

# Settings and onboarding

## Settings shell and navigation

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Settings navigation** | The dialog is split into SETTINGS and ACCOUNT groups. Confirmed page IDs are General, System, Notetaker, Vibe coding, Experimental, Connectors, MCP, Internal, Testing, Account, Te… | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:45-64`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:684-697` |
| **Needs-attention badge** | A sidebar row can show a “Needs attention” badge when action is required. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:650-675`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:687-695` |
| **Version footer** | Shows the installed version and doubles as the update status/action surface. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:650-656`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:691-695` |
| **Update states** | Footer copy covers “Checking for updates…”, “Update downloading…”, “Click to update and restart Flow”, “Error updating, please restart”, “Up to date; check again?”, and organizati… | UI-only (cloud) — updates are installed manually; the UI reports the installed version. | `src/renderer/src/hub/settings/SettingsDialog.tsx:650-656`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:691-694`<br>`src/main/tray.ts:128` |
| **Managed updates** | When policy controls updates, manual update behavior is disabled and the sidebar says updates are managed by the organization. `[CLOUD-UI-ONLY]` — requires Wispr organization poli… | UI-only (cloud) — organization update policy does not apply; manual-update UI is shown. | `src/renderer/src/hub/settings/SettingsDialog.tsx:691-694` |

## General settings

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **App Language** | Chooses the Flow Hub UI locale; defaults to System Default (`uiLocale: null`). The picker has search, “No matches found”, and a System Default option. `[LOCAL]` | Implemented — searchable picker with System Default, English and “No matches found”. Flow only offers locales beyond English when Wispr’s remote `localization-framework` flag is on (`availableLocales` falls back to `["en"]`); the installed reference app shows English only, which Murmur matches. | `src/shared/settings.ts:251`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:133-165` |
| **Email language** | Chooses the language of account emails and warns that translation coverage is rolling out and some mail may not yet be fully translated. `[CLOUD-UI-ONLY]` — Murmur has no Wispr ac… | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:136-137` |
| **My languages** | Opens the dictation-language selector and previews the selected languages or “No languages selected”; the observed profile has English selected. `[ASR]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:122-124`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:266-279` |
| **Language selector** | Supports searching 99/100+ languages, multiple selection, removing a language, Auto-detect, and “Save and close.” At least one language or Auto-detect is required. `[ASR]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:266-279` |
| **Hinglish** | Hindi can be switched to “Hinglish” (Hindi in English letters); the tip is dismissible. `[ASR]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:125-127`<br>`src/main/features/dictation.ts:334-339` |
| **Microphone** | Opens a microphone dialog for dictation. Copy explicitly says Notetaker always uses Auto-detect. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:118-120`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:199-228` |
| **Microphone auto-detect** | The default device is “Auto-detect”; ranked physical devices determine fallback preference. `[OS]` | Implemented | `src/shared/settings.ts:245`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:223-227` |
| **Microphone ranking** | “Edit Ranking” enables drag-to-reorder preference, Forget device, and Done Editing. Virtual/other devices are hidden behind “Show other devices (N).” `[OS]` | Implemented — ranking, reorder, filtering and Forget persist to `micRanking`; Auto-detect opens the highest-ranked connected microphone for dictation and meetings. | `src/renderer/src/hub/settings/SettingsDialog.tsx:223-238`<br>`src/main/features/engines.ts:35-44`<br>`src/main/features/dictation.ts:140` |
| **Microphone advisories** | Built-in mic is recommended; AirPods may start slowly and produce more errors; closed-lid laptop mics are unavailable; Jabra devices can report “Put on your headset to use it.” `[… | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:226-239` |
| **Microphone quiz link** | “Find the right mic for you →” launches the microphone recommendation quiz. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:121`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:245-262` |
| **Shortcuts** | Opens the full shortcut editor; the General row summarizes the primary shortcut as “Hold [keys] and speak.” `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:112-114`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:282-317` |
| **Theme** | Chooses Light, Dark, or System. The captured Windows profile is Light. `[LOCAL]` | Implemented | `src/shared/settings.ts:252`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:139-140`<br>`src/main/features/settings.ts:14-15` |
| **Zoom** | Changes text/control size in Hub and Notepad, with a Default marker and an accessible percentage label. The observed factor is `1`. `[LOCAL]` | Implemented | `src/shared/settings.ts:254`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:142-143`<br>`src/main/windows.ts:153-155` |

## Shortcut settings

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Push to talk** | Hold the shortcut to dictate something short; the UI recommends Control+Space. The observed Windows migration uses Caps Lock (`VK 20`) as PTT. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:79`<br>`src/main/shortcuts.ts:16-53` |
| **Hands-free mode** | Starts/stops dictation without holding; UI teaches double-tapping the assigned keys. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:80`<br>`src/main/shortcuts.ts:16-53` |
| **Cancel** | Dismisses an active dictation and notifications; observed default is Escape (`VK 27`). `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:81`<br>`src/main/shortcuts.ts:16-53` |
| **Transform** | Runs Polish/custom transformations and links users to the Transform tab for configuration. `[LLM]` | Offline equivalent — Claude/Codex CLI performs the transform locally. | `src/renderer/src/hub/settings/SettingsDialog.tsx:82`<br>`src/main/shortcuts.ts:16-53` |
| **Transform view changes** | Opens a diff window after Transform. `[LLM]` | Offline equivalent — local transform diff events replace hosted processing. | `src/renderer/src/hub/settings/SettingsDialog.tsx:83`<br>`src/main/shortcuts.ts:16-53` |
| **Command Mode** | Uses selected text and asks Flow or Perplexity; gated behind its feature setting. `[LLM]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:84`<br>`src/main/shortcuts.ts:16-53` |
| **Instruct Mode** | Dictates an instruction to draft a reply using screen context. `[LLM]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:85`<br>`src/main/shortcuts.ts:16-53` |
| **Open Scratchpad** | Opens the Scratchpad window. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:86`<br>`src/main/shortcuts.ts:16-53` |
| **Start Notetaker** | Opens Notetaker and starts a new note/recording; blocked with “Please stop the Notetaker first” if one is already active. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:87`<br>`src/main/shortcuts.ts:16-53` |
| **Paste last transcript** | Pastes the last dictation into the focused application; observed binding is Shift+Alt+Z. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:88`<br>`src/main/shortcuts.ts:16-53` |
| **Copy last transcript** | Copies the last dictation; observed binding is Shift+Alt+X. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:89`<br>`src/main/shortcuts.ts:16-53` |
| **Press Enter** | Lets a key or mouse button issue Enter to send messages faster. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:90`<br>`src/main/shortcuts.ts:16-53` |
| **Focus Mode** | Toggles blocking of configured distracting apps and websites. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:91`<br>`src/main/shortcuts.ts:16-53` |
| **Mouse Shortcuts banner** | A New banner offers setup for a detected mouse, including named-mouse copy, dismiss, and “Start setup.” `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:115-117`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:168-197` |
| **MX Master setup** | Dedicated setup maps side buttons to Dictate and Enter, replacing back/forward behavior; buttons can be tested, reset, or deferred. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:168-197` |
| **Multiple bindings** | “Add another” permits more than one shortcut for a command. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:287-305`<br>`src/main/features/settings.ts:27-35` |
| **Shortcut capture** | “Press key or mouse button” records a replacement; users can edit, remove, reset to default, cancel, or finish. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:287-317`<br>`src/main/features/settings.ts:27-35` |
| **Shortcut validation** | Rejects blocked shortcuts, duplicates, both left/right variants of one key, more than three keys, and keyboard shortcuts without a modifier; valid mouse buttons are allowed. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:287-316`<br>`src/shared/hotkeys.ts:80-106` |
| **PTT/hands-free conflict** | Warns when Hands-free is contained inside a Push-to-talk chord because both may trigger. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:299-305`<br>`src/shared/hotkeys.ts:108-117` |

## System settings — app and dictation

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Launch app at login** | Starts Flow with Windows login; default/observed value is on. Auto-launched startup can suppress opening Hub. `[OS]` | Implemented | `src/shared/settings.ts:255`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:328`<br>`src/main/features/settings.ts:9-13` |
| **Show Flow Bar at all times** | Keeps the floating Flow Bar visible. Turning it off sets permanent hiding; temporary one-hour snooze also makes the switch appear off. `[OS]` | Implemented | `src/shared/settings.ts:256-257`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:329`<br>`src/main/index.ts:43-49` |
| **Flow Bar placement** | Persisted `statusDockEdge` controls the dock edge; observed value is `bottom`. `[OS]` | Implemented | `src/shared/settings.ts:258`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:330`<br>`src/main/windows.ts:96-104` |
| **Dictation Reminder** | Configures where a Flow Bar typing reminder appears: disabled, all apps, previously used apps, or selected categories (AI, documents/notes, email, personal messaging, work messagi… | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:341-344`<br>`src/main/watchers.ts:38-72` |
| **Scratchpad open behavior** | The live System page exposes a Customize row whose current choice is “Resume last note.” Other bundled choices are Open in new tab and Open last active pinned note. `[LOCAL]` | Implemented | `src/shared/settings.ts:266`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:346-361` |
| **Auto-add to dictionary** | Adds corrected words automatically; default/observed value is on. `[LOCAL]` | Implemented | `src/shared/settings.ts:267`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:348`<br>`src/main/features/dictation.ts:671` |
| **Smart Formatting** | Automatically formats dictation; the setting can redirect to the Auto Cleanup tab because controls moved there. Default `aiFormatting` is on. `[LLM]` | Implemented | `src/shared/settings.ts:272-279`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:350` |
| **Creator mode** | Shows “Dictating with Wispr Flow” while dictating; default is off. `[OS]` | Implemented | `src/shared/settings.ts:268`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:349`<br>`src/renderer/src/status/FlowBar.tsx:169` |
| **Email auto signature** | Adds either “Written with Wispr Flow” or “Spoken with Wispr Flow” to dictated email. Default is off with “Written with…” selected. `[OS]` | Implemented | `src/shared/settings.ts:269`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:351`<br>`src/main/features/formatting.ts:184-187` |
| **Context awareness** | Data & Privacy control allows limited relevant active-app text to improve names and meaning; observed `useAxContext` is on. `[OS]` | Implemented | `src/shared/settings.ts:295`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:605`<br>`src/main/features/dictation.ts:112-120` |
| **Reset app** | “Reset & restart” deletes local data but says dictionary, stats, and settings remain saved and re-sync; intended only on support advice. `[CLOUD-UI-ONLY]` — the promised restorati… | Offline equivalent — local reset deletes on-device data and restarts without cloud restoration. | `src/renderer/src/hub/settings/SettingsDialog.tsx:355-360`<br>`src/main/features/app.ts:78-86` |
| **Restart tutorial** | Re-enters microphone, shortcut, and dictation setup while preserving history, settings, and plan. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:356` |
| **LinkedIn profile** | Adds Flow under LinkedIn Apps, with connect/view/disconnect and expired-connection states. `[CLOUD-UI-ONLY]` — requires LinkedIn/Wispr OAuth. | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:352` |

## System settings — sound and notifications

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Dictation and notification sounds** | Master sound switch; default/observed value is on and plays a preview when enabled. `[LOCAL]` | Implemented | `src/shared/settings.ts:260`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:333`<br>`src/main/features/dictation.ts:56-61` |
| **Sound folder** | `selectedSoundFolder: null` uses the built-in/default start, stop, and achievement sounds. `[LOCAL]` | Offline equivalent — built-in synthesized sounds replace downloadable sound packs. | `src/shared/settings.ts:261`<br>`src/renderer/src/capture/main.ts:228-256` |
| **Mute all audio while dictating** | Mutes system audio; on Windows the observed/default setting is on. `[OS]` | Implemented | `src/shared/settings.ts:262`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:322-335`<br>`src/main/features/mediaDuck.ts:16-29` |
| **Pause music while dictating** | Experimental mutually exclusive alternative to mute; turning either one on turns the other off and shows a toast. Default is off. `[OS]` | Implemented | `src/shared/settings.ts:263`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:322-335`<br>`src/main/features/mediaDuck.ts:16-29` |
| **Suggestions notifications** | Tips for setup or improving use; default on. `[LOCAL]` | Implemented | `src/shared/settings.ts:264`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:337-339` |
| **Announcements notifications** | New features/capabilities; default on. `[LOCAL]` | Implemented | `src/shared/settings.ts:264`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:337-339` |
| **Milestones notifications** | Word milestones, streaks, and referral activity; default on. `[LOCAL]` | Implemented | `src/shared/settings.ts:264`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:337-339` |
| **Team updates notifications** | Invitations, join requests, and other team activity; default on. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Team leaderboard updates** | Weekly rank notifications; default on. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Processing-delay notification** | Warns when processing is delayed; observed/default value is on. `[LOCAL]` | Implemented | `src/shared/settings.ts:264`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:337-339`<br>`src/main/features/dictation.ts:412-416` |

## Notetaker settings

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Notetaker page** | Dedicated settings page with “Start tutorial”; most detailed controls are rendered from System’s Notetaker sections. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:367-404` |
| **Automatically detect any call** | Detects meeting apps/calls; default/observed value is on. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:372` |
| **Meeting-detection action** | Can notify the user or do nothing when a call is detected. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:373` |
| **Start Notetaker automatically** | Starts capture when a meeting begins; requires automatic meeting detection. Default is off and opt-in state is `None`. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:374`<br>`src/main/features/recorder.ts:161-175` |
| **Stop when call ends** | Auto-stops Notetaker; default on. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:377`<br>`src/main/features/recorder.ts:249-252` |
| **Open Notepad on start** | Default view options are Open Notepad, Keep Notepad hidden, or Open side by side; observed value is Open. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:380`<br>`src/main/features/recorder.ts:280-283` |
| **Split-screen join** | Places the meeting left and Notepad right; requires accessibility permission. Default off. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:381`<br>`src/main/features/recorder.ts:280-283` |
| **Open summary when ready** | Opens the meeting summary as soon as ready; default on. `[LLM]` | Offline equivalent — local Whisper transcript and Claude/Codex summary opens when ready. | `src/renderer/src/hub/settings/SettingsDialog.tsx:383` |
| **Open window on record** | Opens Notepad when capture starts; default on. `[OS]` | Implemented | `src/main/features/recorder.ts:280-283` |
| **Live transcript** | Shows words as they arrive; default on. Changing it can take effect next meeting. `[ASR]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:387` |
| **Speaker names** | Labels speakers in transcript; default on. `[ASR]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:388` |
| **Auto-detect speaker names** | Reads participant names from meeting UI; default on. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:389` |
| **Maximum recording length** | Options include 30 min, 1, 2, 3, 4, and 6 hours; observed/default is 2 hours, with a warning shortly before stop. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:376`<br>`src/main/features/recorder.ts:206-207` |
| **Keyboard shortcut** | Configures Join meeting / start Notetaker; observed binding is Alt+M+Windows. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:384` |
| **Hide in screen capture** | Makes Notepad and Flow Bar absent from screenshots/screen sharing; default off. UI reminds users to get consent. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:382`<br>`src/main/features/recorder.ts:258-260` |
| **Show next meeting in menu bar** | Shows title/countdown by the tray icon while retaining icon/menu when disabled; default on. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:395`<br>`src/main/tray.ts:29-35` |
| **Calendar notifications** | Heads-up before scheduled meetings: Never, right before/15 seconds, 1 minute, or 2 minutes; enabled by default. The live full-scroll capture displays `2 min`, although the seriali… | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:393-394`<br>`src/main/features/meetings.ts:214-233` |
| **Calendar notice** | Adds a disclosure to organized Google Calendar events. Modes: Off, Notice only, Notice and notes link; Outlook is not supported. Default off. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:396` |
| **Calendar notice permission recovery** | Requires Google Calendar connection and write scopes; reconnect flow asks users to choose “Select all.” `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:396` |
| **Consent chat notice** | Posts a message when Notetaker starts; message can be customized/reset or locked by organization. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:399-404`<br>`src/main/features/recorder.ts:284-291` |
| **Default consent copy** | “Hi everyone — quick note that I'm using Wispr Notetaker to transcribe this meeting…” `[OS]` | Implemented | `src/shared/settings.ts:313-315` |
| **Auto-share notes** | Audience can be no one, all invitees, or same-domain invitees; meeting scope can be all meetings or those with a calendar notice. Defaults are off/all. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:401` |
| **Auto-share restrictions** | Disabled by HIPAA or organization policy; calendar-notice-scoped sharing requires notices enabled. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:401` |
| **Default Notetaker links** | Anyone with link, Shared with team, or Private; transcripts remain invite-only. Observed default is anyone with link. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Org insights for new meetings** | Defaults on; makes new meetings visible to the organization’s AI insights while allowing per-meeting overrides. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:402` |
| **Quote in share emails** | Optionally includes a meeting quote and known speaker in share emails. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:400` |
| **Import your meeting notes** | The live Notetaker page includes an Import action described as bringing over every past meeting note, summary, and transcript; bundled flows cover Granola and other supported prov… | Offline equivalent — local audio/text file import replaces provider account import. | `src/renderer/src/hub/pages/NotetakerPage.tsx:48-53`<br>`src/renderer/src/hub/pages/NotetakerPage.tsx:150-151` |
| **Long-meeting check-in** | Persisted guard for long recordings; default on. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:375`<br>`src/main/features/recorder.ts:247-252` |
| **Transcript retention** | Never delete, 1, 7, 30, 90, 180, or 365 days; default never, may be admin-locked, and shortening deletes older transcripts within 24 hours. `[CLOUD-UI-ONLY]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:390`<br>`src/main/features/meetings.ts:236-258` |

## Vibe coding settings

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Variable recognition** | Better understands code variables by reading the open file in VS Code, Cursor, or Devin. Setup instructs users to enable “Screen Reader Optimized” from the Command Palette. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:412-416` |
| **File Tagging in Chat** | Tags IDE files in Cursor/Devin so spoken file references become usable context; default on. `[OS]` | Implemented | `src/shared/settings.ts:292`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:414`<br>`src/main/features/formatting.ts:132-139` |

## Experimental settings

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Command Mode** | Enables advanced voice commands; default off. `[LLM]` | Implemented | `src/shared/settings.ts:287`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:436`<br>`src/main/shortcuts.ts:16-53` |
| **Press Enter command** | Automatically presses Enter when the user says “press enter” at the end; default off. `[OS]` | Implemented | `src/shared/settings.ts:288`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:437`<br>`src/main/features/formatting.ts:89-92` |
| **Stacked messages** | Splits one dictation into separate messages in messaging apps; default off. `[LLM]` | Implemented | `src/shared/settings.ts:289`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:438`<br>`src/main/features/dictation.ts:549-555` |
| **Focus Mode** | Blocks configured distracting apps/sites, advertised with Option+F; default off. `[OS]` | Implemented | `src/shared/settings.ts:290`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:440`<br>`src/main/watchers.ts:15-26` |
| **Blocked apps** | Lists running apps, supports Add, Added state, and reports load/no-app states. Defaults include Slack and Superhuman identifiers. `[OS]` | Implemented | `src/shared/settings.ts:290`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:444-446`<br>`src/main/watchers.ts:15-26` |
| **Blocked URLs** | Adds domains, rejects duplicates, and ships defaults for Slack, Gmail, Superhuman, X/Twitter, and Hex. `[OS]` | Implemented | `src/shared/settings.ts:290`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:454-457`<br>`src/main/watchers.ts:15-26` |
| **Jabra wear detection** | Automatically switches to a supported Jabra mic when worn and back when removed; default off. `[OS]` | Not applicable — supported Jabra hardware SDK integration is unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:441` |
| **Bulk import** | Imports snippets and dictionary items from files. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:427-432`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:458`<br>`src/main/features/app.ts:185-214` |
| **Email preferences** | Connects Gmail, reads recent sent mail, and generates a writing profile for Instruct Mode; states include loading, connecting, analyzing (up to five minutes), ready, failed, reaut… | Offline equivalent — local writing-style samples replace Gmail analysis. | `src/renderer/src/hub/settings/SettingsDialog.tsx:442` |

## Connectors

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Connectors page** | Says connected apps improve reminders, summaries, and briefs; supports Connect, Connected, Reconnect, Disconnect, Loading, Try again, and Finish connecting. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Google Calendar** | Supplies meeting reminders, context, briefs, speaker identity, notices, and auto-share scoping. Incomplete scope recovery says to choose “Select all.” `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Outlook Calendar** | Supplies reminders; incomplete permissions ask the user to allow calendar access on Microsoft’s permission screen. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Gmail** | Brings email context into Ask Anything/summaries and can power email automations/preferences. Disconnect may delete briefs. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Slack** | Brings current message context into summaries/briefs. Disconnect may delete dependent briefs. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Notion** | References docs in meeting context/briefs. Disconnect may delete dependent briefs. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **GitHub** | Enables GitHub tool integrations. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Linear** | Enables project-management integrations. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Zoom** | Imports past Zoom meetings. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Fireflies** | Imports Fireflies meetings. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Organization blocking** | Connected connectors can remain connected but unavailable, or disconnected connectors can be unavailable, when policy disables them. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:481-498` |
| **Disconnect confirmation** | Provider-specific copy explains lost future access, preserved imported meetings, and possible/permanent brief deletion. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:490-498` |

## MCP settings

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **MCP page** | Gives external AI apps access to Notetaker meeting notes/transcripts, explicitly not dictations. `[CLOUD-UI-ONLY]` — uses Wispr’s hosted MCP and browser authorization. | Offline equivalent — bundled local MCP server exposes on-device meetings. | `src/renderer/src/hub/settings/SettingsDialog.tsx:526-531`<br>`src/main/features/mcp.ts:1-24`<br>`scripts/murmur-mcp.mjs:1-40` |
| **Claude** | “Allow Claude to access your meeting notes and transcripts” through Add to Claude. `[CLOUD-UI-ONLY]` | Offline equivalent — local MCP configuration replaces hosted authorization. | `src/renderer/src/hub/settings/SettingsDialog.tsx:526-531`<br>`src/main/features/mcp.ts:1-24`<br>`scripts/murmur-mcp.mjs:1-40` |
| **ChatGPT** | Adds Wispr as a plugin/custom connector. `[CLOUD-UI-ONLY]` | Offline equivalent — local MCP configuration replaces hosted authorization. | `src/renderer/src/hub/settings/SettingsDialog.tsx:526-531`<br>`src/main/features/mcp.ts:1-24`<br>`scripts/murmur-mcp.mjs:1-40` |
| **Cursor** | Adds Wispr as a Cursor plugin. `[CLOUD-UI-ONLY]` | Offline equivalent — local MCP configuration replaces hosted authorization. | `src/renderer/src/hub/settings/SettingsDialog.tsx:526-531`<br>`src/main/features/mcp.ts:1-24`<br>`scripts/murmur-mcp.mjs:1-40` |
| **Gemini** | Adds Wispr as an app/connector. `[CLOUD-UI-ONLY]` | Offline equivalent — local MCP configuration replaces hosted authorization. | `src/renderer/src/hub/settings/SettingsDialog.tsx:526-531`<br>`src/main/features/mcp.ts:1-24`<br>`scripts/murmur-mcp.mjs:1-40` |
| **Custom MCP URL** | Copy server URL, paste it into another AI tool’s Connectors/Plugins/Customize area, authorize in browser, then search/work with notes; copy success/error states are provided. `[CL… | Offline equivalent — copyable local MCP command/config replaces hosted URL authorization. | `src/renderer/src/hub/settings/SettingsDialog.tsx:526-531`<br>`src/main/features/mcp.ts:1-24`<br>`scripts/murmur-mcp.mjs:1-40` |

## Data and Privacy

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Improve the model for everyone** | Shares audio/transcripts/edits for model evaluation and training; default expression falls back to on when unset, but observed profile has `shareUsageData: false`. Organization/HI… | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:602-604` |
| **Dictation cloud storage** | Stores dictation transcripts, audio, and history on Wispr servers for cross-device features; compiled default is on, observed profile off. HIPAA can lock it off. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:602-604` |
| **Context awareness** | Allows limited relevant text from the active app for spelling and understanding. `[OS]` | Implemented | `src/shared/settings.ts:295`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:605`<br>`src/main/features/dictation.ts:112-120` |
| **Show public information** | Lets contacts with the user’s email see public job/company/LinkedIn information; observed/default on. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:606` |
| **Local data storage** | Store normally, auto-delete every 24 hours, or never store; observed/default is `store_normally`. Organization policy can restrict options. `[LOCAL]` | Implemented | `src/shared/settings.ts:343`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:597-607`<br>`src/main/features/app.ts:43-60` |
| **Auto-delete confirmation** | Warns that transcripts and Polish history older than 24 hours will be deleted across devices. `[CLOUD-UI-ONLY]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:597-614`<br>`src/main/features/app.ts:43-53` |
| **Never-store confirmation** | Warns that all transcript/Polish history is deleted across devices and new items are not stored. `[CLOUD-UI-ONLY]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:597-615`<br>`src/main/features/app.ts:168-184` |
| **Download your data** | Selects categories and prepares a downloadable copy, emailed when ready; states cover preparing, ready-until date, partial, expired, cancelled, failed, too large, cooldown, organi… | Offline equivalent — exports selected categories directly to a local JSON file. | `src/renderer/src/hub/settings/SettingsDialog.tsx:592-612`<br>`src/main/features/app.ts:152-167` |
| **Delete your data** | Category picker covers Dictation history, Dictionary, Meetings, Notes, Personalization, To-dos, or Everything; requires typing `DELETE`, leaves account/settings, and reports in-fl… | Offline equivalent — deletes selected on-device categories after typed confirmation. | `src/renderer/src/hub/settings/SettingsDialog.tsx:592-615`<br>`src/main/features/app.ts:168-184` |
| **Organization-held meetings** | Meetings cannot be selected for deletion when the organization retains them. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Hard refresh notes** | Forces a one-time cloud rescan/retrieval; throttles rapid retries and reports sync progress. `[CLOUD-UI-ONLY]` | Offline equivalent — local notes are read directly from disk and need no cloud rescan. | `src/renderer/src/hub/settings/SettingsDialog.tsx:609-611` |
| **Granola import** | Connects/signs in, gathers and imports all meeting notes/summaries/transcripts, can continue in background, pause/resume/cancel, and recover through CSV export. `[CLOUD-UI-ONLY]` | Offline equivalent — local exported files replace Granola account connection. | `src/renderer/src/hub/pages/NotetakerPage.tsx:150-151`<br>`src/main/features/meetings.ts:250-289` |
| **Otter import** | Background import has processing and paused states. `[CLOUD-UI-ONLY]` | Offline equivalent — local exported files replace Otter account connection. | `src/renderer/src/hub/pages/NotetakerPage.tsx:150-151`<br>`src/main/features/meetings.ts:250-289` |
| **HIPAA BAA** | Individual/org BAA status, sign/manage in Admin Portal, view/download signed PDF, or revoke; cloud storage and sharing restrictions follow it. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:609-611` |

## Account

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Profile** | Edits first name, last name, and profile image; image max is 5 MB, both names are required, and password-like names are rejected. Save reports success/read/upload/network errors.… | Offline equivalent — editable local name and avatar replace a cloud profile. | `src/renderer/src/hub/settings/SettingsDialog.tsx:535-546` |
| **Email** | Displays account email but does not offer local editing. `[CLOUD-UI-ONLY]` | Offline equivalent — editable optional local-profile email replaces account email. | `src/renderer/src/hub/settings/SettingsDialog.tsx:543-546` |
| **Sign out** | Confirmation warns recent transcript history is deleted. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:547` |
| **Delete account** | Requires confirmation phrase and warns all local/server data, memory, and dictionary are deleted; sandbox users can skip typing. `[CLOUD-UI-ONLY]` | Offline equivalent — local-data deletion replaces cloud-account deletion. | `src/renderer/src/hub/settings/SettingsDialog.tsx:547`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:613-615` |
| **Manage account/team** | Account menu links out to hosted management. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Mobile CTA** | “Get Flow on your phone” shows QR code or sends a download link to a validated phone number, with sending/sent/failure states. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |

## Plans and Billing

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Plans page** | Displays current plan, usage, plan cards/table, monthly/annual cycle, prices, feature comparisons, and billing actions. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:572-588` |
| **Free plan card** | Live page shows “For individuals,” `$0/mo`, Current plan, speech-to-text in any app/100+ languages, dictation on Mac/Windows/iOS/Android, learned names/jargon, dictionary/snippets… | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:578` |
| **Free plan usage** | Shows dictation words left this week and Sunday 12 a.m. PT reset; reaching the limit points to Upgrade. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Notetaker quota** | Shows meetings available/locked; observed fresh quota is 50 per week. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Pro plan card** | Live page marks Pro Popular at `$12 per user/mo` with `-20%` annual savings and Upgrade. It lists everything in Free plus unlimited dictations/Notetaker, shared dictionary/snippet… | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:579` |
| **Student** | Free student claim with no credit card and renewal/cancellation date states; promo codes cannot combine with student plans. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Growth & Enterprise card** | Live page starts at `$18 per user/mo` with `-21%` annual savings and Upgrade. It lists SSO/SCIM/domain capture, audit logs/MDM, org-wide HIPAA BAA, admin training controls, indivi… | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:580` |
| **Billing cycle** | Monthly or annual; annual nudge advertises 20% savings and “Update now.” `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:572-576` |
| **Checkout** | Selects bundle (dictation-only or dictation + unlimited Notetaker), plan, seats, promo, and payment summary before Continue to Payment. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Promo code** | Add/remove/apply with invalid, expired, exhausted, already-applied, active-subscription, student, and team-account errors. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:582` |
| **Past due** | Individual and team variants ask to update payment; non-admin members can email admins using a prefilled subject/body. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Subscription sync** | Manual refresh handles cooldown, auth refresh failure, fetch failure, blocked downgrade, no-op failure, sign-in required, and up-to-date states. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Apple subscription** | Apple-billed users are directed to manage via Apple. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Trial grace period** | After a team trial ends, billing details are required within a displayed number of days to retain team/paid features. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |
| **Notetaker free offer** | Limited-time offer can be accepted or skipped; skipping disables Notetaker for everyone on the team. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only billing behavior has no desktop surface. | — |

## Team and organization

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Create team** | Names a team, invites emails, optionally adds more, and can auto-add future users from the same domain. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:550-568` |
| **Eligibility** | Requires Stripe-billed Flow Pro; otherwise shows “You must have Flow Pro …” and Upgrade. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:550-568` |
| **Detected coworkers** | Shows people from the company already using Flow and supports selecting all/deselecting all for invite. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:553-565` |
| **Team trial** | New teammates start individual two-week Pro trials; after day 15 their seat bills on renewal. Reused team trials get 24 hours to add billing before disbanding. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:550-568` |
| **Incoming invite** | Accept/decline; warns that joining an unbilled team can make the user admin/payer. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only team behavior has no desktop surface. | — |
| **Members table** | Name, role, status; roles Member, Admin, IT admin, Super admin; status Active, Pending, or In trial until date. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only team behavior has no desktop surface. | — |
| **Member tabs** | Team members, join requests, and other users on the domain; admins approve/deny, add users, or open Admin Portal. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only team behavior has no desktop surface. | — |
| **SCIM management** | When enabled, user management is locked to the identity provider. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:554-556` |
| **Invite user** | Admins send invites; members send requests. Validates email, self-invite, already invited/in team/in enterprise, and used-trial billing. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:550-568` |
| **Invite link** | Loads and exposes a shareable team invite link. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only team behavior has no desktop surface. | — |
| **Join request** | Orphan-domain users request membership, resend after failure, see submitted/declined/auto-accepted states, and can contact admins. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only team behavior has no desktop surface. | — |
| **Rejoin team** | Former members can rejoin if available; exhausted trial gets 24 hours to add billing. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only team behavior has no desktop surface. | — |
| **Team picker** | Enterprise users select the relevant team, with member count/contact, loading/error/empty states. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only team behavior has no desktop surface. | — |
| **Team consolidation** | Invite coworkers and advertises individual trials, team insights/leaderboards, and automatically learned organization terms. `[CLOUD-UI-ONLY]` | UI-only (mobile/team/billing) — visible offline preview; hosted plans/teams remain unavailable. | `src/renderer/src/hub/settings/SettingsDialog.tsx:550-568` |

## Internal, developer, and testing settings

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Internal page** | Staff-gated page contains hard-coded debug/account-preview controls rather than normal localized user settings. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:502-523` |
| **Candidate ASR routing** | Routes dictation to a candidate Modal ASR endpoint, bypassing edge/geo routing; default off. `[CLOUD-UI-ONLY]` | Not applicable — proprietary Wispr candidate-model routing is excluded. | — |
| **Tone match** | Internal tone-match switch; default off. `[LLM]` | Implemented | `src/shared/settings.ts:296`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:439`<br>`src/main/features/formatting.ts:116-136` |
| **Haptics** | Internal haptics switch; default off. `[OS]` | Not applicable — unsupported Wispr hardware integration is excluded. | — |
| **Save accessibility text** | Automatically stores accessibility captions for debugging; default off. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:512`<br>`src/main/features/dictation.ts:112-120` |
| **AX inspector** | Opens a browser dashboard for recent dictations, accessibility context, spacing, and name traces. `[OS]` | Not applicable — Wispr staff/debug tooling is excluded. | — |
| **Auto-detect instruct mode** | Internal classifier distinguishes instruction from ordinary dictation; default off. `[LLM]` | Implemented | `src/shared/settings.ts:351`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:515`<br>`src/main/features/dictation.ts:445-455` |
| **Flow Bar debug outlines** | Draws colored bounds around Flow Bar layout regions; default off. `[LOCAL]` | Not applicable — Wispr staff/debug tooling is excluded. | — |
| **Overlay debug tint** | Colors extension overlay windows to expose bounds/z-order; default off. `[LOCAL]` | Not applicable — Wispr staff/debug tooling is excluded. | — |
| **Paste Instruct on empty context** | Pastes an Instruct response when before/selection/after are all empty; otherwise shows chat. Default off. `[LLM]` | Not applicable — Wispr internal debug behavior is excluded. | — |
| **Instruct model** | Selects Default or a named internal model. `[LLM]` | Not applicable — proprietary Wispr internal model selection is excluded. | — |
| **Internal data sharing** | Shares transcripts for training and can be toggled with Option+P; Flow Bar turns purple. Default off. `[CLOUD-UI-ONLY]` | Not applicable — Wispr internal telemetry is excluded. | — |
| **Instruct internal data sharing** | Shares transcript, selection, route, and transform details for debugging; default on. `[CLOUD-UI-ONLY]` | Not applicable — Wispr internal telemetry is excluded. | — |
| **Sandbox User Mode** | Creates an isolated account for testing plans/onboarding; signing out destroys it. `[CLOUD-UI-ONLY]` | Not applicable — Wispr cloud account testing is excluded. | — |
| **Plan/status preview** | Temporarily sets plan and subscription status to preview UI. `[LOCAL]` | Not applicable — Wispr staff billing preview tooling is excluded. | — |
| **BLE ring pairing** | Scans, pairs, reports timeout/success, and forgets a BLE mic ring; paired ID/name default empty. `[OS]` | Not applicable — unsupported Wispr hardware integration is excluded. | — |
| **Testing: Feature Flags** | Selects a flag, overrides enabled state/variant/optional merged JSON payload, or resets all to server values. `[CLOUD-UI-ONLY]` | Not applicable — Wispr remote feature-flag tooling is excluded. | — |
| **Testing: restart onboarding** | Restarts from the beginning. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:502-519` |
| **Testing: preserve intents** | Retains fulfilled onboarding intents so answered pages are skipped; default off. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:502-519` |
| **Testing: reset personalization** | Clears style selections/completion so the banner returns. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:517-520` |

## Sign up and authentication onboarding

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Progress rail** | Onboarding stages are Sign up, Permissions, Set up, Learn, and Personalize, each represented in the progress UI. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:13-19`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:274-293` |
| **Login welcome** | “Let’s get you started” / “Accurate voice-to-text, everywhere you work.” `[CLOUD-UI-ONLY]` — uses Wispr identity. | Offline equivalent — local profile setup replaces account sign-in. | `src/renderer/src/hub/onboarding/Onboarding.tsx:70` |
| **Browser sign-in** | “Sign in via browser” launches device/browser authentication; timeout offers retry. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Copy sign-in link** | Copies an auth URL for pasting into any browser, with success/failure states. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Terms** | Signing up agrees to Terms of Service and Privacy Policy links. `[CLOUD-UI-ONLY]` | Offline equivalent — local-only disclosure replaces cloud account terms. | `src/renderer/src/hub/onboarding/Onboarding.tsx:70` |
| **Login carousel** | Promises 4× faster typing, perfectly formatted text, 100+ languages, works in any app/no integrations, and meeting detail capture. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:70` |
| **Continue-onboarding nudge** | “Just a few more steps!” asks the user to return and “Finish onboarding.” `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:280-293`<br>`src/main/watchers.ts:93-101` |

## Get started and profiling onboarding

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Welcome** | Greets by name when known and asks “Where did you hear about us?”; can show referral/gift banners. `[CLOUD-UI-ONLY]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:71` |
| **Product intent** | “How can Flow help you?” multi-selects Dictation and/or Notetaker with live email/Slack formatting and meeting transcript/summary demos. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:72`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:53-58` |
| **About yourself** | Asks occupation/work role: Founder/CEO, Consultant, Operations, Developer, Product, Data Analysis, Sales, Marketing, Customer Support, Recruiting, Creator, Writer, Student, Health… | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:73` |
| **Seniority/work type** | Additional choices include Director, Executive, Freelancer, Individual contributor, Manager, and Other. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:73` |
| **Role testimonial** | Shows role-matched social proof/testimonial and “Trusted by … people like you.” `[CLOUD-UI-ONLY]` — marketing content only. | UI-only (cloud) — role-matched testimonial copy is rendered locally; no hosted marketing or account action is performed. | `src/renderer/src/hub/onboarding/Onboarding.tsx:32-37`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:68-73` |
| **Typing locations** | Multi-selects Chatting/Coding with AI, emails, messages, notes, documents, essays, discussion posts, problem sets, posts/comments, and Something else. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:74` |
| **Writing needs** | Selects quick idea capture, easier AI coding, detailed prompts, easier documents, typing fatigue, hands-free/on-the-go, many emails, or many messages. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:74` |
| **Meeting tools** | Asks current recording tools: Fathom, Fireflies, Google Meet, Grain, Granola, Notion, Otter, Plaud, Teams, Zoom, other, or none; selected importable tools trigger post-setup impor… | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:75` |
| **Meeting frustrations** | Selects finding notes, preparing, taking notes during calls, action items, or other. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:75` |
| **Meeting types** | Selects catch-ups, lectures, client calls, interviews, executive meetings, 1:1s, sales calls, team meetings, or other. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:21-29`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:75` |
| **Meeting-type preview** | Each choice has a realistic sample title, summary, sections, named speakers, and next steps to demonstrate generated notes. `[LLM]` | Offline equivalent — a local static meeting preview replaces hosted personalization. | `src/renderer/src/hub/onboarding/Onboarding.tsx:53-58`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:75-79` |

## Permissions onboarding

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Permission header** | “Give Flow permissions on your computer”; completion says “Thanks for trusting us, we value your privacy.” `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:103-122` |
| **Microphone permission** | Explains access occurs only while actively using Flow and a sound/animation indicates activity; Allow produces “Flow can now use your microphone.” `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:84-115` |
| **Accessibility permission** | Allows spoken words to enter the correct textbox and temporarily uses context/clipboard; success says Flow can paste anywhere. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:84-121` |
| **Accessibility drag flow** | Opens System Settings and instructs dragging the Flow icon into Accessibility, turning it on, with a Hide affordance. `[OS]` | Offline equivalent — Windows UI Automation permission replaces the macOS icon-drag flow. | `src/renderer/src/hub/onboarding/Onboarding.tsx:116` |
| **Screen capture permission** | Allows screen questions/context; success says Flow can take screenshots. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:98-120` |
| **Notetaker accessibility** | Allows recognizing meetings and starting when they begin. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:117` |
| **Notetaker microphone** | Captures the user’s voice while active. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:118` |
| **System audio permission** | Captures other meeting participants; may require restart to finish setup. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:98-120` |
| **Permission failure states** | Not-all-granted, request timeout, and verification failure all block continuation and suggest retry/restart. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:84-122` |
| **Windows privacy block** | If Windows microphone privacy is off, a dedicated error opens Settings to enable access. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:112-115` |

## Set up onboarding

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Microphone test** | Shows live purple bars and asks whether they move while speaking; recommends built-in or wired microphones over Bluetooth. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:130-163` |
| **Microphone enforcement** | “Speak to continue”; if no signal, “We can’t hear you. Try changing your mic.” `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:159` |
| **Mic not allowed** | “Microphone access required,” with Open Settings. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:159` |
| **No microphone** | Advises connecting/enabling one and refreshing devices. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:159` |
| **Microphone busy** | Advises closing Zoom, Teams, Meet, Discord, FaceTime, or other mic apps and selecting another input. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:159` |
| **Selected mic unavailable** | Previously selected device is disconnected; change mic. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:159` |
| **Unknown mic error** | Can open Sound Settings or restart Flow; automatic checking moves on once fixed. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:159` |
| **Language setup** | Selects all spoken languages or Auto-detect, supports mixing languages in one sentence, and adds suggested languages. `[ASR]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:160` |
| **Shortcut setup** | Tests shortcut by turning displayed keys purple; supports alternative key, Edit, Yes/No confirmation, and mouse setup. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:145-161` |
| **Caps Lock migration** | Explains Caps Lock now starts dictation instead of uppercase and can be changed in settings. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:161` |
| **Privacy choice** | “You control your data” offers model-improvement sharing versus “Don’t use my data for training,” plus Private Cloud Sync; org/HIPAA can lock choices. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Calendar setup** | Connects Google Calendar for reminders, briefs, context, and speaker names; asks whether user has Outlook, iCloud, another, or no calendar. `[CLOUD-UI-ONLY]` | Offline equivalent — .ics files and URLs provide reminders without OAuth. | `src/renderer/src/hub/onboarding/Onboarding.tsx:162`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:483-498` |
| **Outlook/iCloud unsupported states** | Explain Notetaker still works and promise notification when compatibility arrives. `[CLOUD-UI-ONLY]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:162` |
| **Auto-start setup** | Asks whether Notetaker should start automatically; Yes or Not now, with countdown explanation. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:162` |
| **Auto-share setup** | Chooses all invitees, same-domain invitees, or no automatic sharing and previews email/private behavior. `[CLOUD-UI-ONLY]` | UI-only (cloud) — visible offline/unavailable surface; no hosted account action is performed. | `src/renderer/src/hub/settings/SettingsDialog.tsx:399-402` |

## Learn onboarding and feature tour

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Watch intro video** | “Dictate in every app with Flow”; Next/Finish/Loading and PTT hint. `[LOCAL]` | Offline equivalent — an interactive local feature tour replaces streamed video. | `src/renderer/src/hub/onboarding/FeatureTour.tsx:7-20` |
| **Skip-video guard** | Warns “People who watch this video get 2x the value from Flow,” with Keep watching or Yes, skip. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:218-243` |
| **Final video step** | “Go try Flow in another app”: go to any app, click a textbox, with no extra setup. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:239-243` |
| **Try-it intro** | Explains hold-to-talk or double-tap hands-free and when text is pasted. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:239-243` |
| **Messenger/Slack practice** | Click text field, hold or double-tap, speak, release/tap to finish; success sticker confirms completion. `[ASR]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:169-175`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:209-243` |
| **Email practice** | Dictates a self-corrected email and demonstrates capitalization, punctuation, filler removal, and mistake correction. `[ASR]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:169-175`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:225-243`<br>`src/main/features/app.ts:119-126` |
| **Notion/list practice** | Whispers a role-tailored list; demonstrates context-aware list formatting and “List created!” `[ASR]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:169-175`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:225-243`<br>`src/main/features/app.ts:119-127` |
| **ChatGPT practice** | Hands-free long prompt, generates/replies, and allows retry/continue on failure. `[LLM]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:169-175`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:225-243`<br>`src/main/features/app.ts:133-147` |
| **Cursor practice** | Dictates code instructions with file names; demo constrains edits to `checkout.ts` and can refuse out-of-scope requests. `[LLM]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:169-175`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:225-243`<br>`src/main/features/app.ts:127-147` |
| **Hold-vs-tap correction** | Modal says “Don’t tap. Hold down … talk, then release”; double-tap errors ask for two taps. `[OS]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:239-243` |
| **Textbox focus guard** | “Click on the textbox first!” when dictation starts without a target. `[OS]` | Implemented | `src/main/features/dictation.ts:565-571` |
| **Whisper education** | Encourages moving close to the microphone around others. `[ASR]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:257-262` |
| **Time-savings estimate** | Slider for typing time/day calculates hours saved per week; can launch typing-vs-speaking speed test and recalculate. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:209-243` |
| **Typing speed test** | Countdown compares typing words/min to speaking words/min and supports Try Again. `[ASR]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:177-207` |
| **Canto 2 reveal** | Marketing reveal claims improved noisy/whisper accuracy, multilingual recognition, specialized terms, and larger dictionaries, with Continue and model-detail view. `[CLOUD-UI-ONLY… | Not applicable — proprietary Wispr cloud-model marketing is excluded. | — |

## Microphone quiz

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Quiz entry** | V1 teaches that Flow can understand whispering; V2 says hundreds of thousands use it in open offices/cafés and offers “Show me how.” `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:257-258` |
| **Current mic selection** | Selects the attached mic, warns poor whispering devices, and can temporarily switch to built-in for practice. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:223-227` |
| **Owned equipment** | Multi-selects Bluetooth earbuds, gooseneck, headset, podcast mic, wired headphones, wireless/clip-on lav, or something else. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:243-259` |
| **Work environment** | Asks whether the user works next to others: Yes, Sometimes, or No. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:251-260` |
| **Fixed workspace** | Asks whether the same desk is used daily to distinguish fixed/portable recommendations. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:252-260` |
| **Whisper demo** | Shows how to whisper with the selected mic, supports mute/unmute video, then launches a Gmail-like whisper exercise. `[ASR]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:261` |
| **Recommendation engine** | Recommends podcast/gooseneck for fixed high-quality use, headset/lav for movement, and labels best match/runner-up/what you have/another option. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:253-262` |
| **Comparison rows** | Displays price, mic quality, setup, whispering, around-others, home, and on-the-go suitability with explanatory tooltips. `[LOCAL]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:262` |
| **Results** | “Your ideal/recommended setup” or “You’ve got a good setup”; links to details/other products and can email results with sent/failed toast. `[CLOUD-UI-ONLY]` — email delivery and a… | Offline equivalent — local recommendation results omit email delivery and affiliate links. | `src/renderer/src/hub/settings/SettingsDialog.tsx:262` |

## Personalize onboarding

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Intro** | “Next, let’s personalize your Flow” and explains per-app formatting; user can Set up later. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:255-268` |
| **Work messages** | Chooses Formal, Casual, or Excited, previewing capitalization, punctuation, and exclamation changes; applied to Slack/Teams-like apps. `[LLM]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:247-268` |
| **Emails** | Chooses Formal, Casual, or Excited with email-format previews/signoff. `[LLM]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:247-268` |
| **Personal messages** | Chooses Formal, Casual, or very casual; very casual removes initial capitals and reduces punctuation. `[LLM]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:247-268` |
| **Other apps** | Chooses Formal, Casual, or Excited for all remaining apps. `[LLM]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:247-268` |
| **Skip per category** | Each style page can be skipped. `[LOCAL]` | Implemented | `src/renderer/src/hub/onboarding/Onboarding.tsx:255-268` |
| **Persisted voices** | Built-in Work messages, Email, Messages, and Others map known app names to style and cleanup level; observed styles are formal/light cleanup. `[LLM]` | Implemented | `src/shared/settings.ts:199-204`<br>`src/shared/settings.ts:274-279`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:247-268` |

## Trial, referral, student, and returning-user CTAs

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Free Pro trial opt-in** | Offers two weeks of unlimited Pro without a card, allows Claim/Start or No thanks/Continue with Free, and has a confirmation discouraging opt-out. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Referral trial** | Referred users can receive one month; promo/student variants advertise one or three months. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Trial extension** | During first week, dictating 100 words per day earns one extra Pro day; tracker shows remaining words and completion, then final earned-days summary. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Trial end** | Day-13/end modal summarizes value and offers Keep Flow Pro / Keep unlimited access; free limited access remains afterward. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Referral page** | Copy/share referral link; friend signs up and gets a month, referrer gets one month (or promo two) after 2,000 dictated words. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Referral errors** | Missing referral code asks to restart/contact support; copy success toast confirms clipboard. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Student challenges** | School-branded Drexel, Georgia Tech, and Northeastern challenges advertise cash prizes for referrals. `[CLOUD-UI-ONLY]` | UI-only (cloud) — cloud-only background/account behavior has no desktop surface. | — |
| **Returning champion** | Greets by name, displays total dictated words, and nudges “See what’s new.” `[CLOUD-UI-ONLY]` | Implemented | `src/renderer/src/hub/onboarding/ReturningChampion.tsx:11-34`<br>`src/main/features/app.ts:149-151` |
| **Never activated return** | Says much changed over N days and directs to Open Flow Hub. `[LOCAL]` | Offline equivalent — local Home return prompt uses on-device history. | `src/renderer/src/hub/pages/HomePage.tsx:65-75`<br>`src/main/watchers.ts:104-109` |

## Tray and app-level behaviors

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **Tray root** | Windows system tray exposes app, dictation, Notetaker, notes/meetings, settings, help, update, and quit actions. `[OS]` | Implemented | `src/main/tray.ts:62-132` |
| **Open Wispr Flow** | Opens/focuses Hub. `[OS]` | Implemented | `src/main/tray.ts:70-73` |
| **Start dictation** | Starts dictation from the menu. `[OS]` | Implemented | `src/main/tray.ts:73` |
| **Open/Start Notetaker** | Opens Notetaker or starts a new note. `[OS]` | Implemented | `src/main/tray.ts:77-78` |
| **Upcoming meetings** | Shows joinable upcoming meetings and “See all upcoming meetings”; timestamps include Now/Today/Tomorrow. `[OS]` | Implemented | `src/main/tray.ts:48-59` |
| **Recent meetings/Past notes** | Shows up to five recent items, uses “Untitled note” fallback, and links to all notes. `[LOCAL]` | Implemented | `src/main/tray.ts:94-98` |
| **Show next meeting** | Tray command toggles showing/hiding the next meeting beside the icon. `[OS]` | Implemented | `src/main/tray.ts:29-35` |
| **Paste/copy last transcript** | Tray/menu commands paste into the active app or copy to clipboard. `[OS]` | Implemented | `src/main/tray.ts:74-75` |
| **Dictionary/snippets** | Quick actions add dictionary word/create snippet and display word/snippet counts. `[LOCAL]` | Implemented | `src/main/tray.ts:108-109` |
| **Microphone/Languages/Shortcuts/My Voice** | Menu entries deep-link to the respective configuration pages. `[LOCAL]` | Implemented | `src/main/tray.ts:110-114` |
| **Settings** | Opens Settings. `[LOCAL]` | Implemented | `src/main/tray.ts:114` |
| **Feedback/help/support** | Opens Share feedback, Help center, or Talk to support. `[CLOUD-UI-ONLY]` | Implemented | `src/main/tray.ts:116-117` |
| **About** | Standard About Wispr Flow menu. `[LOCAL]` | Implemented | `src/main/tray.ts:130` |
| **Window/view controls** | Hide app, close window, actual size, zoom in, and zoom out. `[OS]` | Implemented | `src/main/tray.ts:118-127` |
| **Quit** | “Quit Wispr Flow”; Windows also registers a taskbar jump-list “Quit Wispr.” `[OS]` | Implemented | `src/main/tray.ts:131` |
| **Check for updates** | States include check, checking, downloading, error, managed, next check date, and ready/restart. `[OS]` | UI-only (cloud) — updates are installed manually; the UI reports the installed version. | `src/main/tray.ts:128` |
| **Update-ready ceiling** | Modal says restart takes seconds; Restart now or Later (install next idle period). `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:658-671`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:691-699` |
| **Active dictation update guard** | Warns restart ends dictation and unsaved audio may be lost; Cancel or Restart anyway. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:658-671`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:691-699` |
| **Active meeting update guard** | Same warning for active meeting recording. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:658-671`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:691-699` |
| **Saving-audio update guard** | Warns restarting before save/upload completes may lose part of recording and recommends waiting. `[OS]` | Implemented | `src/renderer/src/hub/settings/SettingsDialog.tsx:658-671`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:691-699` |
| **Theme propagation** | Theme is applied at document level across Hub/Notepad; reduced-motion preference suppresses transition animation. `[LOCAL]` | Implemented | `src/shared/settings.ts:252`<br>`src/main/features/settings.ts:14-15`<br>`src/main/windows.ts:153-155` |

## Data model

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **`prefs.user.pagesCompleted[]`** | Ordered onboarding page records with `{page, completed}`. Captured pages include welcome-basic, product-intent, about-yourself, spend-time-typing, meeting questions, privacy, cale… | Implemented | `src/shared/settings.ts:27-31`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:274-291` |
| **`prefs.user.productIntent`** | `dictation`, `notetaker`, or combined; captured `dictation_and_notetaker`. `[LOCAL]` | Implemented | `src/shared/settings.ts:32-47`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:72` |
| **`prefs.user.userInformation`** | Role, industry/seniority, writing needs, traits, and top use cases. `[LOCAL]` | Implemented | `src/shared/settings.ts:32-47` |
| **`prefs.user.typingLocations[]`** | Selected typing contexts; captured `chatting_with_ai`. `[LOCAL]` | Implemented | `src/shared/settings.ts:32-47`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:74` |
| **`prefs.user.fulfilledIntents[]`** | Completed semantic onboarding questions, used by preserve-intents restart. `[LOCAL]` | Offline equivalent — profile intents are preserved on restart when requested. | `src/shared/settings.ts:32-47`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:502-519` |
| **`prefs.user.permissions[]`** | Permission records `{name, clicked, granted}` for accessibility, microphone, and screen capture; system audio is also a supported permission enum. `[OS]` | Implemented | `src/shared/settings.ts:27-31`<br>`src/renderer/src/hub/onboarding/Onboarding.tsx:84-112` |
| **`prefs.user.shortcuts` / `cache.splitKeybinds`** | Serialized virtual-key chords mapped to actions; split list supports multiple bindings. `[OS]` | Implemented | `src/shared/settings.ts:4-18`<br>`src/shared/settings.ts:48-55`<br>`src/main/features/settings.ts:27-36` |
| **`prefs.user.rankedAudioDevices[]`** | Ordered `{deviceId, name}` list; `overrideAudioDeviceId` pins a device or null for auto. `[OS]` | Implemented | `src/shared/settings.ts:48-55`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:223-238` |
| **`prefs.user.selectedLanguages[]` / `usedLanguages[]`** | Explicit ASR language set and previously observed languages. `[ASR]` | Implemented | `src/shared/settings.ts:48-58`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:266-279` |
| **`prefs.user.userVoices`** | Per-context style objects with source, name, associated app names, cleanup level, and style preference. `[LLM]` | Implemented | `src/shared/settings.ts:79-88`<br>`src/shared/settings.ts:199-204`<br>`src/shared/settings.ts:274-279` |
| **`prefs.user.notificationSettings`** | Booleans for suggestions, feature highlights, milestones, team updates, and leaderboard updates. `[LOCAL]` | Implemented | `src/shared/settings.ts:66-71`<br>`src/shared/settings.ts:264` |
| **`prefs.user.subscription`** | Status, plan, credits, trial days/source, renewal/cancel/grace dates, student/team eligibility, currency/amount, tier, and billing provenance. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | — |
| **`prefs.user.notetakerQuota`** | Weekly counted/limit/remaining, reset window, and counted meeting IDs. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | `src/shared/settings.ts:105-139` |
| **`prefs.user.enterprise` / `cache.accessFlags`** | Organization policy/role and server-granted capabilities drive hidden, locked, or managed settings. `[CLOUD-UI-ONLY]` | Not applicable — Wispr organization policy plumbing is excluded. | — |
| **`prefs.user.internal`** | Internal toggles, model overrides, scratchpad debug behavior, BLE pairing, outlines/tints, and onboarding test controls. `[LOCAL]` | Offline equivalent — the supported local diagnostic/onboarding subset is persisted. | `src/shared/settings.ts:147-158`<br>`src/shared/settings.ts:343-353` |
| **`prefs.cache.onboardingContext` / `derivedTraits`** | Acquisition UTM/landing data and inferred meeting/notetaker traits for onboarding routing. `[CLOUD-UI-ONLY]` | Not applicable — Wispr acquisition/telemetry routing is excluded. | — |

## Settings & defaults

| Feature | Flow behavior (short) | Murmur status | Where |
|---|---|---|---|
| **`openAtLogin` → `true`** | Launch Flow at Windows sign-in. `[OS]` | Implemented | `src/shared/settings.ts:255`<br>`src/main/features/settings.ts:9-13` |
| **`hideFlowBarPermanently` → `false`** | Flow Bar is not permanently hidden; temporary snooze may still hide it. `[OS]` | Offline equivalent — showFlowBar plus a snooze timestamp provide the local equivalent. | `src/shared/settings.ts:256`<br>`src/shared/settings.ts:257`<br>`src/main/index.ts:43-49` |
| **`statusDockEdge` → `bottom`** | Dock Flow Bar at bottom. `[OS]` | Implemented | `src/shared/settings.ts:258`<br>`src/main/windows.ts:96-104` |
| **`theme` → `light`** | Use light UI; UI also supports dark/system. `[LOCAL]` | Implemented | `src/shared/settings.ts:252`<br>`src/main/features/settings.ts:14-15` |
| **`uiZoomFactor` → `1`** | Default-size Hub/Notepad controls. `[LOCAL]` | Implemented | `src/shared/settings.ts:254`<br>`src/main/windows.ts:153-155` |
| **`uiLocale` → `null`** | Follow system language. `[LOCAL]` | Implemented | `src/shared/settings.ts:251`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:133-155` |
| **`emailLocale` → `null`** | No explicit account-email language. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | `src/shared/settings.ts:253`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:136-137` |
| **`selectedLanguages` → `["en"]`** | English ASR selected in captured profile. `[ASR]` | Implemented | `src/shared/settings.ts:248`<br>`src/main/features/dictation.ts:334-339` |
| **`overrideAudioDeviceId` → `null`** | Auto-detect microphone. `[OS]` | Implemented | `src/shared/settings.ts:245`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:223-227` |
| **`enableSounds` → `true`** | Dictation/notification sounds on. `[LOCAL]` | Implemented | `src/shared/settings.ts:260`<br>`src/main/features/dictation.ts:56-61` |
| **`selectedSoundFolder` → `null`** | Built-in default sound set. `[LOCAL]` | Offline equivalent — built-in synthesized sounds are used. | `src/shared/settings.ts:261`<br>`src/renderer/src/capture/main.ts:228-256` |
| **`shouldMuteAudio` → `true` (Windows)** | Mute system audio during dictation. `[OS]` | Implemented | `src/shared/settings.ts:262`<br>`src/main/features/mediaDuck.ts:16-29` |
| **`shouldPauseAudio` → `false`** | Do not pause media; mutually exclusive with mute. `[OS]` | Implemented | `src/shared/settings.ts:263`<br>`src/main/features/mediaDuck.ts:16-29` |
| **`shouldAutoLearnWords` → `true`** | Auto-add corrected words. `[LOCAL]` | Implemented | `src/shared/settings.ts:267`<br>`src/main/features/dictation.ts:671` |
| **`aiFormatting` → `true`** | Apply AI formatting by default. `[LLM]` | Implemented | `src/shared/settings.ts:272-279`<br>`src/main/features/formatting.ts:85-104` |
| **`defaultTranscriptionFormat` → `Apply AI formatting`** | Default dictation format. `[LLM]` | Offline equivalent — formatted mode and light cleanup are the local default. | `src/shared/settings.ts:270-279`<br>`src/main/features/formatting.ts:85-104` |
| **`creatorMode` → `false`** | No public dictating indicator. `[OS]` | Implemented | `src/shared/settings.ts:268`<br>`src/renderer/src/status/FlowBar.tsx:169` |
| **`emailAutoSignature` → `false`** | Do not append Flow signature. `[OS]` | Implemented | `src/shared/settings.ts:269`<br>`src/main/features/formatting.ts:184-187` |
| **`emailSignatureOption` → `written_with_flow`** | Signature choice if enabled. `[OS]` | Implemented | `src/shared/settings.ts:269`<br>`src/main/features/formatting.ts:184-187` |
| **`useAxContext` → `true`** | Use accessibility text context. `[OS]` | Implemented | `src/shared/settings.ts:295`<br>`src/main/features/dictation.ts:112-120` |
| **`ideFileTagging` → `true`** | Enable IDE file tagging. `[OS]` | Implemented | `src/shared/settings.ts:292`<br>`src/main/features/formatting.ts:132-139` |
| **`cursorIdeIntegration` → `false`** | Legacy Cursor integration off. `[OS]` | Not applicable — legacy Wispr integration plumbing is excluded. | `src/shared/settings.ts:293`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:412-416` |
| **`commandModeEnabled` → `false`** | Command Mode off. `[LLM]` | Implemented | `src/shared/settings.ts:287`<br>`src/main/shortcuts.ts:16-53` |
| **`pressEnterCommandEnabled` → `false`** | Spoken Enter command off. `[OS]` | Implemented | `src/shared/settings.ts:288`<br>`src/main/features/formatting.ts:89-92` |
| **`stackedMessagesEnabled` → `false`** | Message splitting off. `[LLM]` | Implemented | `src/shared/settings.ts:289`<br>`src/main/features/dictation.ts:549-555` |
| **`focusModeEnabled` → `false`** | Distracting-app blocking off. `[OS]` | Implemented | `src/shared/settings.ts:290`<br>`src/main/watchers.ts:15-26` |
| **`jabraWearDetectionEnabled` → `false`** | Wear-based mic switching off. `[OS]` | Not applicable — supported Jabra hardware SDK integration is unavailable. | `src/shared/settings.ts:294`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:441` |
| **`autoDetectMeetingsEnabled` → `true`** | Detect calls. `[OS]` | Implemented | `src/shared/settings.ts:304`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:372` |
| **`notetakerAutoStartEnabled` → `false`** | Do not auto-record meetings. `[OS]` | Implemented | `src/shared/settings.ts:305`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:374` |
| **`notetakerAutoStartOptInState` → `None`** | No auto-start decision recorded. `[LOCAL]` | Implemented | `src/shared/settings.ts:318`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:374` |
| **`notetakerAutoEndEnabled` → `true`** | Stop capture when call ends. `[OS]` | Implemented | `src/shared/settings.ts:307`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:377`<br>`src/main/features/recorder.ts:249-252` |
| **`notetakerCalendarNotificationsEnabled` → `true`** | Scheduled meeting reminders on. `[OS]` | Implemented | `src/shared/settings.ts:326`<br>`src/main/features/meetings.ts:214-233` |
| **`notetakerCalendarNotificationTiming` → config `15_seconds_before`; live UI `2 min`** | Serialized and rendered evidence disagree, so the visible control is treated as ground truth while retaining the stored value discrepancy. `[OS]` | Implemented | `src/shared/settings.ts:303`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:393-394`<br>`src/main/features/meetings.ts:214-233` |
| **`notetakerCalendarNotice` → `off`** | Do not alter calendar descriptions. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | `src/shared/settings.ts:328`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:396` |
| **`notetakerAutoShareNotes` → `off`** | Do not auto-share notes. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | `src/renderer/src/hub/settings/SettingsDialog.tsx:399-402` |
| **`notetakerAutoShareNotesType` → `all`** | All-meetings scope if sharing is enabled. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | `src/shared/settings.ts:329`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:401` |
| **`notetakerNotepadOnStart` → `open`** | Open Notepad at start. `[OS]` | Implemented | `src/shared/settings.ts:309`<br>`src/main/features/recorder.ts:280-283` |
| **`notetakerOpenWindowOnRecord` → `true`** | Open recording window. `[OS]` | Offline equivalent — `notepadView` opens the recorder unless set to hidden. | `src/main/features/recorder.ts:280-283` |
| **`notetakerAutoOpenSummaryEnabled` → `true`** | Open completed summary. `[LLM]` | Implemented | `src/shared/settings.ts:312`<br>`src/main/features/recorder.ts:376-386` |
| **`notetakerLiveTranscriptEnabled` → `true`** | Show live transcript. `[ASR]` | Implemented | `src/shared/settings.ts:310`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:387` |
| **`notetakerAttributeNamesEnabled` → `true`** | Label transcript speakers. `[ASR]` | Implemented | `src/shared/settings.ts:311`<br>`src/main/features/recorder.ts:353-368` |
| **`notetakerAutoDetectParticipantNamesEnabled` → `true`** | Read participant names. `[OS]` | Implemented | `src/shared/settings.ts:320`<br>`src/main/features/recorder.ts:207-212` |
| **`notetakerMaxRecordingLength` → `2hr`** | Stop at two hours. `[OS]` | Implemented | `src/shared/settings.ts:306`<br>`src/main/features/recorder.ts:206-207`<br>`src/main/features/recorder.ts:247-252` |
| **`notetakerMenuBarMeetingEnabled` → `true`** | Show next meeting/countdown in tray. `[OS]` | Implemented | `src/shared/settings.ts:346`<br>`src/main/tray.ts:29-35` |
| **`hideMeetingRecorderInScreenShare` → `false`** | Notepad/Flow Bar remain capturable. `[OS]` | Implemented | `src/shared/settings.ts:308`<br>`src/main/windows.ts:119-136` |
| **`notetakerSplitScreenJoinEnabled` → `false`** | Do not tile meeting and Notepad. `[OS]` | Implemented | `src/shared/settings.ts:321`<br>`src/main/features/recorder.ts:280-283` |
| **`notetakerOrgInsightsDefault` → `true`** | New meetings opt into org insights when applicable. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | `src/shared/settings.ts:330`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:402` |
| **`notetakerLongMeetingCheckInEnabled` → `true`** | Long-recording check-in on. `[OS]` | Implemented | `src/shared/settings.ts:319`<br>`src/main/features/recorder.ts:247-252` |
| **`notetakerTranscriptRetention` → `never_delete`** | Keep meeting transcripts indefinitely. `[CLOUD-UI-ONLY]` | Implemented | `src/shared/settings.ts:334`<br>`src/main/features/meetings.ts:236-258` |
| **`cloudSync` → compiled default `true`; observed `false`** | Captured account disabled dictation cloud storage. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | — |
| **`shareUsageData` → observed `false`** | Captured account opted out of model-improvement sharing. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | — |
| **`isGlobalProfileSharingEnabled` → `true`** | Public profile discoverability on. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | `src/shared/settings.ts:345`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:606` |
| **`localDataPolicy` → `store_normally`** | Retain local transcripts normally. `[LOCAL]` | Implemented | `src/shared/settings.ts:343`<br>`src/main/features/app.ts:43-60` |
| **`defaultNoteVisibility` → `anyone_with_link`** | Link-openable notes by default. `[CLOUD-UI-ONLY]` | UI-only (cloud) — hosted account state does not apply offline. | — |
| **`polishEnabled` → `true`** | Transform/Polish available. `[LLM]` | Implemented | `src/shared/settings.ts:282`<br>`src/main/shortcuts.ts:68-77` |
| **`polishAutoPaste` → `true`** | Paste transformed result automatically. `[OS]` | Implemented | `src/shared/settings.ts:283`<br>`src/main/features/transforms.ts:1-40` |
| **`autoPolishAfterDictation.active` → `false`** | Do not auto-transform every dictation. `[LLM]` | Implemented | `src/shared/settings.ts:284`<br>`src/main/features/dictation.ts:680-700` |
| **`autoCleanup.level` → `light`** | Light cleanup baseline. `[LLM]` | Implemented | `src/shared/settings.ts:272`<br>`src/main/features/formatting.ts:85-104` |
| **`processingDelayNotificationEnabled` → `true`** | Processing-delay notifications enabled. `[LOCAL]` | Implemented | `src/shared/settings.ts:264`<br>`src/main/features/dictation.ts:412-416` |
| **`internal.isToneMatchEnabled` → `false`** | Internal tone matching off. `[LLM]` | Implemented | `src/shared/settings.ts:296`<br>`src/main/features/formatting.ts:116-136` |
| **`internal.isHapticsEnabled` → `false`** | Internal haptics off. `[OS]` | Not applicable — unsupported Wispr hardware integration is excluded. | — |
| **`internal.shouldSaveAxText` → `false`** | Do not persist accessibility captions. `[OS]` | Implemented | `src/shared/settings.ts:348`<br>`src/main/features/dictation.ts:112-120` |
| **`internal.isCandidateAsrEnabled` → `false`** | Stable ASR route. `[CLOUD-UI-ONLY]` | Not applicable — proprietary candidate-model routing is excluded. | — |
| **`internal.isAutoInstructEnabled` → `false`** | Internal instruction classifier off. `[LLM]` | Implemented | `src/shared/settings.ts:351`<br>`src/main/features/dictation.ts:445-455` |
| **`internal.preserveIntentsOnRestart` → `false`** | Full onboarding restart. `[LOCAL]` | Implemented | `src/shared/settings.ts:350`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:502-519` |
| **`internal.showDebugOutlines` → `false`** | No Flow Bar debug bounds. `[LOCAL]` | Implemented | `src/shared/settings.ts:349`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:511` |
| **`internal.showOverlayDebugTint` → `false`** | No overlay tint. `[LOCAL]` | Not applicable — Wispr staff/debug tooling is excluded. | — |
| **`internal.instructPasteOnEmptyContext` → `false`** | Empty-context response stays in chat. `[LLM]` | Implemented | `src/shared/settings.ts:352`<br>`src/renderer/src/hub/settings/SettingsDialog.tsx:514-515` |
| **`internalDataSharingEnabled` → `false`** | Internal transcript sharing off. `[CLOUD-UI-ONLY]` | Not applicable — Wispr internal telemetry is excluded. | — |
| **`instructInternalDataSharingEnabled` → `true`** | Internal Instruct diagnostics sharing on in captured profile. `[CLOUD-UI-ONLY]` | Not applicable — Wispr internal telemetry is excluded. | — |

| Status | Count |
|---|---:|
| Implemented | 1131 |
| Offline equivalent | 76 |
| UI-only (cloud) | 202 |
| UI-only (mobile/team/billing) | 19 |
| Not applicable | 83 |
| Partial | 0 |
| Missing | 0 |
| **Total** | **1511** |

# Remaining gaps

None. Every inventoried desktop feature is implemented, has an offline equivalent, is represented by an intentional UI-only surface, or is not applicable to the offline Windows product.
