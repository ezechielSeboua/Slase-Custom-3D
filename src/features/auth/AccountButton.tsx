'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut, useAuth } from '@/features/auth/session';
import { ActionSheet, cx, glassButton, IconButton, menuItemClass, menuSurfaceClass } from '@/features/editor/ui';
import { useIsDesktop } from '@/lib/useMedia';
import { Icon } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { AvatarImage } from '@/features/auth/AvatarImage';
import { useSync } from '@/features/storage/sync';
import { fr } from '@/i18n/fr';

const t = fr.auth;

/** En-tête : « Se connecter » quand on ne l'est pas, sinon une pastille avec l'initiale et un menu (compte, déconnexion). */
export function AccountButton() {
  const router = useRouter();
  const { status, user } = useAuth();
  const { status: sync, lastSynced } = useSync();
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  const ref = useRef<HTMLDivElement>(null);

  // Liste déroulante (ordinateur) : un clic ailleurs la ferme. La feuille mobile gère elle-même son voile.
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

  // Sans Supabase (ou pendant la lecture de la session) : rien, l'app fonctionne comme en V1.
  if (status === 'disabled' || status === 'loading') return null;

  if (status === 'signedOut' || !user) {
    return (
      <>
        <Link href="/connexion" className={cx('inline-flex h-h-btn items-center gap-s2 rounded-r-ctl px-s1 text-sm font-medium max-desk:hidden', glassButton.secondary)}>
          <Icon name="user" size={18} />
          {t.signIn}
        </Link>
        <Link href="/connexion" aria-label={t.signIn} title={t.signIn} className={cx('inline-flex size-touch-min items-center justify-center rounded-r-ctl desk:hidden', glassButton.secondary)}>
          <Icon name="user" />
        </Link>
      </>
    );
  }

  const email = user.email ?? '';
  const syncText =
    sync === 'off'
      ? ''
      : sync === 'synced' && lastSynced
        ? t.lastSynced(new Date(lastSynced).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
        : fr.list.sync[sync];
  const syncLine = syncText && (
    <p role="status" className={cx('px-s1 pb-s2 text-xs', sync === 'offline' || sync === 'error' ? 'text-warn' : 'text-muted')}>
      {syncText}
    </p>
  );
  const items = (
    <>
      <Link href="/compte" role="menuitem" onClick={() => setOpen(false)} className={menuItemClass}>
        <Icon name="user" size={desktop ? 18 : 20} />
        {t.account}
      </Link>
      <button
        type="button"
        role="menuitem"
        onClick={async () => {
          setOpen(false);
          await signOut();
          showToast(t.signedOut);
          router.refresh();
        }}
        className={menuItemClass}
      >
        <Icon name="logout" size={desktop ? 18 : 20} />
        {t.signOut}
      </button>
    </>
  );
  return (
    <div ref={ref} className="relative">
      <IconButton
        variant="outline"
        label={syncText ? `${t.accountMenu(email)} · ${syncText}` : t.accountMenu(email)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-0"
      >
        <AvatarImage initial={email.charAt(0)} className="size-full" />
      </IconButton>
      {/* Pastille de synchronisation, visible partout : turquoise enregistré (pulsé pendant l'envoi), brune hors ligne ou en erreur. */}
      {sync !== 'off' && (
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute right-0 bottom-0 size-3 rounded-full border-2 border-surface',
            sync === 'synced' && 'bg-select-strong',
            sync === 'syncing' && 'animate-pulse bg-select motion-reduce:animate-none',
            (sync === 'offline' || sync === 'error') && 'bg-warn',
          )}
        />
      )}
      {open && desktop && (
        <div role="menu" className={cx('absolute right-0 z-30 mt-1 w-64', menuSurfaceClass)}>
          <p className="truncate px-s1 pb-1 text-xs text-muted">{email}</p>
          {syncLine}
          {items}
        </div>
      )}
      {open && !desktop && (
        <ActionSheet title={email} onClose={() => setOpen(false)}>
          <div className="pt-s2">{syncLine}</div>
          {items}
        </ActionSheet>
      )}
    </div>
  );
}
