'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Design } from '@/types/design';
import { colorById, colors } from '@/lib/config';
import {
  deleteDesign, duplicateDesign, getDesign, getThumbs, listDesigns, putDesign, removeOrphanAssets, restoreDesign, storageAvailable,
} from '@/features/storage/db';
import { designFileBlob, downloadBlob, importDesignFile, slug } from '@/features/storage/json';
import { BrandMark, cx, glassButton, IconButton, WarningItem } from '@/features/editor/ui';
import { Icon, type IconName } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { fr } from '@/i18n/fr';

const GarmentPreview = dynamic(() => import('@/features/scene/GarmentPreview'), { ssr: false });
const t = fr.list;

/** « il y a 5 min », « hier », « il y a 3 jours »… au-delà d'un mois, la date. */
function relativeDate(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return t.justNow;
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Miniature : le devant, et le dos en fondu au survol de la carte. */
function Thumb({ id, updated }: { id: string; updated: string }) {
  const [urls, setUrls] = useState<{ front?: string; back?: string }>({});
  useEffect(() => {
    const made: string[] = [];
    getThumbs(id).then((th) => {
      if (!th) return;
      const front = URL.createObjectURL(th.blob);
      const back = th.back ? URL.createObjectURL(th.back) : undefined;
      made.push(front, ...(back ? [back] : []));
      setUrls({ front, back });
    });
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [id, updated]);
  if (!urls.front) return <div className="size-full bg-white/40" />;
  return (
    <span className="relative block size-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls.front} alt="" className="absolute inset-0 size-full object-cover transition-opacity duration-300 group-hover:opacity-0" />
      {urls.back && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls.back} alt="" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}
    </span>
  );
}

function CardMenu({ onRename, onDuplicate, onExport, onDelete }: Record<'onRename' | 'onDuplicate' | 'onExport' | 'onDelete', () => void>) {
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
  const item = (icon: IconName, label: string, fn: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="flex h-touch-min w-full items-center gap-s2 px-s1 text-left text-sm hover:bg-white/60"
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <IconButton label={fr.common.more} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </IconButton>
      {open && (
        <div role="menu" className="glass absolute right-0 bottom-full z-20 mb-1 w-52 rounded-r1 py-s2">
          {item('pencil', fr.common.rename, onRename)}
          {item('copy', fr.common.duplicate, onDuplicate)}
          {item('download', t.exportJson, onExport)}
          {item('trash', fr.common.delete, onDelete)}
        </div>
      )}
    </div>
  );
}

/** Accueil d'un premier passage : un tee-shirt 3D qui tourne, et de quoi commencer. */
function Welcome({ onImport }: { onImport: () => void }) {
  return (
    <section className="glass grid items-center gap-s3 overflow-hidden rounded-r1 p-s3 desk:grid-cols-2 desk:p-s5">
      <GarmentPreview garment="tshirt" fit="oversize" color={colors[0]?.id ?? ''} label={t.welcomePreview} className="h-64 desk:h-96" />
      <div className="space-y-s1 text-center desk:text-left">
        <h2 className="text-2xl font-semibold desk:text-3xl">{t.welcomeTitle}</h2>
        <p className="text-muted">{t.welcomeText}</p>
        <div className="flex flex-col gap-s4 pt-s2 desk:flex-row">
          <Link href="/new" className={cx('inline-flex h-h-btn items-center justify-center gap-s2 rounded-r-ctl px-s3 font-medium', glassButton.primary)}>
            <Icon name="plus" size={18} />
            {t.welcomeCta}
          </Link>
          <button type="button" onClick={onImport} className={cx('inline-flex h-h-btn items-center justify-center gap-s2 rounded-r-ctl px-s3 text-sm font-medium', glassButton.secondary)}>
            <Icon name="upload" size={18} />
            {t.importJson}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function CreationsScreen() {
  const router = useRouter();
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setDesigns(await listDesigns());
    } catch {
      setDesigns([]);
    }
  }, []);

  useEffect(() => {
    storageAvailable().then(setStorageOk);
    // Images des créations supprimées (plus d'annulation possible après un rechargement).
    removeOrphanAssets().catch(() => {});
    // Chargement initial depuis IndexedDB.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const onImport = async (file: File) => {
    try {
      const d = await importDesignFile(await file.text());
      showToast(t.imported);
      router.push(`/editor?id=${d.id}`);
    } catch {
      setMessage(t.importError);
    }
  };

  const rename = async (id: string, name: string) => {
    const d = await getDesign(id);
    if (d && name.trim()) await putDesign({ ...d, name: name.trim(), updated_at: new Date().toISOString() });
    setRenaming(null);
    refresh();
  };

  // Suppression immédiate, annulable depuis la notification ; les images partent au prochain nettoyage.
  const remove = async (d: Design) => {
    const backup = await deleteDesign(d.id);
    refresh();
    showToast(t.deleted(d.name || t.untitled), {
      action: {
        label: fr.common.cancel,
        onAction: async () => {
          await restoreDesign(backup);
          refresh();
        },
      },
    });
  };

  const openImport = () => fileRef.current?.click();

  return (
    <div className="min-h-dvh pb-28 desk:pb-s5">
      <header className="sticky top-0 z-10 border-b border-white/70 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex h-h-topbar max-w-w-max items-center justify-between gap-s4 px-safe">
          <BrandMark />
          <div className="flex items-center gap-s4">
            <button type="button" onClick={openImport} className={cx('inline-flex h-h-btn items-center gap-s2 rounded-r-ctl px-s1 text-sm font-medium max-desk:hidden', glassButton.secondary)}>
              <Icon name="upload" size={18} />
              {t.importJson}
            </button>
            <IconButton className="desk:hidden" variant="outline" label={t.importJson} onClick={openImport}>
              <Icon name="upload" />
            </IconButton>
            <Link href="/new" className={cx('hidden h-h-btn items-center gap-s2 rounded-r-ctl px-s1 text-sm font-medium desk:inline-flex', glassButton.primary)}>
              <Icon name="plus" size={18} />
              {t.newDesign}
            </Link>
          </div>
        </div>
      </header>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = '';
        }}
      />

      <main className="mx-auto max-w-w-max px-s1 pt-s1 desk:pt-s5">
        <div className="mb-s1 space-y-s2" aria-live="polite">
          {!storageOk && <WarningItem>{t.storageUnavailable}</WarningItem>}
          {message && <WarningItem>{message}</WarningItem>}
        </div>

        {designs === null ? (
          <div className="grid grid-cols-2 gap-s4 desk:grid-cols-4 desk:gap-s3" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="aspect-[173/240] animate-pulse rounded-r1 border border-dashed border-line bg-white/40" />
            ))}
          </div>
        ) : designs.length === 0 ? (
          <Welcome onImport={openImport} />
        ) : (
          <>
            <h1 className="mb-s1 text-2xl font-semibold desk:mb-s3">
              {t.title} <span className="text-base font-normal text-muted">{designs.length}</span>
            </h1>
            <ul className="grid grid-cols-2 gap-s4 desk:grid-cols-4 desk:gap-s3">
              <li>
                <Link
                  href="/new"
                  className="glass-press flex h-full min-h-48 flex-col items-center justify-center gap-s2 rounded-r1 border-[1.5px] border-dashed border-ink/30 bg-white/30 text-center hover:border-ink/60 hover:bg-white/50"
                >
                  <span className="glass grid size-12 place-items-center rounded-full">
                    <Icon name="plus" size={24} />
                  </span>
                  <span className="font-medium">{t.newDesign}</span>
                </Link>
              </li>
              {designs.map((d) => {
                const color = colorById(d.color);
                return (
                  <li key={d.id} className="glass group rounded-r1 p-s2">
                    <div className="relative">
                      <Link href={`/editor?id=${d.id}`} className="block aspect-square overflow-hidden rounded-r2" aria-label={t.open(d.name || t.untitled)}>
                        <Thumb id={d.id} updated={d.updated_at} />
                      </Link>
                      {/* Actions rapides, visibles au survol ou au clavier (sur mobile : menu ⋯). */}
                      <div className="absolute top-s2 right-s2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-desk:hidden">
                        <IconButton variant="outline" className="glass size-9" label={fr.common.duplicate} onClick={async () => {
                          await duplicateDesign(d.id, t.copySuffix);
                          refresh();
                        }}>
                          <Icon name="copy" size={16} />
                        </IconButton>
                        <IconButton variant="outline" className="glass size-9" label={t.exportJson} onClick={async () => downloadBlob(await designFileBlob(d), `${slug(d.name)}.json`)}>
                          <Icon name="download" size={16} />
                        </IconButton>
                      </div>
                    </div>
                    <div className="mt-s2 flex items-start gap-s2">
                      <div className="min-w-0 flex-1 pl-1">
                        {renaming === d.id ? (
                          <input
                            autoFocus
                            defaultValue={d.name}
                            aria-label={fr.editor.name}
                            className="w-full rounded border border-ink bg-white px-1 text-base desk:text-sm"
                            onBlur={(e) => rename(d.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') setRenaming(null);
                            }}
                          />
                        ) : (
                          <Link href={`/editor?id=${d.id}`} className="block truncate text-sm font-semibold">
                            {d.name || t.untitled}
                          </Link>
                        )}
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                          <span className="size-2.5 shrink-0 rounded-full border border-ink/30" style={{ background: color?.hex }} aria-hidden="true" />
                          <span className="truncate">
                            {fr.garments[d.garment]} · {fr.fits[d.fit]}
                            {color && ` · ${color.name}`}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted">{relativeDate(d.updated_at)}</p>
                      </div>
                      <CardMenu
                        onRename={() => setRenaming(d.id)}
                        onDuplicate={async () => {
                          await duplicateDesign(d.id, t.copySuffix);
                          refresh();
                        }}
                        onExport={async () => downloadBlob(await designFileBlob(d), `${slug(d.name)}.json`)}
                        onDelete={() => remove(d)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/70 bg-white/55 p-s1 pb-safe px-safe backdrop-blur-xl desk:hidden">
        <Link href="/new" className={cx('flex h-h-btn items-center justify-center gap-s2 rounded-r-ctl text-sm font-medium', glassButton.primary)}>
          <Icon name="plus" size={18} />
          {t.newDesign}
        </Link>
      </div>
    </div>
  );
}
