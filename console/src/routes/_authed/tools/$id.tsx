import { createFileRoute } from '@tanstack/react-router';
import ToolDetail from '@/pages/tools/components/tool-detail';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/tools/$id')({
  component: () => (
    <RequireWorkspace>
      <ToolDetail />
    </RequireWorkspace>
  ),
});
