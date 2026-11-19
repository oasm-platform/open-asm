import { useEffect } from 'react';

import { useCurrentPage } from '@/hooks/useCurrentPage';
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from '@/services/apis/gen/queries';

const DEFAULT_BRAND = 'OASM';

/**
 * Keeps `document.title` on `<page> | <brand>` for every route: the title
 * the page set (`Page` / `useDocumentTitle`), else the route's name. The
 * only writer of `document.title`.
 */
export function DocumentTitle() {
  const page = useCurrentPage();
  const { data: metadata } = useRootControllerGetMetadata({
    query: { queryKey: getRootControllerGetMetadataQueryKey() },
  });
  const brand = metadata?.name?.trim() || DEFAULT_BRAND;
  const pageTitle = page?.title;

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} | ${brand}` : brand;
  }, [pageTitle, brand]);

  return null;
}
