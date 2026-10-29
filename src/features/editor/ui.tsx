'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/features/editor/icons';
import { useIsDesktop } from '@/lib/useMedia';
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

/**
 * Bloque le défilement de la page tant que `active` est vrai (fenêtre, feuille d'actions ouverte).
 * Compteur partagé : deux surcouches empilées ne débloquent la page qu'à la fermeture de la dernière.
 */
let scrollLocks = 0;
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    if (scrollLocks++ === 0) root.style.overflow = 'hidden';
    return () => {
      if (--scrollLocks === 0) root.style.overflow = '';
    };
  }, [active]);
}

/** Ligne d'un menu (liste déroulante sur ordinateur, feuille d'actions sur mobile). */
export const menuItemClass =
  'flex min-h-touch-min w-full items-center gap-s2 px-s1 text-left text-sm hover:bg-paper active:bg-line/60 max-desk:gap-s1 max-desk:py-s4 max-desk:text-base';

/** Surface d'un menu déroulant : opaque, pour rester lisible au-dessus d'un en-tête déjà flouté. */
export const menuSurfaceClass = 'rounded-r1 border border-line bg-surface py-s2 shadow-lg';

/**
 * Feuille d'actions mobile : posée en bas de l'écran, à portée du pouce, au-dessus d'un voile.
 * Rendue dans <body> (un parent flouté fausserait sa position), opaque, page bloquée derrière.
 * Toucher le voile ou Échap ferme.
 */
export function ActionSheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useScrollLock();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Le choix en cours s'il y en a un (menu de choix), sinon la première ligne.
    const items = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? ref.current?.querySelector<HTMLElement>('[role^="menuitem"]');
    items?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="menu" aria-label={title} className="w-full overscroll-contain rounded-t-r1 bg-surface pt-s2 pb-safe shadow-lg">
        {title && <p className="truncate border-b border-line px-s1 pt-s2 pb-s4 text-sm font-semibold">{title}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Ouvre une liste déroulante (ordinateur) ou une feuille d'actions (mobile) ; un clic ailleurs la ferme. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();
  useEffect(() => {
    if (!open || !desktop) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open, desktop]);
  return { open, setOpen, ref, desktop };
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** Couleur montrée en pastille devant le libellé (couleur du tissu). */
  swatch?: string;
}

/**
 * Bouton « Critère ▾ » qui ouvre une liste de choix. Une valeur choisie s'affiche dans le bouton
 * (« Coupe : Oversize ») ; `onClear` ajoute une croix pour la retirer.
 */
export function ChoiceMenu<T extends string>({
  label, value, options, onChange, onClear, clearLabel, icon, compactLabel,
}: {
  label: string;
  value: T | null;
  options: Choice<T>[];
  onChange: (v: T) => void;
  onClear?: () => void;
  clearLabel?: string;
  icon?: IconName;
  /** Libellé court du bouton sur mobile (ex. une icône seule pour le tri). */
  compactLabel?: boolean;
}) {
  const { open, setOpen, ref, desktop } = useMenu();
  const current = options.find((o) => o.value === value);
  const active = Boolean(current && onClear);
  const items = options.map((o) => (
    <button
      key={o.value}
      type="button"
      role="menuitemradio"
      aria-checked={o.value === value}
      onClick={() => {
        setOpen(false);
        onChange(o.value);
      }}
      className={menuItemClass}
    >
      {o.swatch ? (
        <span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-ink/30" style={{ background: o.swatch }} />
      ) : null}
      <span className="flex-1">{o.label}</span>
      {o.value === value && <Icon name="check" size={18} />}
    </button>
  ));
  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compactLabel && !desktop ? `${label} : ${current?.label ?? ''}` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex h-h-btn items-center gap-s2 rounded-r-ctl px-s4 text-sm whitespace-nowrap',
          glassButton.secondary,
          active && 'font-semibold',
          active && onClear && 'rounded-e-none',
        )}
      >
        {icon && <Icon name={icon} size={18} />}
        {!(compactLabel && !desktop) && <span>{current && (active || compactLabel) ? `${label} : ${current.label}` : label}</span>}
        {!active && !(compactLabel && !desktop) && <Icon name="chevronDown" size={16} />}
      </button>
      {active && onClear && (
        <button
          type="button"
          aria-label={`${clearLabel ?? fr.common.close} : ${label}`}
          title={clearLabel}
          onClick={onClear}
          className={cx('inline-flex h-h-btn w-10 items-center justify-center rounded-r-ctl rounded-s-none border-l border-line', glassButton.secondary)}
        >
          <Icon name="close" size={16} />
        </button>
      )}
      {open && desktop && (
        <div role="menu" aria-label={label} className={cx('absolute top-full left-0 z-30 mt-1 min-w-52', menuSurfaceClass)}>
          {items}
        </div>
      )}
      {open && !desktop && (
        <ActionSheet title={label} onClose={() => setOpen(false)}>
          {items}
        </ActionSheet>
      )}
    </div>
  );
}

/** Bouton ⋯ qui ouvre une courte liste d'actions (liste déroulante ou feuille d'actions). */
export function ActionMenu({ label, title, items }: { label: string; title?: string; items: { icon: IconName; label: string; onSelect: () => void }[] }) {
  const { open, setOpen, ref, desktop } = useMenu();
  const rows = items.map((it) => (
    <button
      key={it.label}
      type="button"
      role="menuitem"
      className={menuItemClass}
      onClick={() => {
        setOpen(false);
        it.onSelect();
      }}
    >
      <Icon name={it.icon} size={desktop ? 18 : 20} />
      {it.label}
    </button>
  ));
  return (
    <div ref={ref} className="relative">
      <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </IconButton>
      {open && desktop && <div role="menu" className={cx('absolute top-full right-0 z-30 mt-1 w-56', menuSurfaceClass)}>{rows}</div>}
      {open && !desktop && <ActionSheet title={title} onClose={() => setOpen(false)}>{rows}</ActionSheet>}
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
  useScrollLock();
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
 * Emblème Slase (S dans un anneau, fond transparent), suivi du nom de l'app : l'emblème ne porte pas de texte.
 * Le nom complet reste lisible par les lecteurs d'écran.
 */
export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-s2" aria-label={fr.appName} role="img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/slase-emblem.png" alt="" aria-hidden="true" className="size-8 object-contain" />
      <span aria-hidden="true" className={cx('font-semibold tracking-tight', compact && 'max-desk:hidden')}>
        {fr.appName}
      </span>
    </span>
  );
}
