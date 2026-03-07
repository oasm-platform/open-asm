'use client';

import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface RequireWorkspaceProps {
  children: ReactNode;
}

/**
 * Component that ensures user has at least one workspace.
 * If no workspace exists, redirects to /workspaces/create.
 * This should be used in protected routes to force workspace creation.
 */
export function RequireWorkspace({ children }: RequireWorkspaceProps) {
  const { workspaces, isLoading } = useWorkspaceSelector();

  // While loading, show children (the workspace selector will handle auto-selection)
  if (isLoading) {
    return <>{children}</>;
  }

  // If user has at least one workspace, allow access
  if (workspaces && workspaces.length > 0) {
    return <>{children}</>;
  }

  // No workspace exists - redirect to create workspace page
  return <Navigate to="/workspaces/create" replace />;
}
