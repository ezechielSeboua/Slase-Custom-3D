import { PageLoader } from '@/features/editor/ui';
import { fr } from '@/i18n/fr';

export default function Loading() {
  return <PageLoader label={fr.common.loading} />;
}
