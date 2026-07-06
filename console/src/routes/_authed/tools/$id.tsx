import { createFileRoute } from '@tanstack/react-router';
import ToolDetail from '@/pages/tools/components/tool-detail';

export const Route = createFileRoute('/_authed/tools/$id')({
  component: () => (
      <ToolDetail />
  ),
});
