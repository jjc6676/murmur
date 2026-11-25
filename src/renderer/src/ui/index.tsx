// Murmur UI kit. All pages compose these; styles in ui.css.
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { comboLabelParts } from '@shared/hotkeys';
import './ui.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- buttons
type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent' | 'light';
export function Button({ variant = 'primary', size = 'md', icon, children, className, loading, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean }) {
  return (
    <button type="button" className={cx('m-btn', `m-btn--${variant}`, size !== 'md' && `m-btn--${size}`, className)} disabled={rest.disabled || loading} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, size = 'md', children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('m-icon-btn', size === 'sm' && 'm-icon-btn--sm', className)} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- form controls
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="m-toggle" onClick={() => onChange(!checked)} />;
}

export function Checkbox({ checked, onChange, label, ...rest }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'checked'>) {
  return (
    <label className="m-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
      {label}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('m-input', className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('m-textarea', className)} {...rest} />;
}

export function Field({ label, hint, error, children }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="m-field">
      {label && <span className="m-field__label">{label}</span>}
      {children}
      {error ? <span className="m-field__error">{error}</span> : hint && <span className="m-field__hint">{hint}</span>}
    </div>
  );
}

export function Select<T extends string | number>({ value, options, onChange, className, ariaLabel, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string; ariaLabel?: string; disabled?: boolean }) {
  return (
    <select
      className={cx('m-select', className)}
      aria-label={ariaLabel}
      disabled={disabled}
      value={String(value)}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search', autoFocus, className }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  return (
    <div className={cx('m-search', className)}>
      <Search size={15} />
      <Input value={value} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="m-segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- layout
export function Card({ children, padded, sand, className, ...rest }: { children: ReactNode; padded?: boolean; sand?: boolean; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('m-card', padded && 'm-card--padded', sand && 'm-card--sand', className)} {...rest}>
      {children}
    </div>
  );
}

export function SettingGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="m-setting-group">
      {title && <h3 className="m-setting-group__title">{title}</h3>}
      <div className="m-setting-group__body">{children}</div>
    </section>
  );
}

export function SettingRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="m-setting-row">
      <div>
        <div className="m-setting-row__title">{title}</div>
        {description && <div className="m-setting-row__desc">{description}</div>}
      </div>
      {children && <div className="m-setting-row__control">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('m-tabs', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} className="m-tab" onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, badge, actions }: { title: ReactNode; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="m-page-header">
      <h1 className="m-page-header__title">
        {title}
        {badge}
      </h1>
      {actions && <div className="m-page-header__actions">{actions}</div>}
    </header>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="m-page">
      <div className={cx('m-page__inner', wide && 'm-page__inner--wide')}>{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'dark' | 'accent' | 'orange' | 'success' | 'danger' }) {
  return <span className={cx('m-badge', tone !== 'default' && `m-badge--${tone}`)}>{children}</span>;
}

export function CountBadge({ n, label }: { n: number; label?: string }) {
  if (n <= 0) return null;
  return (
    <span className="m-count" aria-label={label ?? `${n} unread`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** Keyboard shortcut pills, e.g. <Kbd combo="Ctrl+Win" />. */
export function Kbd({ combo, active }: { combo: string; active?: boolean }) {
  const parts = comboLabelParts(combo);
  return (
    <span className={cx('m-kbd', active && 'm-kbd--active')}>
      {parts.map((p) => (
        <kbd key={p}>{p}</kbd>
      ))}
    </span>
  );
}

export function Spinner() {
  return <span className="m-spinner" role="status" aria-label="Loading" />;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="m-progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="m-empty">
      {icon}
      <div className="m-empty__title">{title}</div>
      {body && <div>{body}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

/** Dark hero banner used at the top of feature pages. */
export function Banner({ title, body, actions, onDismiss, variant = 'amber', art, children }: { title: ReactNode; body?: ReactNode; actions?: ReactNode; onDismiss?: () => void; variant?: 'amber' | 'violet' | 'teal' | 'brown'; art?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('m-banner', variant !== 'brown' && `m-banner--${variant}`)}>
      {art}
      <div className="m-banner__title">{title}</div>
      {body && <div className="m-banner__body">{body}</div>}
      {children}
      {actions && <div className="m-banner__actions">{actions}</div>}
      {onDismiss && (
        <IconButton label="Dismiss" className="m-banner__close" onClick={onDismiss}>
          <X size={16} />
        </IconButton>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- overlays
export function Dialog({ open, onClose, title, description, width = 480, children, footer, closeOnOverlay = true, ariaLabel }: { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; width?: number; children?: ReactNode; footer?: ReactNode; closeOnOverlay?: boolean; ariaLabel?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="m-overlay" onMouseDown={(e) => closeOnOverlay && e.target === e.currentTarget && onClose()}>
      <div className="m-dialog" role="dialog" aria-modal="true" aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)} style={{ width }}>
        {(title || description) && (
          <div className="m-dialog__head">
            <div>
              {title && <div className="m-dialog__title">{title}</div>}
              {description && <div className="m-dialog__desc">{description}</div>}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {children && <div className="m-dialog__body">{children}</div>}
        {footer && <div className="m-dialog__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose }: { open: boolean; title: ReactNode; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

/** Dropdown menu anchored to its trigger. `trigger` receives an onClick to toggle. */
export function Menu({ trigger, items, align = 'end' }: { trigger: (props: { onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean }) => ReactNode; items: MenuItem[]; align?: 'start' | 'end' }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const m = ref.current.getBoundingClientRect();
    let left = align === 'end' ? anchor.right - m.width : anchor.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = anchor.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = anchor.top - m.height - 4;
    setPos({ top, left });
  }, [anchor, align]);
  useEffect(() => {
    if (!anchor) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAnchor(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAnchor(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [anchor]);
  return (
    <>
      {trigger({
        onClick: (e) => {
          e.stopPropagation();
          setAnchor(anchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect());
        },
        'aria-expanded': !!anchor,
      })}
      {anchor &&
        createPortal(
          <div ref={ref} className="m-menu" role="menu" style={pos}>
            {items.map((it, i) =>
              it.separator ? (
                <div key={i} className="m-menu__sep" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  className={cx('m-menu__item', it.danger && 'm-menu__item--danger')}
                  onClick={() => {
                    setAnchor(null);
                    it.onSelect?.();
                  }}
                >
                  {it.icon}
                  {it.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export { cx };
