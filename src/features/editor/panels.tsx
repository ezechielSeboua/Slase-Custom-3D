'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DesignElement, TextAlign, ZoneId } from '@/types/design';
import {
  colorById, colors, colorsProvisional, FIT_IDS, fontById, fonts, GARMENT_IDS, isComingSoon, isGarmentAvailable, isSleeve,
  resolveZone, ZONE_IDS,
} from '@/lib/config';
import { elementAspect, elementHeightCm, MIN_WIDTH_CM } from '@/lib/units';
import { getWarnings, severityOf } from '@/lib/quality';
import { placementById, placementCenter, placementsFor, placementsProvisional, type Placement } from '@/lib/placements';
import { elementPointCm } from '@/features/scene/mapping';
import {
  addImage, addText, applyPlacement, deleteElement, duplicateElement, moveLayer, registerAsset, renameElement, reorderInZone,
  select, setColor, setFit, setGarment, toggleHidden, updateElement, useDesign,
} from '@/store/design';
import { requestView, useScene, VIEW_ZONE, ZONE_VIEW } from '@/features/scene/sceneStore';
import { getAsset } from '@/features/storage/db';
import { showToast } from '@/features/editor/Toast';
import { IMAGE_ACCEPT, importImageFile, UnsupportedFileError } from '@/features/editor/importImage';
import { Icon, type IconName } from '@/features/editor/icons';
import {
  ActionSheet, cx, IconButton, menuItemClass, menuSurfaceClass, NumberField, Segmented, Swatch, WarningItem,
} from '@/features/editor/ui';
import { useIsDesktop } from '@/lib/useMedia';
import { fr } from '@/i18n/fr';

const t = fr.editor;

const SectionTitle = ({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) => (
  <div className="flex min-h-touch-min items-center justify-between gap-s2">
    <h2 className="text-sm font-semibold tracking-wide uppercase">{children}</h2>
    {aside}
  </div>
);

const GroupLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-s2 text-xs font-semibold tracking-wide text-muted uppercase">{children}</div>
);

/** Nom affiché d'un calque : nom choisi, sinon le fichier sans extension, sinon la première ligne du texte. */
export function elementLabel(el: DesignElement): string {
  if (el.name) return el.name;
  if (el.kind === 'image') return el.asset.replace(/\.[a-z0-9]+$/i, '');
  return el.text.split('\n')[0] || t.kindText;
}

// ---------- Miniatures ----------
const assetUrls = new Map<string, Promise<string | null>>();

/** URL d'une image importée, gardée le temps de la session (une seule par image). */
function useAssetUrl(assetId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let alive = true;
    if (!assetUrls.has(assetId)) assetUrls.set(assetId, getAsset(assetId).then((a) => (a ? URL.createObjectURL(a.blob) : null)));
    assetUrls.get(assetId)!.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [assetId]);
  return url;
}

