import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountScreen } from '@/features/auth/AuthScreens';
import { PageLoader } from '@/features/editor/ui';

export const metadata: Metadata = { title: 'Mon compte' };

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AccountScreen />
    </Suspense>
  );
}
