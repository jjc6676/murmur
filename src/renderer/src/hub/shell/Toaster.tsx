// Hub toasts: renderer-local toasts plus main-process toasts targeted at the hub.
import { useState } from 'react';
import { X } from 'lucide-react';
import type { Toast } from '@shared/types';
import { api, useEvent } from '../../lib/api';
import { IconButton } from '../../ui';
import { useHubUi } from '../state';

export function Toaster() {
  const local = useHubUi((s) => s.toasts);
  const dismissLocal = useHubUi((s) => s.dismissToast);
  const [remote, setRemote] = useState<Toast[]>([]);
  useEvent('toast:show', (t) => {
    if (t.target !== 'hub') return;
    setRemote((r) => [...r, t]);
    setTimeout(() => setRemote((r) => r.filter((x) => x.id !== t.id)), t.durationMs ?? 5000);
  });
  useEvent('toast:hide', ({ id }) => setRemote((r) => r.filter((x) => x.id !== id)));
  return (
    <div className="m-toaster" aria-live="polite">
      {local.map((t) => (
        <div key={t.id} className="m-toast" role="status">
          <div className="m-toast__body">
            {t.title}
            {t.body && <small>{t.body}</small>}
            {t.actions && (
              <div className="m-toast__actions">
                {t.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => {
                      a.onClick();
                      dismissLocal(t.id);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton label="Dismiss" size="sm" onClick={() => dismissLocal(t.id)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      {remote.map((t) => (
        <div key={t.id} className="m-toast" role="status">
          <div className="m-toast__body">
            {t.title}
            {t.body && <small>{t.body}</small>}
            {t.actions && (
              <div className="m-toast__actions">
                {t.actions.map((a) => (
                  <button key={a.id} type="button" onClick={() => void api.notifications.toastAction(t.id, a.id)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton label="Dismiss" size="sm" onClick={() => void api.notifications.dismissToast(t.id)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