/** Vignette d'un calque : l'image sur damier (on voit sa transparence), ou le texte dans sa police sur la couleur du tissu. */
function LayerThumb({ el, size = 40 }: { el: DesignElement; size?: number }) {
  const design = useDesign((s) => s.design)!;
  const url = useAssetUrl(el.kind === 'image' ? el.asset_id : undefined);
  const style = { width: size, height: size };
  if (el.kind === 'image') {
    return (
      <span className="checker grid shrink-0 place-items-center overflow-hidden rounded-r-ctl border border-line" style={style} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-r-ctl border border-line text-base leading-none"
      style={{ ...style, background: colorById(design.color)?.hex ?? '#fff', color: el.color, fontFamily: fontById(el.font).family, fontWeight: el.weight }}
      aria-hidden="true"
    >
      {el.text.trim().slice(0, 2) || 'T'}
    </span>
  );
}

// ---------- Vêtement ----------
export function GarmentPanel() {
  const design = useDesign((s) => s.design)!;
  return (
    <div className="space-y-s3">
      <SectionTitle>{t.garment}</SectionTitle>
      <Segmented
        label={t.type}
        value={design.garment}
        onChange={(g) => (isComingSoon(g) && g !== design.garment ? showToast(fr.comingSoonMessage(fr.garments[g])) : setGarment(g))}
        options={GARMENT_IDS.map((g) => ({
          value: g,
          label: isComingSoon(g) ? `${fr.garments[g]} · ${fr.comingSoonShort}` : fr.garments[g],
          disabled: !isGarmentAvailable(g, design.fit),
        }))}
      />
      <Segmented
        label={t.fit}
        value={design.fit}
        onChange={setFit}
        options={FIT_IDS.map((f) => ({ value: f, label: fr.fits[f], disabled: !isGarmentAvailable(design.garment, f) }))}
      />
      <div>
        <div className="mb-s2 text-xs font-semibold tracking-wide text-muted uppercase" id="color-label">
          {t.color} · <span className="normal-case">{colors.find((c) => c.id === design.color)?.name ?? t.unknownColor}</span>
          {/* « provisoire » suffit à l'utilisateur ; le [TBD] reste dans config/ et sur la fiche de l'atelier. */}
          {colorsProvisional && <span className="ml-1 normal-case">({fr.provisional})</span>}
        </div>
        <div role="radiogroup" aria-labelledby="color-label" className="flex flex-wrap gap-s4">
          {colors.map((c) => (
            <Swatch key={c.id} hex={c.hex} name={c.name} selected={c.id === design.color} onSelect={() => setColor(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Ajouter ----------
/** Import d'image dans la zone regardée, partagé par les tuiles, les boutons et le glisser-déposer. */
function useAddImage(onAdded?: () => void) {
  const view = useScene((s) => s.view.id);
  const [error, setError] = useState<string | null>(null);
  const zone: ZoneId = VIEW_ZONE[view];
  const addFile = async (file: File) => {
    setError(null);
    try {
      const meta = await importImageFile(file);
      registerAsset(meta);
      addImage(meta, zone);
      onAdded?.();
    } catch (e) {
      setError(e instanceof UnsupportedFileError ? t.fileRefused : t.fileError);
    }
  };
  const addNewText = () => {
    addText(zone);
    onAdded?.();
  };
  return { zone, error, addFile, addNewText };
}

function HiddenFileInput({ inputRef, onFile }: { inputRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={IMAGE_ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );
}

function AddTile({ icon, label, help, onClick }: { icon: IconName; label: string; help: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass glass-press flex flex-col items-start gap-s2 rounded-r1 p-s1 text-left">
      <Icon name={icon} size={24} />
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-muted">{help}</span>
    </button>
  );
}

/** Grandes tuiles « Image » et « Texte » + zone de dépôt ; affiché quand rien n'est sélectionné. */
export function AddPanel({ onAdded }: { onAdded?: () => void }) {
  const { zone, error, addFile, addNewText } = useAddImage(onAdded);
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const openPicker = () => fileRef.current?.click();
  return (
    <div className="space-y-s1">
      <SectionTitle>{t.addTitle}</SectionTitle>
      <p className="text-xs text-muted">{t.addInZone(fr.zones[zone].toLowerCase())}</p>
      <div className="grid grid-cols-2 gap-s4">
        <AddTile icon="image" label={t.kindImage} help={t.imageHelp} onClick={openPicker} />
        <AddTile icon="text" label={t.kindText} help={t.textHelp} onClick={addNewText} />
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) addFile(f);
        }}
        className={cx(
          'flex flex-col items-center gap-s2 rounded-r1 border-[1.5px] border-dashed p-s3 text-center text-sm text-muted transition-colors',
          over ? 'border-ink bg-white/60 text-ink' : 'border-line',
        )}
      >
        <Icon name="upload" size={22} />
        <span>{t.dropHere}</span>
        <span className="text-xs">{t.pngHint}</span>
      </div>
      {error && <WarningItem>{error}</WarningItem>}
      <HiddenFileInput inputRef={fileRef} onFile={addFile} />
    </div>
  );
}

// ---------- Calques ----------
const ROW_STEP = 60; // hauteur d'une ligne (H_ROW 56) + écart

function LayerMenu({ el, first, last, onRename }: { el: DesignElement; first: boolean; last: boolean; onRename: () => void }) {
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  const item = (icon: IconName, label: string, fn: () => void, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cx(menuItemClass, 'disabled:opacity-40')}
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      <Icon name={icon} size={desktop ? 18 : 20} />
      {label}
    </button>
  );
  const items = (
    <>
      {item('pencil', fr.common.rename, onRename)}
      {item('arrowUp', t.moveUp, () => moveLayer(el.id, 1), first)}
      {item('arrowDown', t.moveDown, () => moveLayer(el.id, -1), last)}
      {item('copy', fr.common.duplicate, () => duplicateElement(el.id))}
      {item('trash', fr.common.delete, () => deleteElement(el.id))}
    </>
  );
  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Ordinateur seulement : la feuille mobile est hors de ce conteneur et prend le focus en s'ouvrant.
        if (desktop && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <IconButton label={fr.common.more} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </IconButton>
      {open && desktop && (
        <div role="menu" className={cx('absolute right-0 z-30 mt-1 w-48', menuSurfaceClass)}>
          {items}
        </div>
      )}
      {/* Mobile : feuille d'actions hors du panneau (qui défile et couperait une liste déroulante). */}
      {open && !desktop && (
        <ActionSheet title={elementLabel(el)} onClose={() => setOpen(false)}>
          {items}
        </ActionSheet>
      )}
    </div>
  );
}

function LayerRow({
  el, index, count, selected, issues, onSelect, drag, onDragStart,
}: {
  el: DesignElement;
  index: number;
  count: number;
  selected: boolean;
  issues: number;
  onSelect?: () => void;
  drag: { id: string; offset: number } | null;
  onDragStart: (e: React.PointerEvent, id: string, index: number) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const dragging = drag?.id === el.id;
  return (
    <li
      className={cx(
        'relative flex h-h-row items-center gap-1 rounded-r-ctl pr-1',
        selected ? 'glass outline-2 outline-select' : 'hover:bg-white/50',
        dragging && 'z-10 shadow-lg',
      )}
      style={dragging ? { transform: `translateY(${drag!.offset}px)` } : undefined}
    >
      {/* Poignée : glisser pour réordonner (souris et doigt), flèches haut / bas au clavier. */}
      <button
        type="button"
        aria-label={t.reorder}
        title={t.reorder}
        onPointerDown={(e) => onDragStart(e, el.id, index)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            moveLayer(el.id, e.key === 'ArrowUp' ? 1 : -1);
          }
        }}
        className="grid h-touch-min w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
        disabled={count < 2}
      >
        <Icon name="grip" size={16} />
      </button>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => {
          select(el.id);
          onSelect?.();
        }}
        onDoubleClick={() => setRenaming(true)}
        className={cx('flex min-w-0 flex-1 items-center gap-s2 self-stretch text-left', el.hidden && 'opacity-40')}
      >
        <span className="relative shrink-0">
          <LayerThumb el={el} />
          {issues > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-r-pill border border-warn/60 bg-warn-bg px-1 text-[10px] leading-none font-bold text-warn"
              title={t.issueCount(issues)}
            >
              <span aria-hidden="true">{issues}</span>
              <span className="sr-only">{t.issueCount(issues)}</span>
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              defaultValue={elementLabel(el)}
              aria-label={t.layerName}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                renameElement(el.id, e.target.value);
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="w-full rounded border border-ink bg-white px-1 text-base desk:text-sm"
            />
          ) : (
            <span className="block truncate text-sm font-medium">{elementLabel(el)}</span>
          )}
          <span className="block truncate text-xs text-muted">
            {issues > 0 && <Icon name="warning" size={12} className="mr-1 inline align-[-1px] text-warn" />}
            {placementById(el.placement)?.name ?? (el.kind === 'image' ? t.kindImage : t.kindText)}
          </span>
        </span>
      </button>
      <IconButton label={el.hidden ? t.show : t.hide} aria-pressed={!el.hidden} onClick={() => toggleHidden(el.id)}>
        <Icon name={el.hidden ? 'eyeOff' : 'eye'} size={18} />
      </IconButton>
      <LayerMenu el={el} first={index === 0} last={index === count - 1} onRename={() => setRenaming(true)} />
    </li>
  );
}

/** Calques groupés par zone, du premier plan vers l'arrière ; réordonnables à l'intérieur de leur zone. */
export function LayersPanel({ onSelect }: { onSelect?: () => void }) {
  const design = useDesign((s) => s.design)!;
  const selectedId = useDesign((s) => s.selectedId);
  const issues = usePrintIssueCount();
  const { addFile, addNewText, error } = useAddImage(onSelect);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState<{ id: string; offset: number; index: number; count: number } | null>(null);

  const groups = ZONE_IDS.map((zone) => ({ zone, items: design.elements.filter((e) => e.zone === zone).reverse() })).filter((g) => g.items.length);

  const onDragStart = (e: React.PointerEvent, id: string, index: number) => {
    const count = design.elements.filter((x) => x.zone === design.elements.find((y) => y.id === id)?.zone).length;
    if (count < 2) return;
    e.preventDefault();
    const startY = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setDrag({ id, offset: 0, index, count });
    const move = (ev: PointerEvent) => {
      const max = (count - 1 - index) * ROW_STEP, min = -index * ROW_STEP;
      setDrag({ id, offset: Math.max(min, Math.min(max, ev.clientY - startY)), index, count });
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setDrag(null);
      const to = index + Math.round((ev.clientY - startY) / ROW_STEP);
      if (to !== index) reorderInZone(id, to);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <div className="space-y-s2">
      <SectionTitle
        aside={
          <span className="flex gap-1">
            <IconButton variant="outline" label={t.addImageLabel} onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={18} />
            </IconButton>
            <IconButton variant="outline" label={t.addTextLabel} onClick={addNewText}>
              <Icon name="text" size={18} />
            </IconButton>
          </span>
        }
      >
        {t.layers}
        {design.elements.length > 0 && <span className="ml-s2 font-normal text-muted">{design.elements.length}</span>}
      </SectionTitle>
      <HiddenFileInput inputRef={fileRef} onFile={addFile} />
      {error && <WarningItem>{error}</WarningItem>}
      {groups.length === 0 ? (
        <p className="text-sm text-muted">{t.noElements}</p>
      ) : (
        groups.map((g) => (
          <section key={g.zone} aria-label={fr.zones[g.zone]}>
            <div className="mb-1 flex items-center gap-s2 text-xs font-semibold tracking-wide text-muted uppercase">
              {fr.zones[g.zone]}
              <span className="h-px flex-1 bg-line" />
            </div>
            <ul className="space-y-1">
              {g.items.map((el, i) => (
                <LayerRow
                  key={el.id}
                  el={el}
                  index={i}
                  count={g.items.length}
                  selected={el.id === selectedId}
                  issues={issues[el.id] ?? 0}
                  onSelect={onSelect}
                  drag={drag}
                  onDragStart={onDragStart}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

// ---------- Avertissements ----------
function useWarnings() {
  const design = useDesign((s) => s.design)!;
  const assets = useDesign((s) => s.assets);
  return useMemo(() => getWarnings(design, assets), [design, assets]);
}

/** Avertissements d'un élément, ou de toute la création (fenêtre d'export) ; les problèmes d'impression d'abord. */
export function WarningsList({ elementId }: { elementId?: string }) {
  const design = useDesign((s) => s.design)!;
  const warnings = useWarnings();
  const shown = (elementId ? warnings.filter((w) => w.elementId === elementId) : warnings)
    .slice()
    .sort((a, b) => Number(severityOf(a) === 'info') - Number(severityOf(b) === 'info'));
  if (!shown.length) return null;
  return (
    <ul className="space-y-s2" aria-live="polite">
      {shown.map((w, i) => {
        const el = design.elements.find((e) => e.id === w.elementId);
        return (
          <li key={i}>
            <WarningItem
              tone={severityOf(w) === 'print' ? 'warn' : 'info'}
              action={
                (w.kind === 'resolution' || w.kind === 'placement') && w.suggestedWidth && el ? (
                  <button type="button" className="min-h-touch-min text-left underline" onClick={() => updateElement(el.id, { width_cm: w.suggestedWidth })}>
                    {fr.warnings.reduce}
                  </button>
                ) : undefined
              }
            >
              {!elementId && el && <strong className="font-semibold">{elementLabel(el)} · </strong>}
              {w.message}
            </WarningItem>
          </li>
        );
      })}
    </ul>
  );
}

/** Nombre de problèmes d'impression par élément, pour le badge des calques. */
function usePrintIssueCount(): Record<string, number> {
  const warnings = useWarnings();
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of warnings) if (w.elementId && severityOf(w) === 'print') out[w.elementId] = (out[w.elementId] ?? 0) + 1;
    return out;
  }, [warnings]);
}

/**
 * Tous les points « à confirmer avec l'atelier » en une seule ligne repliable.
 * Un même rappel concernant plusieurs éléments (police provisoire) n'apparaît qu'une fois.
 */
export function AtelierNotes() {
  const warnings = useWarnings();
  const messages = [...new Set(warnings.filter((w) => severityOf(w) === 'info').map((w) => w.message))];
  if (!messages.length) return null;
  return (
    <details className="group glass rounded-r1 text-sm">
      <summary className="flex min-h-touch-min cursor-pointer list-none items-center gap-s2 px-s4 text-muted [&::-webkit-details-marker]:hidden">
        <Icon name="info" size={18} />
        <span className="flex-1">{t.atelierNotes(messages.length)}</span>
        <Icon name="chevronDown" size={18} className="transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-s2 px-s4 pb-s4 text-muted">
        {messages.map((m) => (
          <li key={m} className="flex gap-s2">
            <span aria-hidden="true">·</span>
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------- Emplacements : choix sur un plan du vêtement ----------
const PAD_CM = 3;

/** Petit plan d'une zone (devant, dos ou manche) avec ses emplacements cliquables, à l'échelle. */
function ZonePlan({ zone, el, current }: { zone: ZoneId; el: DesignElement; current?: Placement }) {
  const design = useDesign((s) => s.design)!;
  const z = resolveZone(design.garment, design.fit, zone);
  // Les grands emplacements d'abord : les petits sont dessinés par-dessus et restent cliquables.
  const list = placementsFor(design.garment, zone).sort((a, b) => b.width_cm - a.width_cm);
  if (!list.length) return null;
  const sleeve = isSleeve(zone);
  const top = sleeve ? 0 : -4; // espace pour le col au-dessus du bas du col
  const vb = `${-z.width / 2 - PAD_CM} ${top - PAD_CM} ${z.width + PAD_CM * 2} ${z.top + z.height - top + PAD_CM * 2}`;
  const aspect = elementAspect(el);
  const pick = (p: Placement) => {
    applyPlacement(el.id, p.id);
    requestView(ZONE_VIEW[p.zone]);
  };
  return (
    <figure className="glass flex flex-col items-center gap-1 rounded-r1 p-s2 max-desk:w-32 max-desk:shrink-0 max-desk:snap-start">
      <svg viewBox={vb} className={cx('w-full', sleeve ? 'h-24 desk:h-28' : 'h-28 desk:h-32')} role="group" aria-label={fr.zones[zone]}>
        {/* Silhouette de la zone : corps (ou manche) à l'échelle, avec le col pour le devant et le dos. */}
        <rect
          x={-z.width / 2}
          y={sleeve ? z.top : top}
          width={z.width}
          height={z.top + z.height - (sleeve ? z.top : top)}
          rx={sleeve ? 3 : 4}
          className="fill-white/70 stroke-ink/40"
          strokeWidth={0.4}
        />
        {!sleeve && <path d={zone === 'front' ? `M-7,${top} Q0,4 7,${top}` : `M-7,${top} Q0,-1 7,${top}`} className="fill-none stroke-ink/40" strokeWidth={0.4} />}
        {list.map((p) => {
          const probe = { ...el, zone, width_cm: p.width_cm, rotation_deg: p.rotation_deg ?? 0 } as DesignElement;
          const c = placementCenter(p, probe, design.garment, design.fit);
          const w = p.width_cm, h = w / aspect;
          const pts = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
            .map(([a, b]) => elementPointCm(c.x, c.y, p.rotation_deg ?? 0, (a * w) / 2, (b * h) / 2))
            .map((q) => `${q.x},${q.y}`)
            .join(' ');
          const on = current?.id === p.id;
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={p.name}
              aria-pressed={on}
              onClick={() => pick(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(p);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>polygon]:stroke-ink [&:focus-visible>polygon]:stroke-[0.8]"
            >
              <title>{p.name}</title>
              <polygon
                points={pts}
                // Choisi : semi-transparent, pour laisser voir les petits emplacements posés par-dessus.
                className={on ? 'fill-select/60 stroke-select-strong' : 'fill-white/70 stroke-ink/60 hover:fill-ink/20'}
                strokeWidth={on ? 0.6 : 0.35}
                strokeDasharray={on ? undefined : '1 0.6'}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-muted">{fr.zonesShort[zone]}</figcaption>
    </figure>
  );
}

function PlacementPicker({ el }: { el: DesignElement }) {
  const current = placementById(el.placement);
  return (
    <div>
      <div className="mb-s2 flex items-center justify-between gap-s2">
        <GroupLabel>{t.placement}</GroupLabel>
        <button
          type="button"
          onClick={() => applyPlacement(el.id, null)}
          aria-pressed={!current}
          className={cx('glass-press min-h-8 rounded-r-pill px-s4 text-xs max-desk:min-h-touch-min', !current ? 'glass font-semibold' : 'text-muted hover:text-ink')}
        >
          {t.placementFree}
        </button>
      </div>
      {/* Mobile : une rangée qui défile, pour garder la police et la couleur à portée sans long défilement. */}
      <div className="-mx-s1 flex snap-x scroll-px-s1 gap-s2 overflow-x-auto px-s1 pb-1 desk:mx-0 desk:grid desk:grid-cols-2 desk:overflow-visible desk:px-0 desk:pb-0">
        {ZONE_IDS.map((z) => (
          <ZonePlan key={z} zone={z} el={el} current={current} />
        ))}
      </div>
      <p className="mt-s2 text-xs text-muted">
        {current ? (
          <>
            <strong className="font-semibold text-ink">{current.name}</strong> · {t.placementMax(current.max_width_cm)}
          </>
        ) : (
          t.placementPick
        )}
        {placementsProvisional && <span className="block">{t.placementHint}</span>}
      </p>
    </div>
  );
}

// ---------- Inspecteur ----------
const ROTATION_PRESETS = [-90, 0, 90];

export function PropertiesPanel({ onAdded }: { onAdded?: () => void }) {
  const design = useDesign((s) => s.design)!;
  const selectedId = useDesign((s) => s.selectedId);
  const el = design.elements.find((e) => e.id === selectedId);
  if (!el) return <AddPanel onAdded={onAdded} />;
  const set = (patch: Partial<DesignElement>, key?: string) => updateElement(el.id, patch, key);
  const h = elementHeightCm(el);
  const sleeve = isSleeve(el.zone);
  const quickColors = [...new Set(['#000000', '#ffffff', ...colors.map((c) => c.hex)])];
  return (
    <div className="space-y-s3">
      <div className="flex items-center gap-s2">
        <LayerThumb el={el} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{elementLabel(el)}</div>
          <div className="text-xs text-muted">
            {el.kind === 'image' ? t.kindImage : t.kindText} · {fr.zones[el.zone]}
          </div>
        </div>
        <IconButton label={t.deselect} onClick={() => select(null)}>
          <Icon name="close" size={18} />
        </IconButton>
      </div>

      <WarningsList elementId={el.id} />

      <PlacementPicker el={el} />

      <Segmented
        label={t.zone}
        value={el.zone}
        onChange={(zone) => {
          set({ zone });
          requestView(ZONE_VIEW[zone]);
        }}
        options={ZONE_IDS.map((z) => ({ value: z, label: fr.zonesShort[z] }))}
      />
      {sleeve && <p className="-mt-s2 text-xs text-muted">{fr.sideHint}</p>}

      <div>
        <GroupLabel>{t.position}</GroupLabel>
        <div className="grid grid-cols-2 gap-s4">
          <NumberField label={sleeve ? t.xSleeve : t.x} unit="cm" value={el.x_cm} onCommit={(v) => set({ x_cm: v })} />
          <NumberField label={sleeve ? t.ySleeve : t.y} unit="cm" value={el.y_cm} onCommit={(v) => set({ y_cm: v })} />
        </div>
      </div>

      <div>
        <GroupLabel>
          <span className="inline-flex items-center gap-1">
            {t.size}
            <span className="inline-flex items-center gap-0.5 font-normal normal-case tracking-normal" title={t.ratioLocked}>
              <Icon name="lock" size={12} /> {t.ratioLockedShort}
            </span>
          </span>
        </GroupLabel>
        <div className="grid grid-cols-2 gap-s4">
          <NumberField label={t.width} unit="cm" min={MIN_WIDTH_CM} value={el.width_cm} onCommit={(v) => set({ width_cm: v })} />
          <NumberField label={t.height} unit="cm" min={MIN_WIDTH_CM} value={h} onCommit={(v) => set({ width_cm: v * elementAspect(el) })} />
        </div>
      </div>

      <div>
        <GroupLabel>{t.rotation}</GroupLabel>
        <div className="flex items-center gap-s2">
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={el.rotation_deg}
            aria-label={t.rotation}
            onChange={(e) => set({ rotation_deg: Number(e.target.value) }, 'rotation')}
            className="h-touch-min min-w-0 flex-1 accent-select-strong"
          />
          <span className="w-12 text-right font-mono text-sm">{Math.round(el.rotation_deg)}°</span>
        </div>
        <div className="mt-s2 flex gap-s2">
          {ROTATION_PRESETS.map((deg) => (
            <button
              key={deg}
              type="button"
              aria-pressed={Math.round(el.rotation_deg) === deg}
              onClick={() => set({ rotation_deg: deg })}
              className={cx('glass glass-press min-h-touch-min flex-1 rounded-r-ctl text-sm', Math.round(el.rotation_deg) === deg && 'font-semibold outline-2 outline-select')}
            >
              {deg > 0 ? `+${deg}` : deg}°
            </button>
          ))}
        </div>
      </div>

      {el.kind === 'text' && (
        <div className="space-y-s3">
          <label className="block">
            <GroupLabel>{t.text}</GroupLabel>
            <textarea
              value={el.text}
              rows={2}
              onChange={(e) => set({ text: e.target.value }, 'text')}
              className="glass w-full rounded-r-ctl p-s2 text-base desk:text-sm"
            />
          </label>
          <div>
            <GroupLabel>{t.font}</GroupLabel>
            <div role="radiogroup" aria-label={t.font} className="grid gap-s2">
              {fonts.map((f) => {
                const on = f.id === el.font;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ font: f.id })}
                    className={cx('glass glass-press flex min-h-touch-min items-center justify-between gap-s2 rounded-r-ctl px-s4 text-left', on && 'outline-2 outline-select')}
                  >
                    <span className="truncate text-lg" style={{ fontFamily: f.family, fontWeight: el.weight }}>
                      {el.text.trim().split('\n')[0]?.slice(0, 18) || 'Aa'}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{f.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <GroupLabel>{t.textColor}</GroupLabel>
            <div className="flex flex-wrap items-center gap-s2">
              {quickColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  aria-pressed={el.color.toLowerCase() === hex.toLowerCase()}
                  onClick={() => set({ color: hex })}
                  className={cx('glass-press grid size-touch-min place-items-center rounded-full', el.color.toLowerCase() === hex.toLowerCase() && 'glass outline-2 outline-select')}
                >
                  <span className="size-7 rounded-full border border-ink/30" style={{ background: hex }} />
                </button>
              ))}
              <label className="glass glass-press flex min-h-touch-min items-center gap-s2 rounded-r-pill px-s4 text-sm" title={t.customColor}>
                <input type="color" value={el.color} onChange={(e) => set({ color: e.target.value }, 'color')} className="size-6 cursor-pointer" />
                <span className="font-mono">{el.color}</span>
              </label>
            </div>
          </div>
          <Segmented
            label={t.weight}
            value={el.weight}
            onChange={(weight) => set({ weight })}
            options={fontById(el.font).weights.map((w) => ({ value: w, label: t.weights[w] ?? String(w) }))}
          />
          <div>
            <GroupLabel>{t.align}</GroupLabel>
            <div role="radiogroup" aria-label={t.align} className="glass-track flex h-h-seg max-desk:h-[calc(var(--spacing-h-seg)+6px)] gap-1 rounded-r-ctl p-p-seg">
              {(['left', 'center', 'right'] as const).map((a: TextAlign) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={el.align === a}
                  aria-label={t.aligns[a]}
                  title={t.aligns[a]}
                  onClick={() => set({ align: a })}
                  className={cx('glass-press grid flex-1 place-items-center rounded-r-seg-in', el.align === a ? 'glass-thumb' : 'text-muted')}
                >
                  <Icon name={a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight'} size={18} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
