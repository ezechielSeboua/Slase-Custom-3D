'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getGarmentModel } from '@/lib/config';
import {
  deleteElement, loadDesign, redo, select, setBackground, setName, undo, unloadDesign, useDesign,
} from '@/store/design';
import { getAssetMetas, getDesign, putDesign, putThumb } from '@/features/storage/db';
import { captureRef, requestView, useScene, type ViewId } from '@/features/scene/sceneStore';
import { retryModel } from '@/features/scene/retry';
import { AtelierNotes, GarmentPanel, LayersPanel, PropertiesPanel } from '@/features/editor/panels';
import { Icon } from '@/features/editor/icons';
import { backLinkClass, Button, cx, IconButton, PageLoader, PreviewBadge, Segmented, Spinner } from '@/features/editor/ui';
import { ExportDialog } from '@/features/export/ExportDialog';
import { buildGlb, openQuickLook, supportsQuickLook } from '@/features/export/glb';
import { downloadBlob } from '@/features/storage/json';
import { showToast } from '@/features/editor/Toast';
import { useIsDesktop } from '@/lib/useMedia';
import { fr } from '@/i18n/fr';

const Scene = dynamic(() => import('@/features/scene/Scene'), { ssr: false });
const t = fr.editor;

const SAVE_DELAY_MS = 600;
const THUMB_DELAY_MS = 2500;
const THUMB_WIDTH_PX = 512;

