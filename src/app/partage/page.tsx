import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SharedScreen } from '@/features/storage/SharedScreen';
import { PageLoader } from '@/features/editor/ui';

// Un lien partagé est privé : il ne doit pas apparaître dans les moteurs de recherche.
export const metadata: Metadata = { title: 'Création partagée', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SharedScreen />
    </Suspense>
  );
}
