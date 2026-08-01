'use client';

import { createFileRoute } from '@tanstack/react-router';
import { CreateAssetGroup } from '@/pages/asset-group/create-asset-group';

export const Route = createFileRoute('/_authed/groups/create')({
  component: () => <CreateAssetGroup />,
});
