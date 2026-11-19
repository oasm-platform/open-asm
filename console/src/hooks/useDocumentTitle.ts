import { useEffect, useSyncExternalStore } from 'react';

/**
 * The page titles set by the mounted pages, newest last: the newest one
 * names the page; without one the route's name does (`useCurrentPage`).
 */
let titles: readonly { title: string }[] = [];
const listeners = new Set<() => void>();

function setTitles(next: readonly { title: string }[]) {
  titles = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Names the page while the calling component is mounted, e.g. with the
 * item it shows (`example.com · Overview`). Empty = keep the route's name.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const trimmed = title?.trim();
    if (!trimmed) return;
    const entry = { title: trimmed };
    setTitles([...titles, entry]);
    return () => setTitles(titles.filter((t) => t !== entry));
  }, [title]);
}

/** The title the mounted page set, or null. */
export function usePageTitleOverride(): string | null {
  return useSyncExternalStore(subscribe, () => titles.at(-1)?.title ?? null);
}
