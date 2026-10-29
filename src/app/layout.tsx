import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fr } from '@/i18n/fr';
import { GlassDrops } from '@/features/editor/GlassDrops';
import { Toast } from '@/features/editor/Toast';
import { AuthListener } from '@/features/auth/session';
import { SyncListener } from '@/features/storage/SyncListener';
import { AvatarListener } from '@/features/auth/avatar';

export const metadata: Metadata = {
  title: { default: fr.appName, template: `%s · ${fr.appName}` },
  description: fr.appTagline,
  applicationName: fr.appName,
  // iPhone : nom sous l'icône quand l'app est ajoutée à l'écran d'accueil (l'icône vient de app/apple-icon.png).
  appleWebApp: { capable: true, title: fr.appShortName, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Le contenu va jusqu'aux bords de l'écran ; les zones fixes réservent elles-mêmes la barre d'accueil (env(safe-area-inset-*)).
  viewportFit: 'cover',
  themeColor: '#eef0f1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">
        {children}
        <GlassDrops />
        <Toast />
        <AuthListener />
        <SyncListener />
        <AvatarListener />
      </body>
    </html>
  );
}