/** Sauvegarde automatique dans IndexedDB, plus une miniature quand l'édition se calme. */
function useAutosave() {
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let thumbTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useDesign.subscribe((s, prev) => {
      if (!s.design || s.design === prev.design || !prev.design || s.gestureStart) return;
      const d = s.design;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void putDesign(d), SAVE_DELAY_MS);
      clearTimeout(thumbTimer);
      thumbTimer = setTimeout(async () => {
        if (!captureRef.current || useScene.getState().status !== 'ready') return;
        try {
          const front = await captureRef.current('front', 'light', THUMB_WIDTH_PX);
          const back = await captureRef.current('back', 'light', THUMB_WIDTH_PX);
          await putThumb(d.id, front, back);
        } catch {
          /* la miniature est facultative */
        }
      }, THUMB_DELAY_MS);
    });
    return () => {
      unsub();
      clearTimeout(thumbTimer);
      if (saveTimer) {
        clearTimeout(saveTimer);
        const d = useDesign.getState().design;
        if (d) void putDesign(d);
      }
    };
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && !typing && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
        const id = useDesign.getState().selectedId;
        if (id && !document.querySelector('[role="dialog"]')) {
          e.preventDefault();
          deleteElement(id);
        }
      } else if (e.key === 'Escape' && !typing && !document.querySelector('[role="dialog"]')) {
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Télécharge le tee-shirt personnalisé en .glb, sans passer par la fenêtre d'export.
 * `bar` : bouton avec libellé, dans la barre du haut (ordinateur) ; `overlay` : icône posée sur la scène (mobile).
 */
function GlbButton({ place }: { place: 'bar' | 'overlay' }) {
  const status = useScene((s) => s.status);
  const [busy, setBusy] = useState(false);
  // iPhone / iPad : le GLB ne s'ouvre pas nativement ; on propose la réalité augmentée (USDZ + Quick Look).
  const ar = useSyncExternalStore(() => () => {}, supportsQuickLook, () => false);
  const run = async () => {
    const d = useDesign.getState().design;
    if (!d || busy) return;
    setBusy(true);
    try {
      if (ar) {
        await openQuickLook(d);
      } else {
        const { blob, filename } = await buildGlb(d);
        downloadBlob(blob, filename);
        showToast(fr.export.glbDone);
      }
    } catch (e) {
      console.warn('3d', e);
      showToast(ar ? fr.export.arError : fr.export.glbError);
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || status !== 'ready';
  const label = ar ? fr.export.arLabel : fr.export.glbDownloadLabel;
  if (place === 'bar') {
    return (
      <Button className="max-desk:hidden" onClick={run} disabled={disabled} busy={busy} title={label}>
        {!busy && <Icon name="cube" size={18} />}
        {ar ? fr.export.ar : fr.export.glbDownload}
      </Button>
    );
  }
  return (
    <IconButton variant="outline" label={label} onClick={run} disabled={disabled}>
      {busy ? <Spinner size={18} /> : <Icon name="cube" />}
    </IconButton>
  );
}

function TopBar({ onExport }: { onExport: () => void }) {
  const design = useDesign((s) => s.design)!;
  const canUndo = useDesign((s) => s.past.length > 0);
  const canRedo = useDesign((s) => s.future.length > 0);
  return (
    <header className="flex h-h-topbar shrink-0 items-center gap-s2 border-b border-white/70 bg-white/55 px-safe backdrop-blur-xl">
      <Link href="/" aria-label={t.backToList} title={t.backToList} className={backLinkClass}>
        <Icon name="back" />
      </Link>
      <input
        aria-label={t.name}
        value={design.name}
        onChange={(e) => setName(e.target.value)}
        className="h-h-field min-w-0 flex-1 truncate rounded-r-ctl border border-dashed border-transparent px-s2 font-medium hover:border-line focus:border-ink"
      />
      <IconButton label={t.undo} onClick={undo} disabled={!canUndo}><Icon name="undo" /></IconButton>
      <IconButton label={t.redo} onClick={redo} disabled={!canRedo}><Icon name="redo" /></IconButton>
      <GlbButton place="bar" />
      <Button variant="primary" className="max-desk:hidden" onClick={onExport}>
        <Icon name="download" size={18} />
        {t.export}
      </Button>
      <IconButton className="desk:hidden" variant="primary" label={t.export} onClick={onExport}>
        <Icon name="download" />
      </IconButton>
    </header>
  );
}

/** Fond de scène clair ou sombre, pour juger le contraste ; à côté des vues rapides. */
function BackgroundToggle() {
  const background = useDesign((s) => s.background);
  const dark = background === 'dark';
  return (
    <IconButton
      variant="outline"
      label={dark ? t.backgroundLight : t.backgroundDark}
      aria-pressed={dark}
      onClick={() => setBackground(dark ? 'light' : 'dark')}
      className="shrink-0"
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </IconButton>
  );
}

/**
 * Bandeau d'aperçu, fond, chargement et vues rapides ; repris tel quel par la page de partage.
 * `actions` : boutons ajoutés sous le choix du fond (éditeur mobile).
 */
export function SceneOverlay({ actions }: { actions?: React.ReactNode }) {
  const status = useScene((s) => s.status);
  const view = useScene((s) => s.view.id);
  const design = useDesign((s) => s.design)!;
  const model = getGarmentModel(design.garment, design.fit);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-s1 top-s1 flex flex-col items-start gap-s2 pr-14">
        <span className="max-desk:hidden"><PreviewBadge text={fr.previewNotice} /></span>
        <span className="desk:hidden"><PreviewBadge text={fr.previewNoticeShort} /></span>
        {model?.provisional && <span className="glass rounded-r-pill px-s2 text-xs text-muted">{t.provisionalModel}</span>}
      </div>
      {/* En haut à droite : laisse toute la largeur du bas à la barre de vues (mobile). */}
      <div className="absolute top-s1 right-s1 flex flex-col gap-s2">
        <BackgroundToggle />
        {actions}
      </div>
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status">
          <span className="glass flex items-center gap-s4 rounded-r1 px-s3 py-s4 text-sm font-medium">
            <Spinner size={22} />
            {t.modelLoading}
          </span>
        </div>
      )}
      {status === 'error' && model && (
        <div className="absolute inset-0 grid place-items-center" role="alert">
          <div className="glass rounded-r1 p-s3 text-center">
            <p className="mb-s1 text-sm">{t.modelError}</p>
            <Button onClick={() => retryModel(model.model)}>{fr.common.retry}</Button>
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-s1 flex items-center justify-center px-s1">
        <div className="w-full max-w-110">
          <Segmented<ViewId>
            label={fr.views.label}
            hideLabel
            value={view}
            onChange={requestView}
            options={[
              { value: 'front', label: fr.views.front },
              { value: 'back', label: fr.views.back },
              { value: 'leftSleeve', label: fr.views.leftSleeve },
              { value: 'rightSleeve', label: fr.views.rightSleeve },
              { value: 'threeQuarter', label: fr.views.threeQuarter },
            ]}
          />
        </div>
      </div>
    </>
  );
}

type Tab = 'garment' | 'elements' | 'properties';
type SheetState = 'peek' | 'mid' | 'full';

// Hauteur intermédiaire : celle de la maquette, sans dépasser 46 % de l'écran (petits téléphones).
const SHEET_HEIGHT: Record<SheetState, string> = {
  peek: 'h-h-sheet-peek',
  mid: 'h-[min(var(--spacing-h-sheet-mid),46dvh)]',
  full: 'h-[calc(100dvh-var(--spacing-h-topbar))]',
};
// Bas de la scène : elle occupe ce que le panneau laisse (en plein écran, elle reste à sa taille intermédiaire, cachée).
const SCENE_BOTTOM: Record<SheetState, string> = {
  peek: 'bottom-[var(--spacing-h-sheet-peek)]',
  mid: 'bottom-[min(var(--spacing-h-sheet-mid),46dvh)]',
  full: 'bottom-[min(var(--spacing-h-sheet-mid),46dvh)]',
};
const SHEET_ORDER: SheetState[] = ['peek', 'mid', 'full'];
/** Glissement minimal, en pixels, pour changer de hauteur. */
const SWIPE_PX = 32;

function MobileSheet({ state, setState }: { state: SheetState; setState: (s: SheetState) => void }) {
  const [tab, setTab] = useState<Tab>('elements');
  const next: Record<SheetState, SheetState> = { peek: 'mid', mid: 'full', full: 'peek' };
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const step = (dir: 1 | -1) => setState(SHEET_ORDER[Math.max(0, Math.min(2, SHEET_ORDER.indexOf(state) + dir))]);
  return (
    <section className={cx('absolute inset-x-0 bottom-0 z-10 flex flex-col glass rounded-t-r1', SHEET_HEIGHT[state])}>
      {/* Toucher : hauteur suivante ; glisser vers le haut ou le bas : agrandir ou réduire. */}
      <button
        type="button"
        aria-label={t.sheetToggle}
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.moved || Math.abs(e.clientY - d.y) < SWIPE_PX) return;
          d.moved = true;
          step(e.clientY < d.y ? 1 : -1);
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) setState(next[state]);
          drag.current = null;
        }}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            step(e.key === 'ArrowUp' ? 1 : -1);
          }
        }}
        onClick={(e) => {
          // Clavier (Entrée, Espace) : le toucher est déjà traité par les événements de pointeur.
          if (e.detail === 0) setState(next[state]);
        }}
        className="flex h-touch-min shrink-0 touch-none items-center justify-center"
      >
        <span className="h-1 w-9 rounded-full bg-ink/60" />
      </button>
      <div className="shrink-0 px-s1">
        <Segmented<Tab>
          label={t.elements}
          hideLabel
          value={tab}
          onChange={(v) => {
            setTab(v);
            if (state === 'peek') setState('mid');
          }}
          options={[
            { value: 'garment', label: t.garment },
            { value: 'elements', label: t.elements },
            { value: 'properties', label: t.properties },
          ]}
        />
      </div>
      {/* `key` : chaque onglet repart du haut, au lieu de garder le défilement du précédent. */}
      <div key={tab} className="mt-s1 flex-1 overflow-y-auto px-s1 pb-safe">
        {tab === 'garment' && <GarmentPanel />}
        {tab === 'elements' && (
          <div className="space-y-s3">
            <LayersPanel onSelect={() => setTab('properties')} />
            <AtelierNotes />
          </div>
        )}
        {tab === 'properties' && <PropertiesPanel />}
        {tab === 'properties' && <div className="mt-s3"><AtelierNotes /></div>}
      </div>
    </section>
  );
}

