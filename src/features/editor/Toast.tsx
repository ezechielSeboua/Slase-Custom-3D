'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

const DURATION_MS = 4000;
const DURATION_WITH_ACTION_MS = 6000;

interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastState {
  message: string | null;
  nonce: number;
  action?: ToastAction;
  onExpire?: () => void;
}

const useToast = create<ToastState>(() => ({ message: null, nonce: 0 }));

/**
 * Affiche un message bref en bas de l'écran (une seule notification à la fois).
 * `action` ajoute un bouton (ex. « Annuler ») ; `onExpire` s'exécute si la notification disparaît sans action.
 */
export function showToast(message: string, opts: { action?: ToastAction; onExpire?: () => void } = {}) {
  // Une notification remplacée compte comme expirée : son effet différé doit s'appliquer.
  useToast.getState().onExpire?.();
  useToast.setState((s) => ({ message, nonce: s.nonce + 1, action: opts.action, onExpire: opts.onExpire }));
}

export function Toast() {
  const { message, nonce, action } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(
      () => {
        const { onExpire } = useToast.getState();
        useToast.setState({ message: null, action: undefined, onExpire: undefined });
        onExpire?.();
      },
      action ? DURATION_WITH_ACTION_MS : DURATION_MS,
    );
    return () => clearTimeout(t);
  }, [message, nonce, action]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-60 mb-safe flex justify-center px-s1 desk:bottom-s5">
      {message && (
        <div key={nonce} role="status" className="glass toast-in pointer-events-auto flex max-w-md items-center gap-s4 rounded-r1 px-s3 py-s2 text-sm font-medium">
          <span className="py-s2 text-center">{message}</span>
          {action && (
            <button
              type="button"
              className="glass-press min-h-touch-min shrink-0 rounded-r-ctl px-s2 font-semibold underline"
              onClick={() => {
                useToast.setState({ message: null, action: undefined, onExpire: undefined });
                action.onAction();
              }}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
