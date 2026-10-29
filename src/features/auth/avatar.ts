'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { loadImage } from '@/features/scene/textures';
import { useAuth } from '@/features/auth/session';

const BUCKET = 'designs';
/** Côté de la photo envoyée, en pixels. */
const AVATAR_PX = 256;
const AVATAR_QUALITY = 0.85;
/** Validité de l'adresse signée ; renouvelée à chaque connexion ou changement de photo. */
const URL_TTL_S = 3600;

const avatarPath = (uid: string) => `${uid}/profile/avatar.jpg`;

/** `custom` : photo envoyée par l'utilisateur ; sinon la photo Google, ou rien (l'initiale s'affiche). */
export const useAvatar = create<{ url: string | null; custom: boolean }>(() => ({ url: null, custom: false }));

/** Photo du compte Google, si le fournisseur en donne une. */
function providerPhoto(user: User): string | null {
  const m = user.user_metadata ?? {};
  const url = m.avatar_url ?? m.picture;
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

async function refresh(user: User) {
  const bucket = getSupabase()?.storage.from(BUCKET);
  if (!bucket) return;
  // On liste le dossier d'abord : demander l'adresse d'un fichier absent répond par une erreur.
  const { data: files } = await bucket.list(`${user.id}/profile`, { search: 'avatar.jpg', limit: 1 });
  const signed = files?.length ? await bucket.createSignedUrl(avatarPath(user.id), URL_TTL_S) : null;
  if (useAuth.getState().user?.id !== user.id) return;
  if (signed?.data?.signedUrl) useAvatar.setState({ url: signed.data.signedUrl, custom: true });
  else useAvatar.setState({ url: providerPhoto(user), custom: false });
}

/** Suit la photo du compte connecté ; monté une fois dans le layout. */
export function AvatarListener() {
  useEffect(() => {
    let uid: string | null = null;
    const apply = () => {
      const user = useAuth.getState().user;
      if ((user?.id ?? null) === uid) return;
      uid = user?.id ?? null;
      if (!user) return useAvatar.setState({ url: null, custom: false });
      // La photo Google s'affiche tout de suite ; la photo envoyée la remplace si elle existe.
      useAvatar.setState({ url: providerPhoto(user), custom: false });
      void refresh(user).catch(() => {});
    };
    apply();
    return useAuth.subscribe(apply);
  }, []);
  return null;
}

export class AvatarImageError extends Error {}

/** Recadre au centre en carré, réduit à AVATAR_PX et encode en JPEG. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url).catch(() => {
      throw new AvatarImageError();
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new AvatarImageError();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_PX;
    const ctx = canvas.getContext('2d')!;
    // Fond blanc : une image transparente (PNG, SVG) ne devient pas noire en JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new AvatarImageError())), 'image/jpeg', AVATAR_QUALITY),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadAvatar(file: File) {
  const user = useAuth.getState().user;
  const supabase = getSupabase();
  if (!user || !supabase) throw new Error('auth');
  const blob = await toSquareJpeg(file);
  const { error } = await supabase.storage.from(BUCKET).upload(avatarPath(user.id), blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  await refresh(user);
}

/** Retire la photo envoyée : la photo Google (ou l'initiale) revient. */
export async function removeAvatar() {
  const user = useAuth.getState().user;
  const supabase = getSupabase();
  if (!user || !supabase) throw new Error('auth');
  const { error } = await supabase.storage.from(BUCKET).remove([avatarPath(user.id)]);
  if (error) throw error;
  useAvatar.setState({ url: providerPhoto(user), custom: false });
}
