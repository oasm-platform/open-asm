import { createFileRoute } from '@tanstack/react-router';
import Tools from '@/pages/tools/tools';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/tools/')({
  component: () => (
    <RequireWorkspace>
      <Tools />
    </RequireWorkspace>
  ),
});
