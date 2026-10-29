import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInScreen } from '@/features/auth/AuthScreens';
import { PageLoader } from '@/features/editor/ui';

export const metadata: Metadata = { title: 'Connexion' };

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SignInScreen />
    </Suspense>
  );
}
