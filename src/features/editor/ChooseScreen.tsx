'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Design, FitId, GarmentId } from '@/types/design';
import { colors, FIT_IDS, GARMENT_IDS, isComingSoon, isGarmentAvailable } from '@/lib/config';
import { putDesign } from '@/features/storage/db';
import { showToast } from '@/features/editor/Toast';
import { backLinkClass, Button, cx, Swatch } from '@/features/editor/ui';
import { Icon } from '@/features/editor/icons';
import { fr } from '@/i18n/fr';

const GarmentPreview = dynamic(() => import('@/features/scene/GarmentPreview'), { ssr: false });
const t = fr.choose;

function Card({ selected, disabled, onSelect, children, className }: {
  selected: boolean; disabled?: boolean; onSelect: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'glass glass-press relative rounded-r1 p-s4 text-left disabled:cursor-not-allowed disabled:opacity-40',
        selected && 'outline-2 outline-select',
        className,
      )}
    >
      {children}
      {selected && (
        <span className="absolute top-s2 right-s2 grid size-5 place-items-center rounded-full bg-select text-on-select" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        </span>
      )}
    </button>
  );
}

function Silhouette({ garment }: { garment: GarmentId }) {
  const d =
    garment === 'tshirt'
      ? 'M38,10 Q50,20 62,10 L80,16 L94,34 L84,42 L76,36 L76,90 L24,90 L24,36 L16,42 L6,34 L20,16 Z'
      : 'M40,10 Q50,18 60,10 L78,16 L96,80 L86,84 L76,40 L76,90 L24,90 L24,40 L14,84 L4,80 L22,16 Z';
  return (
    <svg viewBox="0 0 100 100" className="size-10 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <section className="space-y-s4">
    <h2 className="flex items-center gap-s2 font-semibold">
      <span className="glass grid size-7 place-items-center rounded-full text-xs">{n}</span>
      {title}
    </h2>
    {children}
  </section>
);

export default function ChooseScreen() {
  const router = useRouter();
  const [garment, setGarment] = useState<GarmentId>('tshirt');
  const [fit, setFit] = useState<FitId>('normal');
  const [color, setColor] = useState(colors[0]?.id ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const colorName = colors.find((c) => c.id === color)?.name ?? '';
  // Nom proposé tant que l'utilisateur n'en a pas saisi un : « Tee-shirt oversize noir ».
  const defaultName = `${fr.garments[garment]} ${fr.fitsInName[fit]} ${colorName.toLowerCase()}`.trim();
  const ready = isGarmentAvailable(garment, fit);

  const start = async () => {
    setBusy(true);
    const now = new Date().toISOString();
    const d: Design = {
      id: crypto.randomUUID(),
      name: name.trim() || defaultName,
      garment,
      fit,
      color,
      elements: [],
      created_at: now,
      updated_at: now,
    };
    try {
      await putDesign(d);
      router.push(`/editor?id=${d.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh pb-28 desk:pb-s5">
      <header className="flex h-h-topbar items-center gap-s2 border-b border-white/70 bg-white/55 px-safe backdrop-blur-xl">
        <Link href="/" aria-label={fr.common.back} title={fr.common.back} className={backLinkClass}>
          <Icon name="back" />
        </Link>
        <h1 className="font-semibold">{t.title}</h1>
      </header>

      <main className="mx-auto grid max-w-w-max gap-s3 px-s1 pt-s1 desk:grid-cols-[minmax(0,1fr)_420px] desk:gap-s5 desk:pt-s5">
        {/* Aperçu 3D : en haut sur mobile, colonne de gauche (collante) sur ordinateur. */}
        <div className="desk:sticky desk:top-s5 desk:self-start">
          <div className="glass relative overflow-hidden rounded-r1">
            <GarmentPreview
              garment={garment}
              fit={fit}
              color={color}
              label={t.previewLabel(defaultName)}
              className="h-72 w-full desk:h-[min(640px,calc(100dvh-160px))]"
            />
            <p className="pointer-events-none absolute inset-x-0 bottom-s2 text-center text-xs text-muted">{t.previewHint}</p>
          </div>
        </div>

        <div className="space-y-s3 desk:space-y-s5">
          <Step n={1} title={t.stepType}>
            <div role="radiogroup" aria-label={t.stepType} className="grid grid-cols-2 gap-s4">
              {GARMENT_IDS.map((g) => {
                const soon = isComingSoon(g);
                return (
                  <Card
                    key={g}
                    selected={garment === g}
                    disabled={!isGarmentAvailable(g)}
                    // Un vêtement « bientôt disponible » reste cliquable pour afficher le message, sans être sélectionné.
                    onSelect={() => (soon ? showToast(fr.comingSoonMessage(fr.garments[g])) : setGarment(g))}
                    className={cx('flex items-center gap-s4', soon && 'opacity-60')}
                  >
                    <Silhouette garment={g} />
                    <span className="min-w-0">
                      <span className="block font-medium">{fr.garments[g]}</span>
                      {soon && <span className="block text-xs text-muted">{fr.comingSoon}</span>}
                    </span>
                  </Card>
                );
              })}
            </div>
          </Step>

          <Step n={2} title={t.stepFit}>
            <div role="radiogroup" aria-label={t.stepFit} className="grid grid-cols-2 gap-s4">
              {FIT_IDS.map((f) => (
                <Card key={f} selected={fit === f} disabled={!isGarmentAvailable(garment, f)} onSelect={() => setFit(f)}>
                  <span className="block font-medium">{fr.fits[f]}</span>
                  <span className="block text-sm text-muted">{fr.fitDescriptions[f]}</span>
                </Card>
              ))}
            </div>
          </Step>

          <Step n={3} title={t.stepColor}>
            <div role="radiogroup" aria-label={t.stepColor} className="flex flex-wrap items-center gap-s4">
              {colors.map((c) => (
                <Swatch key={c.id} hex={c.hex} name={c.name} selected={c.id === color} onSelect={() => setColor(c.id)} />
              ))}
              <span className="text-sm text-muted">{colorName}</span>
            </div>
            <p className="text-xs text-muted">{t.colorLater}</p>
          </Step>

          <Step n={4} title={t.stepName}>
            <label className="block">
              <span className="sr-only">{t.stepName}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultName}
                className="glass h-h-field w-full rounded-r-ctl px-s4 text-base desk:text-sm"
              />
            </label>
            <p className="text-xs text-muted">{t.nameHint}</p>
          </Step>

          <div className="fixed inset-x-0 bottom-0 border-t border-white/70 bg-white/55 p-s1 pb-safe px-safe backdrop-blur-xl desk:static desk:border-0 desk:bg-transparent desk:p-0">
            <Button variant="primary" className="w-full" disabled={!ready || busy} busy={busy} onClick={start}>
              {t.start}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
