import { createFileRoute } from '@tanstack/react-router';
import MailServer from '@/modules/admin/pages/mail-server';

export const Route = createFileRoute('/admin/mail-server')({
  component: MailServer,
});
