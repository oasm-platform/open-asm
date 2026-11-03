'use client';

import { createFileRoute } from '@tanstack/react-router';
import { CreateProject } from '@/pages/projects/create-project';

export const Route = createFileRoute('/_authed/projects/create')({
  component: () => <CreateProject />,
});
