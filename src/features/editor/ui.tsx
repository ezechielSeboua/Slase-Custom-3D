'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/features/editor/icons';
import { fr } from '@/i18n/fr';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Indicateur de chargement. Avec `label`, il est annoncé aux lecteurs d'écran ; sinon il est décoratif.
export function Spinner({ size = 20, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <span
      className={cx('spinner', className)}
      style={{ width: size, height: size }}
      {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}

/** Classes « Liquid Glass » des boutons, partagées avec les liens qui ont l'apparence d'un bouton. */
export const glassButton = {
  primary: 'glass-accent glass-press',
  secondary: 'glass glass-press',
};

// UI-BTN-001
export function Button({
  children, variant = 'secondary', className, busy, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary'; busy?: boolean }) {
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      {...props}
      className={cx(
        'inline-flex h-h-btn items-center justify-center gap-s2 rounded-r-ctl px-s1 text-sm font-medium select-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        glassButton[variant],
        className,
      )}
    >
      {busy && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function IconButton({
  label, children, className, variant = 'ghost', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: 'ghost' | 'outline' | 'primary' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-flex size-touch-min shrink-0 items-center justify-center rounded-r-ctl text-lg leading-none',
        'disabled:cursor-not-allowed disabled:opacity-30',
        variant === 'primary' && glassButton.primary,
        variant === 'outline' && glassButton.secondary,
        variant === 'ghost' && 'glass-press transition-colors hover:bg-white/60 active:bg-white/80',
        className,
      )}
    >
      {children}
    </button>
  );
}

// UI-SEG-001 : groupe de boutons radio, flèches gauche / droite au clavier.
export function Segmented<T extends string | number>({
  label, value, options, onChange, hideLabel,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    for (let k = 1; k <= options.length; k++) {
      const j = (i + dir * k + options.length) % options.length;
      if (!options[j].disabled) {
        onChange(options[j].value);
        refs.current[j]?.focus();
        break;
      }
    }
  };
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div>
      <div id={id} className={cx('mb-s2 text-xs font-semibold tracking-wide text-muted uppercase', hideLabel && 'sr-only')}>
        {label}
      </div>
      {/* Mobile : 6 px de plus, pour des choix d'environ 40 px de haut sous le doigt. */}
      <div role="radiogroup" aria-labelledby={id} className="glass-track relative flex h-h-seg max-desk:h-[calc(var(--spacing-h-seg)+6px)] rounded-r-ctl p-p-seg">
        {/* Pastille en verre qui glisse sous l'option choisie. */}
        <span
          aria-hidden="true"
          className="glass-thumb pointer-events-none absolute top-p-seg bottom-p-seg left-p-seg rounded-r-seg-in"
          style={{ width: `calc((100% - 2 * var(--spacing-p-seg)) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
        />
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx(
                // Avec 4 options ou plus, on resserre pour que les libellés tiennent.
                'glass-press z-10 flex-1 truncate rounded-r-seg-in transition-colors',
                options.length >= 4 ? 'px-1 text-xs' : 'px-s2 text-sm',
                on ? 'font-semibold text-ink' : 'text-muted hover:text-ink',
                'disabled:opacity-40',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// UI-FLD-001 : champ numérique ; virgule ou point acceptés. Valide à la perte du focus ou sur Entrée.
export function NumberField({
  label, value, unit, onCommit, step = 0.1, min, max, disabled,
}: {
  label: string;
  value: number;
  unit: string;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  const [prev, setPrev] = useState(value);
  if (!focused && prev !== value) {
    setPrev(value);
    setText(fmt(value));
  }
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(v)) {
      const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
      onCommit(clamped);
      setText(fmt(clamped));
    } else setText(fmt(value));
  };
  const nudge = (dir: 1 | -1, big: boolean) => {
    const v = Math.round((value + dir * step * (big ? 10 : 1)) * 100) / 100;
    onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
  };
  return (
    <label htmlFor={id} className={cx('flex min-h-h-field flex-col justify-center rounded-r-ctl border border-ink/50 px-s2 py-1', 'focus-within:border-ink focus-within:border-[1.5px]', disabled && 'opacity-40')}>
      <span className="truncate text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
      <span className="flex items-baseline gap-1">
        <input
          id={id}
          inputMode="decimal"
          disabled={disabled}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
            }
          }}
          className="w-full min-w-0 bg-transparent font-mono text-sm outline-none"
        />
        <span className="text-xs text-muted">{unit}</span>
      </span>
    </label>
  );
}

// UI-SWT-001
export function Swatch({ hex, name, selected, onSelect }: { hex: string; name: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      title={name}
      onClick={onSelect}
      className={cx('glass-press grid size-swatch place-items-center rounded-full', selected ? 'glass outline-2 outline-select' : 'border border-transparent')}
    >
      {/* Pastille bombée : reflet en haut, ombre en bas, comme une goutte de verre teintée. */}
      <span
        className={cx('rounded-full', selected ? 'size-8' : 'size-10')}
        style={{
          background: `radial-gradient(circle at 35% 25%, rgb(255 255 255 / 0.55), transparent 45%), ${hex}`,
          boxShadow: 'inset 0 -2px 4px rgb(0 0 0 / 0.18), inset 0 1px 1px rgb(255 255 255 / 0.6), 0 0 0 0.5px rgb(27 30 34 / 0.35)',
        }}
      />
    </button>
  );
}

// UI-BDG-001
export function PreviewBadge({ text }: { text: string }) {
  return (
    <div className="glass pointer-events-none inline-flex min-h-h-chip items-center rounded-r-pill px-s4 text-xs leading-tight">
      {text}
    </div>
  );
}

// UI-WRN-001
// `tone` : « warn » pour un problème d'impression à corriger, « info » pour un simple point à confirmer.
export function WarningItem({ children, action, tone = 'warn' }: { children: ReactNode; action?: ReactNode; tone?: 'warn' | 'info' }) {
  return (
    <div
      role="status"
      className={cx(
        'flex gap-s4 rounded-r-ctl p-s4 text-sm',
        tone === 'warn' ? 'border border-warn/50 bg-warn-bg text-warn' : 'border border-line bg-white/50 text-muted',
      )}
    >
      <Icon name={tone === 'warn' ? 'warning' : 'info'} size={18} className="mt-px shrink-0" />
      <div className="flex-1">
        <p>{children}</p>
        {action && <div className="mt-s2">{action}</div>}
      </div>
    </div>
  );
}

// Fenêtre modale : piège le focus de façon simple, Échap ferme, le focus revient à l'élément d'origine.
export function Dialog({
  title, onClose, children, footer, closeLabel,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // onClose est souvent une fonction recréée à chaque rendu : on la lit via une ref pour monter l'effet une seule fois.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 desk:items-center" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-96px)] w-full flex-col rounded-t-r1 bg-surface p-s3 max-desk:pb-safe desk:max-h-[calc(100dvh-64px)] desk:w-w-dialog desk:rounded-r1"
      >
        <div className="mb-s1 flex items-center justify-between gap-s2">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <IconButton label={closeLabel} onClick={onClose}><Icon name="close" /></IconButton>
        </div>
        <div className="-mx-s3 flex-1 overflow-y-auto px-s3">{children}</div>
        {footer && <div className="mt-s3 flex flex-col-reverse gap-s4 desk:flex-row desk:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/** Lien « retour » avec l'apparence d'un IconButton. */
export const backLinkClass =
  'inline-flex size-touch-min shrink-0 items-center justify-center rounded-r-ctl text-lg leading-none hover:bg-paper active:bg-line/60';

export { cx };

/** Chargement d'une page entière : spinner centré sur une carte en verre. */
export function PageLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <span className="glass flex items-center gap-s4 rounded-r1 px-s3 py-s1 text-sm font-medium">
        <Spinner size={22} />
        {label}
      </span>
    </main>
  );
}

/**
 * Logo SLASE (dégradé clair, conçu pour un fond sombre) dans une pastille de verre fumé, suivi de « Custom 3D ».
 * Le nom complet reste lisible par les lecteurs d'écran.
 */
export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-s2" aria-label={fr.appName} role="img">
      <span className="glass-dark inline-flex h-8 items-center rounded-r-ctl px-s2" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/slase-logo.png" alt="" className="h-4 w-auto" />
      </span>
      <span aria-hidden="true" className={cx('font-semibold tracking-tight', compact && 'max-desk:hidden')}>
        {fr.appNameSuffix}
      </span>
    </span>
  );
}
