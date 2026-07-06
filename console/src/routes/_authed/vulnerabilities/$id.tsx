import { createFileRoute } from '@tanstack/react-router';
import DetailVulnerability from '@/pages/vulnerabilities/detail-vulnerability';

export const Route = createFileRoute('/_authed/vulnerabilities/$id')({
  component: () => (
      <DetailVulnerability />
  ),
});
