import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignUpScreen } from '@/features/auth/AuthScreens';
import { PageLoader } from '@/features/editor/ui';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SignUpScreen />
    </Suspense>
  );
}
