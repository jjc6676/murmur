// Silence playback while dictating: mute the default output or pause playing media, then restore.
import { getCtx } from '../context';
import { getOutputMuted, outputPeak, setOutputMuted } from '../native/audio';
import { sendChord } from '../native/win32';

const VK_MEDIA_PLAY_PAUSE = 0xb3;
const KV_KEY = 'mediaDuck';

interface DuckState {
  muted: boolean; // we muted the output
  paused: boolean; // we paused media
}

let active: DuckState | null = null;

export function duckMedia(): void {
  if (active) return;
  const s = getCtx().settings.get();
  const st: DuckState = { muted: false, paused: false };
  if (s.pauseMediaWhileDictating && outputPeak() > 0.005) {
    sendChord([], VK_MEDIA_PLAY_PAUSE);
    st.paused = true;
  } else if (s.muteAudioWhileDictating && getOutputMuted() === false) {
    st.muted = setOutputMuted(true);
  }
  active = st;
  getCtx().db.kvSet(KV_KEY, st);
}

export function unduckMedia(): void {
  const st = active;
  active = null;
  if (!st) return;
  if (st.muted) setOutputMuted(false);
  if (st.paused) sendChord([], VK_MEDIA_PLAY_PAUSE);
  getCtx().db.kvSet(KV_KEY, { muted: false, paused: false });
}

/** After a crash mid-dictation, undo a mute we left behind. */
export function restoreMediaAfterCrash(): void {
  const st = getCtx().db.kvGet<DuckState>(KV_KEY, { muted: false, paused: false });
  if (st.muted) setOutputMuted(false);
  getCtx().db.kvSet(KV_KEY, { muted: false, paused: false });
}
