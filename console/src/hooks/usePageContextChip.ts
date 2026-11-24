import { useCallback, useState } from 'react';

import { useCurrentPage } from '@/hooks/useCurrentPage';
import type { PageContext } from '@/lib/page-context';

/**
 * The page the user has open, attached to Ask AI messages until they remove
 * it. Removing holds for this page only: any navigation attaches the new
 * page again.
 */
export function usePageContextChip() {
  const page = useCurrentPage();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const pathname = page?.path ?? null;

  const dismiss = useCallback(() => setDismissedFor(pathname), [pathname]);

  return {
    /** The page to attach, or null when there is none or it was removed */
    context: page && dismissedFor !== page.path ? (page satisfies PageContext) : null,
    dismiss,
  };
}
