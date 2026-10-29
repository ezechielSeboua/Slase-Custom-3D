'use client';

import { useEffect, useId, useState } from 'react';
import { Button, Dialog, Spinner, WarningItem } from '@/features/editor/ui';
import { Icon } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { createShare, deleteShare, getShareToken, shareUrl } from '@/features/storage/share';
import { fr } from '@/i18n/fr';

const t = fr.share;

/** Lien de partage d'une création : le créer, le copier, le désactiver. */
export function ShareDialog({ designId, onClose }: { designId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inputId = useId();

  useEffect(() => {
    let alive = true;
    getShareToken(designId)
      .then((tk) => alive && setToken(tk))
      .catch(() => {
        if (!alive) return;
        setToken(null);
        setError(true);
      });
    return () => {
      alive = false;
    };
  }, [designId]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    }
    setBusy(false);
  };

  const url = token ? shareUrl(token) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t.copied);
    } catch {
      (document.getElementById(inputId) as HTMLInputElement | null)?.select();
    }
  };

  return (
    <Dialog
      title={t.title}
      closeLabel={fr.common.close}
      onClose={() => !busy && onClose()}
      footer={
        token ? (
          <>
            <Button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await deleteShare(designId);
                  setToken(null);
                  showToast(t.disabled);
                })
              }
            >
              {t.disable}
            </Button>
            <Button variant="primary" onClick={copy} disabled={busy}>
              <Icon name="copy" size={18} />
              {t.copy}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>{fr.common.cancel}</Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={busy || token === undefined}
              onClick={() => act(async () => setToken(await createShare(designId)))}
            >
              {t.create}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-s1 text-sm">
        <p>{t.intro}</p>
        {token === undefined ? (
          <Spinner size={20} label={fr.common.loading} />
        ) : (
          token && (
            <div>
              <label htmlFor={inputId} className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
                {t.linkLabel}
              </label>
              <input
                id={inputId}
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="glass h-h-field w-full rounded-r-ctl px-s4 text-base desk:text-sm"
              />
              <p className="mt-s2 text-xs text-muted">{t.disableHelp}</p>
            </div>
          )
        )}
        {error && <WarningItem>{t.error}</WarningItem>}
      </div>
    </Dialog>
  );
}
