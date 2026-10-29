'use client';

import { useState } from 'react';
import { cx } from '@/features/editor/ui';
import { useAvatar } from '@/features/auth/avatar';

/** Photo de profil ronde ; à défaut (pas de photo, image injoignable), l'initiale. Décorative : le libellé est porté par le parent. */
export function AvatarImage({ initial, className, textClass = 'text-sm' }: { initial: string; className?: string; textClass?: string }) {
  const url = useAvatar((s) => s.url);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span aria-hidden="true" className={cx('grid shrink-0 place-items-center overflow-hidden rounded-full', className)}>
      {url && failed !== url ? (
        // Pas de next/image : adresse signée ou photo Google, hors du domaine de l'app.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(url)} className="size-full object-cover" />
      ) : (
        <span className={cx('font-semibold uppercase', textClass)}>{initial || '?'}</span>
      )}
    </span>
  );
}
