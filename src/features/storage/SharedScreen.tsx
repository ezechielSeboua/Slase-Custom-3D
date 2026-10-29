'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadDesign, unloadDesign, useDesign } from '@/store/design';
import { setSharedAssets } from '@/features/storage/db';
import { openShare, ShareNotFoundError } from '@/features/storage/share';
import { SceneOverlay } from '@/features/editor/EditorScreen';
import { BrandMark, Button, cx, glassButton, PageLoader } from '@/features/editor/ui';
import { Icon } from '@/features/editor/icons';
import { fr } from '@/i18n/fr';

const Scene = dynamic(() => import('@/features/scene/Scene'), { ssr: false });
const t = fr.share;

/** Création ouverte par un lien de partage : la 3D seule, en lecture seule, sans compte. */
export function SharedScreen() {
  const token = useSearchParams().get('t') ?? '';
  const design = useDesign((s) => s.design);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    openShare(token)
      .then(({ design: d, assets }) => {
        if (!alive) return;
        setSharedAssets(assets);
        const metas = assets.map(({ blob: _blob, ...meta }) => {
          void _blob;
          return meta;
        });
        loadDesign(d, metas, true);
        setState('ready');
      })
      .catch((e) => alive && setState(e instanceof ShareNotFoundError ? 'missing' : 'error'));
    return () => {
      alive = false;
      unloadDesign();
      setSharedAssets([]);
    };
  }, [token, attempt]);

  const header = (
    <header className="flex h-h-topbar shrink-0 items-center gap-s2 border-b border-white/70 bg-white/55 px-safe backdrop-blur-xl">
      <Link href="/" aria-label={fr.appName}>
        <BrandMark compact />
      </Link>
      <div className="min-w-0 flex-1">
        {design && state === 'ready' && (
          <>
            <h1 className="truncate text-sm font-semibold">{design.name || fr.list.untitled}</h1>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Icon name="lock" size={12} />
              {t.readOnly}
            </p>
          </>
        )}
      </div>
      <Link href="/new" className={cx('inline-flex h-h-btn shrink-0 items-center gap-s2 rounded-r-ctl px-s1 text-sm font-medium', glassButton.secondary)}>
        <Icon name="plus" size={18} />
        {t.makeYours}
      </Link>
    </header>
  );

  if (state === 'missing' || state === 'error') {
    return (
      <div className="flex min-h-dvh flex-col">
        {header}
        <main className="grid flex-1 place-items-center p-s1 text-center">
          <div className="glass max-w-md space-y-s1 rounded-r1 p-s3">
            <p>{state === 'missing' ? t.notFound : t.loadError}</p>
            {state === 'error' && (
              <Button
                onClick={() => {
                  setState('loading');
                  setAttempt((n) => n + 1);
                }}
              >
                {fr.common.retry}
              </Button>
            )}
          </div>
        </main>
      </div>
    );
  }
  if (state === 'loading' || !design) return <PageLoader label={fr.common.loading} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {header}
      <main className="relative min-h-0 flex-1">
        <Scene />
        <SceneOverlay />
      </main>
    </div>
  );
}