export default function EditorScreen() {
  const id = useSearchParams().get('id');
  const design = useDesign((s) => s.design);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [exporting, setExporting] = useState(false);
  const [sheet, setSheet] = useState<SheetState>('mid');
  const desktop = useIsDesktop();
  useAutosave();
  useShortcuts();

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = id ? await getDesign(id).catch(() => undefined) : undefined;
      if (!alive) return;
      if (!d) return setState('missing');
      const metas = await getAssetMetas(d.elements.flatMap((e) => (e.kind === 'image' ? [e.asset_id] : [])));
      if (!alive) return;
      loadDesign(d, metas);
      setState('ready');
    })();
    return () => {
      alive = false;
      unloadDesign();
    };
  }, [id]);

  if (state === 'missing') {
    return (
      <main className="grid min-h-dvh place-items-center p-s1 text-center">
        <div>
          <p className="mb-s1">{t.notFound}</p>
          <Link href="/" className="underline">{t.backToList}</Link>
        </div>
      </main>
    );
  }
  if (state === 'loading' || !design) {
    return <PageLoader />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar onExport={() => setExporting(true)} />
      {desktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[var(--spacing-w-panel)_1fr_var(--spacing-w-panel)]">
          <aside className="overflow-y-auto border-r border-white/70 bg-white/45 p-s1 backdrop-blur-xl" aria-label={t.garment}>
            <div className="space-y-s5">
              <GarmentPanel />
              <LayersPanel />
            </div>
          </aside>
          <main className="relative min-w-0">
            <Scene />
            <SceneOverlay />
          </main>
          <aside className="space-y-s3 overflow-y-auto border-l border-white/70 bg-white/45 p-s1 backdrop-blur-xl" aria-label={t.properties}>
            <PropertiesPanel />
            <AtelierNotes />
          </aside>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div className={cx('absolute inset-x-0 top-0', SCENE_BOTTOM[sheet])}>
            <Scene />
            <SceneOverlay actions={<GlbButton place="overlay" />} />
          </div>
          <MobileSheet state={sheet} setState={setSheet} />
        </div>
      )}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}
