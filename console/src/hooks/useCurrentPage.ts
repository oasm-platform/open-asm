import { useLocation, useMatches } from '@tanstack/react-router';
import { useMemo } from 'react';

import { usePageTitleOverride } from '@/hooks/useDocumentTitle';
import { normalizeRoutePattern, routeLabel, tabLabel } from '@/lib/route-labels';

export interface CurrentPage {
  /** Route pattern with `:param` segments, e.g. `/targets/:id/:tab` */
  route: string;
  /** The URL path that is open */
  path: string;
  params: Record<string, string>;
  /** The page's name: the title the page set (plus its tab), else its route's name */
  title: string;
}

/** The page the user has open, named for the document title and Ask AI. */
export function useCurrentPage(): CurrentPage | null {
  // The deepest match is the page itself; its params include its parents'.
  // Selected as strings, so callers re-render only when they change.
  const fullPath = useMatches({
    select: (matches) => (matches.at(-1)?.fullPath as string | undefined) ?? null,
  });
  const paramsJson = useMatches({
    select: (matches) => JSON.stringify(matches.at(-1)?.params ?? {}),
  });
  const pathname = useLocation({ select: (location) => location.pathname });
  const override = usePageTitleOverride();

  return useMemo(() => {
    if (fullPath === null) return null;
    const route = normalizeRoutePattern(fullPath);
    const params = Object.fromEntries(
      Object.entries(JSON.parse(paramsJson) as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    // A page names its item; the open tab is added here, so it follows
    // tab switches without each page doing it
    const tab = route.endsWith('/:tab') ? tabLabel(params.tab) : null;
    const title = !override
      ? routeLabel(route, params)
      : tab && !override.endsWith(tab)
        ? `${override} · ${tab}`
        : override;
    return { route, path: pathname, params, title };
  }, [fullPath, paramsJson, pathname, override]);
}
