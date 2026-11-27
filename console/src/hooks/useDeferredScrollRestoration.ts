import {
  useElementScrollRestoration,
  useLocation,
} from '@tanstack/react-router';
import { useEffect } from 'react';

// A page that never grows tall enough keeps the position the router reached
const RESTORE_TIMEOUT_MS = 5_000;
// Any of these means the user took over the scroll: stop moving the page
const USER_SCROLL_EVENTS = [
  'wheel',
  'touchstart',
  'keydown',
  'pointerdown',
] as const;

/**
 * Finishes the router's window scroll restoration on pages that render
 * before their data. The router restores once, right after the route
 * renders; a page still showing skeletons is too short then, so the scroll
 * stops at its bottom. This scrolls again once the page has grown tall
 * enough, unless the user scrolls first.
 */
export function useDeferredScrollRestoration() {
  // One key per history entry: back finds its own position, a new visit to
  // the same URL has none
  const entryKey = useLocation({
    select: (location) => location.state.__TSR_key ?? location.href,
  });
  const saved = useElementScrollRestoration({ getElement: () => window });
  const targetX = saved?.scrollX ?? 0;
  const targetY = saved?.scrollY ?? 0;

  useEffect(() => {
    if (targetY <= 0) return;

    const root = document.documentElement;
    const isRestored = () => Math.abs(window.scrollY - targetY) <= 1;
    const canReach = () => root.scrollHeight - window.innerHeight >= targetY;
    if (isRestored()) return;

    let isDone = false;
    const observer = new ResizeObserver(() => restore());
    const timeout = setTimeout(() => stop(), RESTORE_TIMEOUT_MS);

    function stop() {
      if (isDone) return;
      isDone = true;
      observer.disconnect();
      clearTimeout(timeout);
      USER_SCROLL_EVENTS.forEach((type) =>
        window.removeEventListener(type, stop, true),
      );
    }

    function restore() {
      if (isDone || !canReach()) return;
      window.scrollTo({ top: targetY, left: targetX, behavior: 'instant' });
      stop();
    }

    USER_SCROLL_EVENTS.forEach((type) =>
      window.addEventListener(type, stop, { capture: true, passive: true }),
    );
    observer.observe(document.body);
    restore();
    return stop;
  }, [entryKey, targetX, targetY]);
}
