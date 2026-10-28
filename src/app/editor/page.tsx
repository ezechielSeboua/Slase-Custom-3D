import { Suspense } from 'react';
import EditorScreen from '@/features/editor/EditorScreen';
import { PageLoader } from '@/features/editor/ui';
import { fr } from '@/i18n/fr';

export default function Page() {
  return (
    <Suspense fallback={<PageLoader label={fr.common.loading} />}>
      <EditorScreen />
    </Suspense>
  );
}
