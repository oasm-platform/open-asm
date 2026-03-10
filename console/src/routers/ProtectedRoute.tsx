import { useEffect, useState } from 'react';

import ProtectedLayout from '@/components/common/layout/protect-layout';
import SettingsLayout from '@/components/common/layout/settings-layout';
import { authClient } from '@/utils/authClient';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

const { useSession: useAuthSession } = authClient;

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

type LayoutType = 'application' | 'settings';

interface ProtectedRouteProps {
  layout?: LayoutType;
}

const ProtectedRoute = ({ layout = 'application' }: ProtectedRouteProps) => {
  const [retryCount, setRetryCount] = useState(0);

  const { data, isPending, error } = useAuthSession();

  const location = useLocation();
  const currentPath = location.pathname;

  // Check if we should redirect to login
  // Case 1: No data and not pending (session is null/not authenticated)
  // Case 2: Response was 200 but body is null (explicitly not authenticated)
  const shouldRedirect = !data && !isPending;

  // Check if we should retry (network error or connection failed)
  const shouldRetry = error && retryCount < MAX_RETRIES;

  // Handle retry logic with exponential backoff
  useEffect(() => {
    if (shouldRetry) {
      const delay = RETRY_DELAY * Math.pow(2, retryCount);
      const timer = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [shouldRetry, retryCount]);

  // If there's an error and we can retry, show loading with retry message
  if (shouldRetry) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            Connection interrupted. Retrying... ({retryCount + 1}/{MAX_RETRIES})
          </p>
        </div>
      </div>
    );
  }

  // Redirect to login if no session data
  if (shouldRedirect) {
    return <Navigate to={`/login?redirect=${currentPath}`} />;
  }

  const LayoutComponent =
    layout === 'settings' ? SettingsLayout : ProtectedLayout;

  return (
    <LayoutComponent>
      <Outlet />
    </LayoutComponent>
  );
};

export default ProtectedRoute;
