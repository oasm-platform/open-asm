import { createFileRoute } from '@tanstack/react-router';
import AcceptInvitePage from '@/pages/invite/accept-invite';

export const Route = createFileRoute('/invite/$token')({
  component: InviteRoute,
});

function InviteRoute() {
  const { token } = Route.useParams();
  return <AcceptInvitePage token={token} />;
}
