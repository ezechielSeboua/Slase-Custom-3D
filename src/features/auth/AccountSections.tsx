'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, cx, IconButton, Spinner, WarningItem } from '@/features/editor/ui';
import { Icon } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { listDesigns } from '@/features/storage/db';
import { syncNow, useSync } from '@/features/storage/sync';
import { deleteShare, listShares, shareUrl, type ActiveShare } from '@/features/storage/share';
import { buildDesignsArchive, downloadBlob } from '@/features/storage/json';
import { fr } from '@/i18n/fr';

const t = fr.auth;

const longDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Titre et contenu d'une section de « Mon compte », séparée de la précédente par un filet. */
export function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('space-y-s4 border-t border-line pt-s3', className)}>
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

// ---------- Synchronisation ----------
export function SyncSection() {
  const { status, revision, lastSynced } = useSync();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    listDesigns()
      .then((d) => alive && setCount(d.length))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [revision, status]);

  const syncing = status === 'syncing';
  const tone = status === 'error' || status === 'offline' ? 'text-warn' : 'text-muted';
  return (
    <Section title={t.syncTitle}>
      <div className="space-y-1 text-sm">
        {count !== null && <p className="font-medium">{t.syncCount(count)}</p>}
        <p role="status" className={cx('flex items-center gap-1 text-xs', tone)}>
          {syncing && <Spinner size={12} />}
          {status === 'synced' && lastSynced
            ? t.lastSynced(new Date(lastSynced).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
            : status !== 'off' && fr.list.sync[status]}
        </p>
      </div>
      <Button onClick={() => void syncNow()} disabled={syncing || status === 'offline'}>
        <Icon name="refresh" size={18} />
        {t.syncNow}
      </Button>
      <p className="text-xs text-muted">{t.syncInfo}</p>
    </Section>
  );
}

// ---------- Liens partagés ----------
export function SharesSection() {
  const [shares, setShares] = useState<ActiveShare[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShares(await listShares());
      setError(false);
    } catch {
      setShares([]);
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const copy = async (s: ActiveShare) => {
    try {
      await navigator.clipboard.writeText(shareUrl(s.token));
      showToast(fr.share.copied);
    } catch {
      setError(true);
    }
  };

  const disable = async (s: ActiveShare) => {
    setBusy(s.designId);
    try {
      await deleteShare(s.designId);
      setShares((list) => list?.filter((x) => x.designId !== s.designId) ?? null);
      showToast(fr.share.disabled);
    } catch {
      setError(true);
    }
    setBusy(null);
  };

  return (
    <Section title={t.sharesTitle}>
      {shares === null ? (
        <Spinner size={20} label={fr.common.loading} />
      ) : error ? (
        <WarningItem>{t.sharesError}</WarningItem>
      ) : shares.length === 0 ? (
        <p className="text-sm text-muted">{t.sharesEmpty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shares.map((s) => (
            <li key={s.token} className="flex min-h-h-row items-center gap-s2 py-s2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name || fr.list.untitled}</p>
                <p className="text-xs text-muted">{t.sharesSince(longDate(s.createdAt))}</p>
              </div>
              <IconButton variant="outline" label={fr.share.copy} onClick={() => copy(s)}>
                <Icon name="copy" size={18} />
              </IconButton>
              <Button disabled={busy === s.designId} busy={busy === s.designId} onClick={() => disable(s)}>
                {fr.share.disableShort}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Mes données ----------
export function DataSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // D'abord la liste à jour du compte, pour n'oublier aucune création faite sur un autre appareil.
      await syncNow();
      const designs = await listDesigns();
      if (!designs.length) {
        setMessage(t.dataEmpty);
      } else {
        downloadBlob(await buildDesignsArchive(designs), t.dataFile(new Date().toISOString().slice(0, 10)));
      }
    } catch {
      setMessage(t.dataError);
    }
    setBusy(false);
  };

  return (
    <Section title={t.dataTitle}>
      <p className="text-xs text-muted">{t.dataHelp}</p>
      <Button onClick={download} disabled={busy} busy={busy}>
        {!busy && <Icon name="download" size={18} />}
        {t.dataDownload}
      </Button>
      {message && <WarningItem tone={message === t.dataEmpty ? 'info' : 'warn'}>{message}</WarningItem>}
    </Section>
  );
}
