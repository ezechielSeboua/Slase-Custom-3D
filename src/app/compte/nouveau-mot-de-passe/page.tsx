import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewPasswordScreen } from '@/features/auth/AuthScreens';
import { PageLoader } from '@/features/editor/ui';

export const metadata: Metadata = { title: 'Nouveau mot de passe' };

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <NewPasswordScreen />
    </Suspense>
  );
}
