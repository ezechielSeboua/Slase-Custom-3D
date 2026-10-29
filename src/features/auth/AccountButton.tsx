'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut, useAuth } from '@/features/auth/session';
import { cx, glassButton, IconButton } from '@/features/editor/ui';
import { Icon } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { AvatarImage } from '@/features/auth/AvatarImage';
import { fr } from '@/i18n/fr';

const t = fr.auth;

/** En-tête : « Se connecter » quand on ne l'est pas, sinon une pastille avec l'initiale et un menu (compte, déconnexion). */
export function AccountButton() {
  const router = useRouter();
  const { status, user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

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
  return (
    <div ref={ref} className="relative">
      <IconButton
        variant="outline"
        label={t.accountMenu(email)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-0"
      >
        <AvatarImage initial={email.charAt(0)} className="size-full" />
      </IconButton>
      {open && (
        <div role="menu" className="glass absolute right-0 z-30 mt-1 w-64 rounded-r1 py-s2">
          <p className="truncate px-s1 pb-s2 text-xs text-muted">{email}</p>
          <Link
            href="/compte"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex h-touch-min items-center gap-s2 px-s1 text-sm hover:bg-white/60"
          >
            <Icon name="user" size={18} />
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
            className="flex h-touch-min w-full items-center gap-s2 px-s1 text-left text-sm hover:bg-white/60"
          >
            <Icon name="logout" size={18} />
            {t.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
