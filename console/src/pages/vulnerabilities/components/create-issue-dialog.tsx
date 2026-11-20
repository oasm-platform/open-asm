import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { t, useT } from '@/lib/i18n-dictionary';
import {
  CreateIssueDtoPriority,
  CreateIssueDtoType,
  IssueLinkInputDtoResourceType,
  useIssuesControllerCreate,
  useWorkspacesControllerGetWorkspaceMembers,
  type CreateIssueDto,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

export interface IssueCandidate {
  id: string;
  name: string;
  severity?: string | null;
}

const PRIORITY_LABEL_KEYS: Record<CreateIssueDtoPriority, string> = {
  p1: 'vulnerabilities.priority.p1',
  p2: 'vulnerabilities.priority.p2',
  p3: 'vulnerabilities.priority.p3',
  p4: 'vulnerabilities.priority.p4',
};

const SEVERITY_PRIORITY: Record<string, CreateIssueDtoPriority> = {
  critical: 'p1',
  high: 'p2',
  medium: 'p3',
};

const NO_ASSIGNEE = 'none';

function defaultTitle(items: IssueCandidate[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].name;
  return t('vulnerabilities.createIssue.defaultTitle', {
    name: items[0].name,
    count: String(items.length - 1),
  });
}

/** The most urgent severity in the selection decides the starting priority. */
function defaultPriority(items: IssueCandidate[]): CreateIssueDtoPriority {
  const order = ['p1', 'p2', 'p3', 'p4'] as const;
  return items
    .map((v) => SEVERITY_PRIORITY[(v.severity ?? '').toLowerCase()] ?? 'p4')
    .reduce<CreateIssueDtoPriority>(
      (best, p) => (order.indexOf(p) < order.indexOf(best) ? p : best),
      'p4',
    );
}

/** Builds the POST /issues body linking the given findings. */
export function buildCreateIssuePayload(
  items: IssueCandidate[],
  values: { title: string; priority: CreateIssueDtoPriority; assigneeId?: string | null },
): CreateIssueDto {
  return {
    title: values.title.trim(),
    type: CreateIssueDtoType.vulnerability_remediation,
    priority: values.priority,
    ...(values.assigneeId ? { assigneeId: values.assigneeId } : {}),
    links: items.map((v) => ({
      resourceType: IssueLinkInputDtoResourceType.vulnerability,
      resourceId: v.id,
    })),
  };
}

/**
 * "Create issue" for the selected findings: one remediation issue linking
 * all of them, title prefilled from the selection.
 */
export function CreateIssueDialog({
  vulnerabilities,
  trigger,
  onCreated,
}: {
  vulnerabilities: IssueCandidate[];
  trigger: ReactNode;
  onCreated?: () => void;
}) {
  const tr = useT();
  const navigate = useNavigate();
  const { selectedWorkspace } = useWorkspaceSelector();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<CreateIssueDtoPriority>('p3');
  const [assignee, setAssignee] = useState(NO_ASSIGNEE);

  const { data: members } = useWorkspacesControllerGetWorkspaceMembers({
    query: {
      queryKey: ['/api/workspaces/members', selectedWorkspace],
      enabled: open && !!selectedWorkspace,
    },
  });
  const createIssue = useIssuesControllerCreate();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTitle(defaultTitle(vulnerabilities));
      setPriority(defaultPriority(vulnerabilities));
      setAssignee(NO_ASSIGNEE);
    }
  };

  const submit = () => {
    if (!title.trim()) return;
    createIssue.mutate(
      {
        data: buildCreateIssuePayload(vulnerabilities, {
          title,
          priority,
          assigneeId: assignee === NO_ASSIGNEE ? null : assignee,
        }),
      },
      {
        onSuccess: (issue) => {
          toast.success(tr('vulnerabilities.createIssue.toastCreated', { no: issue.no }), {
            description: issue.title,
            action: {
              label: tr('vulnerabilities.createIssue.toastOpen'),
              onClick: () => navigate({ to: '/issues/$id', params: { id: issue.id } }),
            },
          });
          setOpen(false);
          onCreated?.();
        },
        onError: (error) => {
          toast.error(tr('vulnerabilities.createIssue.toastError'), {
            description:
              error instanceof Error ? error.message : tr('vulnerabilities.unexpectedError'),
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('vulnerabilities.createIssue.title')}</DialogTitle>
          <DialogDescription>
            {tr('vulnerabilities.createIssue.description', {
              count: vulnerabilities.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-title">{tr('vulnerabilities.createIssue.titleLabel')}</Label>
            <Input
              id="issue-title"
              value={title}
              maxLength={500}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="issue-priority">{tr('vulnerabilities.createIssue.priority')}</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as CreateIssueDtoPriority)}
              >
                <SelectTrigger id="issue-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CreateIssueDtoPriority).map((p) => (
                    <SelectItem key={p} value={p}>
                      {tr(PRIORITY_LABEL_KEYS[p])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-assignee">{tr('vulnerabilities.createIssue.assignee')}</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id="issue-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>{tr('vulnerabilities.createIssue.unassigned')}</SelectItem>
                  {(members ?? [])
                    .filter((m) => m.user)
                    .map((m) => (
                      <SelectItem key={m.user!.id} value={m.user!.id}>
                        {m.user!.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={createIssue.isPending}
          >
            {tr('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!title.trim() || createIssue.isPending}>
            {createIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr('vulnerabilities.createIssue.title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
