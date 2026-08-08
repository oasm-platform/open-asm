import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useWorkspacesControllerAcceptInvitation,
  useWorkspacesControllerDeclineInvitation,
  useWorkspacesControllerGetInvitationPreview,
} from '@/services/apis/gen/queries';
import { useSession } from '@/utils/authClient';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

const STATUS_LABEL = {
  pending: 'Waiting for your response',
  accepted: 'Invitation accepted',
  declined: 'Invitation declined',
  expired: 'Invitation expired',
  cancelled: 'Invitation cancelled',
} as const;

/**
 * Public invite page opened from the in-app notification link.
 * Shows a preview of the invitation and lets the signed-in user whose email
 * matches accept or decline. Users not signed in are prompted to sign in.
 */
export default function AcceptInvitePage({ token }: { token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { handleSelectWorkspace } = useWorkspaceSelector();
  const { data: session, isPending: isSessionPending } = useSession();
  const [handled, setHandled] = useState(false);

  const {
    data: preview,
    isLoading: isPreviewLoading,
    refetch: refetchPreview,
  } = useWorkspacesControllerGetInvitationPreview(token, {
    query: {
      queryKey: ['/api/workspaces/invitations', 'preview', token],
      enabled: !!token,
      retry: false,
    },
  });

  const { mutate: acceptInvitation, isPending: isAccepting } =
    useWorkspacesControllerAcceptInvitation({
      mutation: {
        onSuccess: async () => {
          toast.success('Invitation accepted');
          // Wait for the workspaces list to include the newly joined
          // workspace before switching, so the auto-select effect cannot
          // override the selection back to an old workspace.
          await queryClient.refetchQueries({
            queryKey: ['/api/workspaces'],
          });
          handleSelectWorkspace(preview?.workspaceId ?? '');
          navigate({ to: '/' });
        },
        onError: () => toast.error('Failed to accept invitation'),
      },
    });
  const { mutate: declineInvitation, isPending: isDeclining } =
    useWorkspacesControllerDeclineInvitation({
      mutation: {
        onSuccess: () => {
          toast.success('Invitation declined');
          setHandled(true);
          refetchPreview();
        },
        onError: () => toast.error('Failed to decline invitation'),
      },
    });

  if (isSessionPending || isPreviewLoading) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted-foreground">Loading invitation...</p>
      </CenteredCard>
    );
  }

  if (!preview) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted-foreground">
          Invitation not found or the link is invalid.
        </p>
      </CenteredCard>
    );
  }

  const isPending = preview.status === 'pending' && !handled;
  const signedInUserId = session?.user?.id;
  const emailMismatch =
    !!signedInUserId &&
    !!session?.user?.email &&
    session.user.email.toLowerCase() !== preview.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6 p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{preview.workspaceName}</h2>
            <p className="text-sm text-muted-foreground">
              You have been invited to join this workspace.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invited email</span>
              <span className="font-medium">{preview.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span className="font-medium">
                {new Date(preview.expiresAt).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={isPending ? 'warning' : 'outline'}>
                {STATUS_LABEL[preview.status] ?? preview.status}
              </Badge>
            </div>
          </div>

          {!isPending && (
            <p className="text-sm text-muted-foreground">
              This invitation can no longer be answered.
            </p>
          )}

          {isPending && !signedInUserId && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in to respond to this invitation.
              </p>
              <Button
                className="w-full"
                onClick={() =>
                  navigate({ to: '/login', search: { redirect: location.href } })
                }
              >
                Sign in
              </Button>
            </div>
          )}

          {isPending && signedInUserId && (
            <>
              {emailMismatch && (
                <p className="text-sm text-destructive">
                  You are signed in as {session?.user?.email}, but this
                  invitation was sent to {preview.email}. Switch to the invited
                  account to respond.
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={isDeclining || emailMismatch}
                  onClick={() =>
                    declineInvitation({ data: { token } })
                  }
                >
                  {isDeclining ? 'Declining...' : 'Decline'}
                </Button>
                <Button
                  className="flex-1"
                  disabled={isAccepting || emailMismatch}
                  onClick={() =>
                    acceptInvitation({ data: { token } })
                  }
                >
                  {isAccepting ? 'Accepting...' : 'Accept'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </div>
  );
}
