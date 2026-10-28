import type { MetadataRoute } from 'next';
import { fr } from '@/i18n/fr';

// Android : nom et icône quand l'app est ajoutée à l'écran d'accueil.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: fr.appName,
    short_name: fr.appShortName,
    description: fr.appTagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#eef0f1',
    theme_color: '#14171b',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
