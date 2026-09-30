import { useEffect, useRef, type ReactNode } from 'react';
import type { PublicUser } from '@adda/shared';
import { useIsOnline } from '../stores/live';

export function Panel({
  title,
  action,
  tone,
  className = '',
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  tone?: 'pink' | 'cyan';
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${tone ? `panel--${tone}` : ''} ${className}`}>
      {(title || action) && (
        <header className="panel__head">
          {title && <h2 className="panel__title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

export function Bar({ value, color = 'var(--cyan)', thin, label }: { value: number; color?: string; thin?: boolean; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={`bar ${thin ? 'bar--thin' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="bar__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

export function Avatar({ user, size = 40, showPresence = false }: { user: Pick<PublicUser, 'id' | 'name' | 'color'>; size?: number; showPresence?: boolean }) {
  const online = useIsOnline(user.id);
  return (
    <span className="avatar" style={{ '--s': `${size}px`, '--c': user.color } as React.CSSProperties} aria-hidden="true">
      {initials(user.name)}
      {showPresence && <i className={`avatar__dot ${online ? 'avatar__dot--on' : ''}`} />}
    </span>
  );
}

export function AvatarStack({ users, max = 4 }: { users: Pick<PublicUser, 'id' | 'name' | 'color'>[]; max?: number }) {
  return (
    <span className="avatars" aria-label={`${users.length} people`}>
      {users.slice(0, max).map((u) => (
        <Avatar key={u.id} user={u} size={28} />
      ))}
      {users.length > max && <span className="avatar" style={{ '--s': '28px' } as React.CSSProperties}>+{users.length - max}</span>}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children}
    </div>
  );
}

export function Loading({ label = 'LOADING' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      {label}
      <span className="blink">_</span>
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="modal__inner">
          <div className="modal__head">
            <h2 className="panel__title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              X
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}
