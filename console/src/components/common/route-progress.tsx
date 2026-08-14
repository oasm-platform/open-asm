import { useEffect, useRef, useState } from 'react';
import { router } from '@/router';
import '@/styles/route-progress.css';

// Min-visible duration: fast/cached navigations still show a brief
// non-blinking bar (the CSS already fades opacity over 0.2s).
const MIN_VISIBLE_MS = 200;

export function RouteProgress() {
  const [isActive, setIsActive] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Show the bar during the initial router load too.
    if (router.state.status === 'pending') setIsActive(true);

    const unsubscribe = router.subscribe('onBeforeLoad', () => {
      // Clear the pending hide so a fast follow-up navigation doesn't blink.
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setIsActive(true);
    });

    return () => {
      unsubscribe();
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = router.subscribe('onLoad', () => {
      hideTimeoutRef.current = window.setTimeout(() => {
        hideTimeoutRef.current = null;
        setIsActive(false);
      }, MIN_VISIBLE_MS);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div
      className={`route-progress ${isActive ? 'active' : ''}`}
      role="progressbar"
      aria-hidden={!isActive}
    >
      <div className="route-progress-bar" />
    </div>
  );
}
