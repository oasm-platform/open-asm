import { createFileRoute } from '@tanstack/react-router';
import Reports from '@/pages/reports/reports';

export const Route = createFileRoute('/_authed/reports')({
  component: () => (
      <Reports />
  ),
});
