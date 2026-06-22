import { createFileRoute } from '@tanstack/react-router';
import DetailProvider from '@/pages/providers/detail-provider';

export const Route = createFileRoute('/_authed/providers/$id/')({
  component: () => (
      <DetailProvider />
  ),
});
