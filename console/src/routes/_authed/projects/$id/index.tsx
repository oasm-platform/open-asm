import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/projects/$id/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/projects/$id/$tab',
      params: { id: params.id, tab: 'overview' },
      search: {},
    });
  },
});
