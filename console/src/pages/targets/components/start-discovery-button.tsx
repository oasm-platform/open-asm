/**
 * StartDiscoveryButton Component
 *
 * Renders a button in the targets list toolbar that navigates to the
 * target discovery flow. Shows "Start discovery" when the workspace
 * has asset discovery enabled, or "Create target" otherwise.
 */

import { Button } from '@/components/ui/button';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useNavigate } from '@tanstack/react-router';
import { PlusIcon, Target } from 'lucide-react';

/**
 * Renders a button to navigate to the start discovery page.
 * Label and icon depend on the workspace's isAssetsDiscovery setting.
 */
export function StartDiscoveryButton() {
  const { workspaces, selectedWorkspace } = useWorkspaceSelector();
  const navigate = useNavigate({ from: '/targets/' });

  const currentWorkspace = workspaces.find(
    (ws) => ws.id === selectedWorkspace,
  );
  const isDiscoveryEnabled = currentWorkspace?.isAssetsDiscovery ?? true;

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={() => navigate({ to: '/targets/start-discovery' })}
    >
      {isDiscoveryEnabled ? (
        <Target className="shrink-0" />
      ) : (
        <PlusIcon className="shrink-0 size-4" />
      )}
      <span>{isDiscoveryEnabled ? 'Start discovery' : 'Create target'}</span>
    </Button>
  );
}
