// Floating Flow bar: resting pill, live waveform while dictating, processing/success states, toasts above it.
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, EyeOff, Languages, Mic, NotebookPen, Settings as SettingsIcon, Square, StickyNote, WandSparkles, X, History, ClipboardPaste } from 'lucide-react';
import type { DictationState, Toast } from '@shared/types';
import { api, sendRaw, useEvent } from '../lib/api';
import { useSettings } from '../lib/settings';
import { Kbd, cx } from '../ui';
import s from './FlowBar.module.css';

const BARS = 9;

function Wave({ level }: { level: number }) {
  const [hist, setHist] = useState<number[]>(() => Array(BARS).fill(0.08));
  useEffect(() => {
    setHist((h) => [...h.slice(1), Math.max(0.08, Math.min(1, level * 1.6))]);
  }, [level]);
  return (
    <div className={s.wave} aria-hidden="true">
      {hist.map((v, i) => (
        <span key={i} style={{ transform: `scaleY(${v})` }} />
      ))}
    </div>
  );
}

function Dots() {
  return (
    <div className={s.dots} aria-label="Processing">
      <span />
      <span />
      <span />
    </div>
  );
}

export function FlowBar() {
  const settings = useSettings();
  const [st, setSt] = useState<DictationState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.dictation.getState().then(setSt);
  }, []);
  useEvent('dictation:state', setSt);
  useEvent('toast:show', (t) => {
    if (t.target !== 'bar') return;
    setToasts((list) => [...list.filter((x) => x.key !== t.key), t].slice(-3));
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.durationMs ?? (t.actions?.length ? 8000 : 4500));
  });
  useEvent('toast:hide', ({ id }) => setToasts((list) => list.filter((x) => x.id !== id)));

  // Click-through everywhere except over interactive content.
  const interactive = hover || menu;
  useEffect(() => {
    sendRaw('status:interactive', interactive);
  }, [interactive]);

  const phase = st?.phase ?? 'resting';
  const active = phase === 'active_ptt' || phase === 'active_popo';
  const busy = phase === 'processing' || phase === 'polish_processing';
  const done = phase === 'completed';
  const expanded = active || busy || done || phase === 'error' || hover || menu;
  const ptt = settings.shortcuts.ptt[0];
  const hiddenUntil = settings.flowBarHiddenUntil;
  if (hiddenUntil > Date.now() && !active && !busy && !toasts.length) return null;

  return (
    <div className={s.root} ref={rootRef}>
      <div className={s.toasts}>
        {toasts.map((t) => (
          <div key={t.id} className={cx(s.toast, t.tone && s[`tone_${t.tone}`])} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} role="status">
            <div className={s.toastText}>
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
            </div>
            {t.actions && (
              <div className={s.toastActions}>
                {t.actions.map((a) => (
                  <button key={a.id} type="button" onClick={() => void api.notifications.toastAction(t.id, a.id)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={s.toastClose} aria-label="Dismiss" onClick={() => void api.notifications.dismissToast(t.id)}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {menu && (
        <div className={s.menu} role="menu" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.dictation.pasteLast(); }}>
            <ClipboardPaste size={15} /> Paste last transcript
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.dictation.copyLast(); }}>
            <Copy size={15} /> Copy last transcript
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.app.openHub('/history'); }}>
            <History size={15} /> Transcript history
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.app.openHub('/transforms'); }}>
            <WandSparkles size={15} /> Configure transforms
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.app.openSettings('general'); }}>
            <Mic size={15} /> Microphone
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.app.openSettings('general'); }}>
            <Languages size={15} /> Languages
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.notes.openScratchpad(); }}>
            <StickyNote size={15} /> Open Scratchpad
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.recorder.openNotepad(); }}>
            <NotebookPen size={15} /> Open Notepad
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.dictation.hideBarFor(60 * 60 * 1000); }}>
            <EyeOff size={15} /> Hide for 1 hour
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void api.app.openSettings('general'); }}>
            <SettingsIcon size={15} /> Settings
          </button>
        </div>
      )}

      <div
        className={cx(s.pill, expanded && s.pillExpanded, active && s.pillActive, done && s.pillDone, phase === 'error' && s.pillError)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu((m) => !m);
        }}
        data-phase={phase}
        aria-label="Murmur Flow Bar"
      >
        {active && (
          <>
            <button type="button" className={s.pillBtn} aria-label="Cancel" title="Cancel (Esc)" onClick={() => void api.dictation.cancel()}>
              <X size={14} />
            </button>
            <Wave level={st?.level ?? 0} />
            {phase === 'active_popo' ? (
              <button type="button" className={cx(s.pillBtn, s.stopBtn)} aria-label="Finish and paste" title="Finish and paste" onClick={() => void api.dictation.stop()}>
                <Square size={10} fill="currentColor" />
              </button>
            ) : (
              <span className={s.pillBtnSpacer} />
            )}
          </>
        )}
        {busy && (
          <>
            {phase === 'polish_processing' && <span className={s.label}>{st?.polishName ?? 'Transform'}</span>}
            <Dots />
          </>
        )}
        {done && (
          <span className={s.label}>
            <Check size={14} /> {st?.message ?? 'Done'}
          </span>
        )}
        {phase === 'error' && <span className={s.label}>{st?.message ?? 'Something went wrong'}</span>}
        {!active && !busy && !done && phase !== 'error' && hover && (
          <button type="button" className={s.hint} onClick={() => void api.dictation.start('popo')} title="Click to start hands-free dictation">
            {ptt ? (
              <>
                Hold <Kbd combo={ptt} /> to dictate
              </>
            ) : (
              'Click to dictate'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
