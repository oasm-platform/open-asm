import {
  CommentThread,
  commentThreadQueryKey,
} from '@/components/comments/comment-thread';
import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  getIssuesControllerGetByIdQueryKey,
  useIssuesControllerDelete,
  useIssuesControllerGetById,
  useIssuesControllerRemoveLink,
  useIssuesControllerUpdate,
  useIssueRulesControllerListRules,
  type IssueDetailDto,
  type IssueLinkDto,
  type UpdateIssueDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Bot, FileText, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AddLinkDialog } from './components/add-link-dialog';
import { ChangeStatusControl } from './components/change-status';
import { DetailSection, SideCard } from './components/detail-blocks';
import { IssueHero } from './components/issue-hero';
import {
  IssueLinksPanel,
  RemediationSection,
} from './components/issue-links-panel';
import { IssueProperties } from './components/issue-properties';
import {
  apiErrorMessage,
  apiErrorStatus,
  formatIssueNo,
  type LinkResourceType,
} from './issue-utils';

function EditableTitle({
  issue,
  onSave,
}: {
  issue: IssueDetailDto;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(issue.title);
  const commit = () => {
    const next = value.trim();
    setEditing(false);
    if (next && next !== issue.title) onSave(next);
    else setValue(issue.title);
  };
  if (editing) {
    return (
      <Input
        aria-label="Issue title"
        className="h-10 min-w-[min(40rem,80vw)] text-xl font-semibold md:text-xl"
        value={value}
        maxLength={500}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setValue(issue.title);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="group flex items-center gap-2 text-left"
      onClick={() => {
        setValue(issue.title);
        setEditing(true);
      }}
      aria-label="Edit title"
    >
      <span className="break-words">{issue.title}</span>
      <Pencil className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function DescriptionCard({
  issue,
  onSave,
}: {
  issue: IssueDetailDto;
  onSave: (description: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(issue.description ?? '');
  return (
    <DetailSection
      title="Description"
      icon={<FileText />}
      action={
        !editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue(issue.description ?? '');
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Description"
            rows={5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(false);
                onSave(value.trim() ? value.trim() : null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : issue.description ? (
        <p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed">
          {issue.description}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </DetailSection>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading issue">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 w-full rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function IssueDetail({ issueId }: { issueId?: string } = {}) {
  const params = useParams({ strict: false }) as { id?: string };
  const id = issueId ?? params.id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: issue,
    isLoading,
    error,
  } = useIssuesControllerGetById(id, {
    query: { enabled: Boolean(id) },
  });

  const { data: rules } = useIssueRulesControllerListRules({
    query: { enabled: Boolean(issue?.ruleId) },
  });

  const [linkDialog, setLinkDialog] = useState<LinkResourceType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const updateIssue = useIssuesControllerUpdate();
  const removeLink = useIssuesControllerRemoveLink();
  const deleteIssue = useIssuesControllerDelete();

  const refresh = (next?: IssueDetailDto) => {
    if (next) {
      queryClient.setQueryData(getIssuesControllerGetByIdQueryKey(id), next);
    }
    void queryClient.invalidateQueries({
      queryKey: getIssuesControllerGetByIdQueryKey(id),
    });
    void queryClient.invalidateQueries({ queryKey: ['/api/issues'] });
    void queryClient.invalidateQueries({
      queryKey: commentThreadQueryKey({ type: 'issue', id }),
    });
  };

  const update = (data: UpdateIssueDto) =>
    updateIssue.mutate(
      { id, data },
      {
        onSuccess: (next) => refresh(next),
        onError: (err) =>
          toast.error(apiErrorMessage(err, 'Failed to update the issue')),
      },
    );

  const unlink = (link: IssueLinkDto) => {
    setRemovingId(link.id);
    removeLink.mutate(
      { id, linkId: link.id },
      {
        onSuccess: () => {
          toast.success('Link removed');
          refresh();
        },
        onError: (err) =>
          toast.error(apiErrorMessage(err, 'Failed to remove the link')),
        onSettled: () => setRemovingId(null),
      },
    );
  };

  const linkedIds = useMemo(
    () =>
      new Set(
        (issue?.links ?? []).map((l) => `${l.resourceType}:${l.resourceId}`),
      ),
    [issue?.links],
  );

  if (isLoading) {
    return (
      <Page>
        <DetailSkeleton />
      </Page>
    );
  }

  if (!issue) {
    const notFound = apiErrorStatus(error) === 404;
    return (
      <Page title="Issue">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {notFound
              ? 'This issue does not exist or was deleted.'
              : 'Failed to load the issue.'}
          </p>
          <Button variant="outline" asChild>
            <Link to="/issues">Back to issues</Link>
          </Button>
        </div>
      </Page>
    );
  }

  const isRemediation = issue.type === 'vulnerability_remediation';
  const ruleName = issue.ruleId
    ? (rules?.find((r) => r.id === issue.ruleId)?.name ?? 'Deleted rule')
    : null;
  const sourceLabel = ruleName ? `Rule “${ruleName}”` : 'Manual';

  return (
    <Page
      title={
        <EditableTitle issue={issue} onSave={(title) => update({ title })} />
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ChangeStatusControl issue={issue} onChanged={refresh} />
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="Delete issue"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <IssueHero issue={issue} sourceLabel={sourceLabel} />

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col divide-y rounded-xl border bg-card">
            {isRemediation && (
              <RemediationSection
                issue={issue}
                removingId={removingId}
                onRemove={unlink}
                onAdd={() => setLinkDialog('vulnerability')}
              />
            )}
            <DescriptionCard
              key={issue.description ?? ''}
              issue={issue}
              onSave={(description) => update({ description })}
            />
            <DetailSection title="Activity" icon={<MessageSquare />}>
              <CommentThread subject={{ type: 'issue', id: issue.id }} />
            </DetailSection>
          </div>

          <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
            <IssueProperties
              issue={issue}
              onUpdate={update}
              disabled={updateIssue.isPending}
            />
            <IssueLinksPanel
              issue={issue}
              removingId={removingId}
              onRemove={unlink}
              onAdd={() =>
                setLinkDialog(isRemediation ? 'vulnerability' : 'asset')
              }
            />
            {isRemediation && (
              <SideCard title="Automation" testId="automation-note">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300">
                    <Bot className="size-4" />
                  </span>
                  <p className="text-muted-foreground">
                    Resolves itself (as fixed) once every linked vulnerability
                    is fixed by a covering scan or dismissed, and reopens if one
                    of them resurfaces.
                  </p>
                </div>
              </SideCard>
            )}
          </aside>
        </div>
      </div>

      {linkDialog && (
        <AddLinkDialog
          issueId={issue.id}
          open
          defaultType={linkDialog}
          linkedIds={linkedIds}
          onOpenChange={(open) => !open && setLinkDialog(null)}
          onLinked={() => refresh()}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${formatIssueNo(issue.no)}?`}
        description="The issue, its links and its comments are removed. Linked resources stay."
        confirmText="Delete"
        onConfirm={() =>
          deleteIssue.mutate(
            { id: issue.id },
            {
              onSuccess: () => {
                toast.success(`${formatIssueNo(issue.no)} deleted`);
                void queryClient.invalidateQueries({
                  queryKey: ['/api/issues'],
                });
                void navigate({ to: '/issues' });
              },
              onError: (err) =>
                toast.error(apiErrorMessage(err, 'Failed to delete the issue')),
            },
          )
        }
      />
    </Page>
  );
}
