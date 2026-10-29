'use client';

import { useEffect } from 'react';

const DURATION_MS = 1100;

/**
 * Effet « goutte d'eau » sur tous les éléments en verre (.glass-press) :
 * deux ondes concentriques partent du point d'appui et l'élément se creuse puis rebondit.
 * Un seul écouteur pour toute l'app ; rien ne se passe avec « mouvement réduit ».
 */
export function GlassDrops() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onDown = (e: PointerEvent) => {
      if (reduced.matches || e.button > 0) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>('.glass-press');
      if (!el || el.matches(':disabled')) return;
      const r = el.getBoundingClientRect();
      const size = Math.hypot(r.width, r.height) * 2;
      for (const late of [false, true]) {
        const drop = document.createElement('span');
        drop.className = late ? 'drop drop-late' : 'drop';
        drop.style.left = `${e.clientX - r.left}px`;
        drop.style.top = `${e.clientY - r.top}px`;
        drop.style.width = drop.style.height = `${late ? size * 0.7 : size}px`;
        el.appendChild(drop);
        setTimeout(() => drop.remove(), DURATION_MS);
      }
      el.classList.remove('drop-wobble');
      // Relance l'animation même si l'élément vient d'être touché.
      void el.offsetWidth;
      el.classList.add('drop-wobble');
      setTimeout(() => el.classList.remove('drop-wobble'), DURATION_MS);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
