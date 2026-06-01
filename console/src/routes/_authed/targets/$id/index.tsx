import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/targets/$id/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/targets/$id/$tab',
      params: { id: params.id, tab: 'inventory' },
    });
  },
});
