'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Design } from '@/types/design';
import { colorById } from '@/lib/config';
import { ChoiceMenu, type Choice } from '@/features/editor/ui';
import { Icon } from '@/features/editor/icons';
import { fr } from '@/i18n/fr';

const t = fr.list;

/** La section de recherche n'apparaît qu'à partir de ce nombre de créations. */
export const TOOLBAR_MIN_DESIGNS = 6;
const SORT_KEY = 'slase.list.sort';

export type SortId = 'recent' | 'oldest' | 'name';
export interface ListFilters {
  q: string;
  garment: string | null;
  fit: string | null;
  color: string | null;
  sort: SortId;
}

export const NO_FILTERS: ListFilters = { q: '', garment: null, fit: null, color: null, sort: 'recent' };

/** Minuscules sans accents : « Édition » se trouve en tapant « edition ». */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const hasFilters = (f: ListFilters) => Boolean(f.q.trim() || f.garment || f.fit || f.color);

/** Créations qui correspondent à la recherche (nom ou texte imprimé) et aux filtres, dans l'ordre choisi. */
export function applyFilters(designs: Design[], f: ListFilters): Design[] {
  const q = fold(f.q.trim());
  const out = designs.filter(
    (d) =>
      (!f.garment || d.garment === f.garment) &&
      (!f.fit || d.fit === f.fit) &&
      (!f.color || d.color === f.color) &&
      (!q || fold([d.name, ...d.elements.flatMap((e) => (e.kind === 'text' ? [e.text] : []))].join(' ')).includes(q)),
  );
  const by: Record<SortId, (a: Design, b: Design) => number> = {
    recent: (a, b) => b.updated_at.localeCompare(a.updated_at),
    oldest: (a, b) => a.updated_at.localeCompare(b.updated_at),
    name: (a, b) => (a.name || t.untitled).localeCompare(b.name || t.untitled, 'fr', { sensitivity: 'base' }),
  };
  return out.sort(by[f.sort]);
}

/** Tri choisi, gardé dans ce navigateur (la recherche, elle, repart à vide à chaque visite). */
export function useListFilters() {
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY) as SortId | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && saved in t.sorts) setFilters((f) => ({ ...f, sort: saved }));
    } catch {
      /* stockage indisponible : tri par défaut */
    }
  }, []);
  const update = (patch: Partial<ListFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    if (patch.sort) {
      try {
        localStorage.setItem(SORT_KEY, patch.sort);
      } catch {
        /* sans conséquence */
      }
    }
  };
  return { filters, update };
}

/** Valeurs présentes dans les créations ; un critère à une seule valeur ne sert à rien et n'est pas proposé. */
function present<T extends string>(designs: Design[], pick: (d: Design) => T, toChoice: (v: T) => Choice<T>): Choice<T>[] {
  const values = [...new Set(designs.map(pick))];
  return values.length > 1 ? values.map(toChoice) : [];
}

/** Recherche, filtres (vêtement, coupe, couleur) et tri, sous le titre « Mes créations ». Non fixe au défilement. */
export function ListToolbar({ designs, filters, update }: { designs: Design[]; filters: ListFilters; update: (p: Partial<ListFilters>) => void }) {
  const garments = useMemo(() => present(designs, (d) => d.garment, (v) => ({ value: v, label: fr.garments[v] })), [designs]);
  const fits = useMemo(() => present(designs, (d) => d.fit, (v) => ({ value: v, label: fr.fits[v] })), [designs]);
  const colors = useMemo(
    () => present(designs, (d) => d.color, (v) => ({ value: v, label: colorById(v)?.name ?? v, swatch: colorById(v)?.hex })),
    [designs],
  );
  const sorts = (Object.keys(t.sorts) as SortId[]).map((v) => ({ value: v, label: t.sorts[v] }));
  const filtered = Boolean(filters.garment || filters.fit || filters.color);

  return (
    <div className="mb-s1 space-y-s4 desk:mb-s3 desk:flex desk:items-center desk:gap-s4 desk:space-y-0" role="search">
      <label className="glass flex h-h-field items-center gap-s2 rounded-r-ctl px-s4 desk:w-80 desk:shrink-0">
        <Icon name="search" size={18} className="shrink-0 text-muted" />
        <span className="sr-only">{t.searchLabel}</span>
        <input
          type="search"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder={t.search}
          className="min-w-0 flex-1 bg-transparent text-base outline-none desk:text-sm"
        />
      </label>
      {/* Mobile : la rangée défile si les filtres ne tiennent pas */}
      <div className="-mx-s1 flex items-center gap-s2 overflow-x-auto px-s1 pb-1 desk:mx-0 desk:flex-1 desk:overflow-visible desk:px-0 desk:pb-0">
        {garments.length > 0 && (
          <ChoiceMenu label={t.filterGarment} value={filters.garment} options={garments} onChange={(v) => update({ garment: v })} onClear={() => update({ garment: null })} clearLabel={t.clearFilter} />
        )}
        {fits.length > 0 && (
          <ChoiceMenu label={t.filterFit} value={filters.fit} options={fits} onChange={(v) => update({ fit: v })} onClear={() => update({ fit: null })} clearLabel={t.clearFilter} />
        )}
        {colors.length > 0 && (
          <ChoiceMenu label={t.filterColor} value={filters.color} options={colors} onChange={(v) => update({ color: v })} onClear={() => update({ color: null })} clearLabel={t.clearFilter} />
        )}
        {filtered && (
          <button type="button" onClick={() => update({ garment: null, fit: null, color: null })} className="shrink-0 px-s2 text-sm whitespace-nowrap text-muted underline hover:text-ink">
            {t.clearAll}
          </button>
        )}
        <div className="ml-auto shrink-0">
          <ChoiceMenu label={t.sort} value={filters.sort} options={sorts} onChange={(v) => update({ sort: v })} icon="sort" compactLabel />
        </div>
      </div>
    </div>
  );
}
