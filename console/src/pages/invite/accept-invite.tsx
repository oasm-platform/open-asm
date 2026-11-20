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
import { isAxiosError } from 'axios';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { t, useT } from '@/lib/i18n-dictionary';

const STATUS_LABEL = {
  pending: () => t('workspaces.invite.status.pending'),
  accepted: () => t('workspaces.invite.status.accepted'),
  declined: () => t('workspaces.invite.status.declined'),
  expired: () => t('workspaces.invite.status.expired'),
  cancelled: () => t('workspaces.invite.status.cancelled'),
} as const;

/**
 * Public invite page opened from the in-app notification link.
 * Shows a preview of the invitation and lets the signed-in user whose email
 * matches accept or decline. Users not signed in are prompted to sign in.
 */
export default function AcceptInvitePage({ token }: { token: string }) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { handleSelectWorkspace } = useWorkspaceSelector();
  const { data: session, isPending: isSessionPending } = useSession();
  const [handled, setHandled] = useState(false);

  const {
    data: preview,
    isLoading: isPreviewLoading,
    isError,
    error,
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
          toast.success(t('workspaces.invite.status.accepted'));
          // Mark handled and refresh the preview so the stale Accept button
          // disappears if the user navigates Back to this page.
          setHandled(true);
          refetchPreview();
          // Wait for the workspaces list to include the newly joined
          // workspace before switching, so the auto-select effect cannot
          // override the selection back to an old workspace.
          await queryClient.refetchQueries({
            queryKey: ['/api/workspaces'],
          });
          handleSelectWorkspace(preview?.workspaceId ?? '');
          navigate({ to: '/' });
        },
        onError: () => toast.error(t('workspaces.invite.acceptFailed')),
      },
    });
  const { mutate: declineInvitation, isPending: isDeclining } =
    useWorkspacesControllerDeclineInvitation({
      mutation: {
        onSuccess: () => {
          toast.success(t('workspaces.invite.status.declined'));
          setHandled(true);
          refetchPreview();
        },
        onError: () => toast.error(t('workspaces.invite.declineFailed')),
      },
    });

  if (isSessionPending || isPreviewLoading) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted-foreground">
          {t('workspaces.invite.loading')}
        </p>
      </CenteredCard>
    );
  }

  if (isError) {
    const notFound = isAxiosError(error) && error.response?.status === 404;
    return (
      <CenteredCard>
        <p className="text-sm text-muted-foreground">
          {notFound
            ? t('workspaces.invite.invalidLink')
            : t('workspaces.invite.loadFailed')}
        </p>
        {!notFound && (
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => refetchPreview()}
          >
            {t('common.retry')}
          </Button>
        )}
      </CenteredCard>
    );
  }

  if (!preview) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted-foreground">
          {t('workspaces.invite.notFound')}
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
              {t('workspaces.invite.invited')}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('workspaces.invite.email')}</span>
              <span className="font-medium">{preview.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('workspaces.invite.expires')}</span>
              <span className="font-medium">
                {new Date(preview.expiresAt).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('common.status')}</span>
              <Badge variant={isPending ? 'warning' : 'outline'}>
                {STATUS_LABEL[preview.status]?.() ?? preview.status}
              </Badge>
            </div>
          </div>

          {!isPending && (
            <p className="text-sm text-muted-foreground">
              {t('workspaces.invite.closed')}
            </p>
          )}

          {isPending && !signedInUserId && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('workspaces.invite.signInPrompt')}
              </p>
              <Button
                className="w-full"
                onClick={() =>
                  navigate({
                    to: '/login',
                    search: {
                      redirect: location.pathname + location.search,
                    },
                  })
                }
              >
                {t('workspaces.invite.signIn')}
              </Button>
            </div>
          )}

          {isPending && signedInUserId && (
            <>
              {emailMismatch && (
                <p className="text-sm text-destructive">
                  {t('workspaces.invite.emailMismatch', {
                    current: session?.user?.email ?? '',
                    invited: preview.email,
                  })}
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
                  {isDeclining ? t('workspaces.invite.declining') : t('workspaces.invite.decline')}
                </Button>
                <Button
                  className="flex-1"
                  disabled={isAccepting || emailMismatch}
                  onClick={() =>
                    acceptInvitation({ data: { token } })
                  }
                >
                  {isAccepting ? t('workspaces.invite.accepting') : t('workspaces.invite.accept')}
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
