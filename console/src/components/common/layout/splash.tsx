import Logo from '@/components/ui/logo';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { JSX } from 'react/jsx-runtime';

interface SplashProps {
  children: JSX.Element;
}
export default function Splash({ children }: SplashProps) {
  const [failureCount, setFailureCount] = useState(0);
  const [showError, setShowError] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    data: metadata,
    isFetching,
    isError,
    refetch,
  } = useRootControllerGetMetadata({
    query: { retry: false, refetchOnWindowFocus: false },
  });

  useEffect(() => {
    if (isError && failureCount < 5) {
      timeoutRef.current = setTimeout(() => {
        setFailureCount((prev) => prev + 1);
        refetch();
      }, 1000);
    } else if (isError && failureCount >= 5) {
      setShowError(true);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isError, failureCount, refetch]);

  useEffect(() => {
    // Reset state on success
    if (!isError && !isFetching && failureCount > 0) {
      setFailureCount(0);
      setShowError(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
  }, [isError, isFetching, failureCount]);

  if (isFetching || (isError && !showError)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Logo width={64} height={64} />
      </div>
    );
  }

  if (showError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Logo width={64} height={64} />
        <div className="mt-4 text-red-500 text-center">
          Loading failed after 5 attempts. Please refresh the page.
        </div>
      </div>
    );
  }

  if (metadata && !metadata?.isInit) {
    return <Navigate to="/init-admin" />;
  }
  return <>{children}</>;
}
