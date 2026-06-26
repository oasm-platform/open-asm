import { useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import '@/styles/route-progress.css';

export function RouteProgress() {
  const router = useRouter();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const unsubscribe = router.subscribe('onBeforeLoad', ({ toLocation, fromLocation }) => {
      if (toLocation.pathname.startsWith('/login') || toLocation.pathname.startsWith('/init-admin')) {
        return;
      }
      if (fromLocation && (fromLocation.pathname.startsWith('/login') || fromLocation.pathname.startsWith('/init-admin'))) {
        return;
      }
      setIsActive(true);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    const unsubscribe = router.subscribe('onLoad', () => {
      setIsActive(false);
    });

    return () => unsubscribe();
  }, [router]);

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
