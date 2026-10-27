import { createFileRoute } from '@tanstack/react-router';
import { Files } from '@/pages/files/files';

export const Route = createFileRoute('/_authed/files/')({
  component: () => <Files />,
});
