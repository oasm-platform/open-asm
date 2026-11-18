import { createFileRoute } from '@tanstack/react-router';
import AttackSurfaceQuery from '@/pages/attack-surface-query/attack-surface-query';

export const Route = createFileRoute('/_authed/attack-surface-query')({
  component: () => <AttackSurfaceQuery />,
});
