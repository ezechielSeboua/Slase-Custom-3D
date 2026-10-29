import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordScreen } from '@/features/auth/AuthScreens';
import { PageLoader } from '@/features/editor/ui';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ForgotPasswordScreen />
    </Suspense>
  );
}
