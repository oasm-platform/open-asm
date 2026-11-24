import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n-dictionary';
import {
  useIssuesControllerChangeStatus,
  type ChangeIssueStatusDto,
  type IssueDetailDto,
} from '@/services/apis/gen/queries';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  apiErrorStatus,
  isFinalStatus,
  ISSUE_RESOLUTION_LABELS,
  ISSUE_STATUS_LABELS,
  type IssueResolution,
  type IssueStatus,
} from '../issue-utils';

const STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

/**
 * Status menu of an issue. Resolving or closing asks for a resolution; a
 * reopen that collides with another open issue of the same group (409) shows
 * the server's explanation inline.
 */
export function ChangeStatusControl({
  issue,
  onChanged,
}: {
  issue: IssueDetailDto;
  onChanged: (issue: IssueDetailDto) => void;
}) {
  const t = useT();
  const [target, setTarget] = useState<IssueStatus | null>(null);
  const [resolution, setResolution] = useState<IssueResolution | ''>('');
  const [note, setNote] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  const changeStatus = useIssuesControllerChangeStatus();

  const send = (data: ChangeIssueStatusDto) => {
    setConflict(null);
    changeStatus.mutate(
      { id: issue.id, data },
      {
        onSuccess: (updated) => {
          toast.success(
            t('issues.status.changed', { status: ISSUE_STATUS_LABELS[data.status] }),
          );
          setTarget(null);
          setResolution('');
          setNote('');
          onChanged(updated);
        },
        onError: (error) => {
          const message = apiErrorMessage(error, t('issues.status.changeFailed'));
          if (apiErrorStatus(error) === 409) {
            setTarget(null);
            setConflict(message);
          } else {
            toast.error(message);
          }
        },
      },
    );
  };

  const pick = (status: IssueStatus) => {
    if (isFinalStatus(status)) {
      setResolution(
        issue.resolution ?? (status === 'resolved' ? 'fixed' : ''),
      );
      setTarget(status);
    } else {
      send({ status });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={changeStatus.isPending}>
            {t('issues.status.change')}
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {STATUSES.filter((s) => s !== issue.status).map((status) => (
            <DropdownMenuItem key={status} onSelect={() => pick(status)}>
              {ISSUE_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {conflict && (
        <Alert
          variant="destructive"
          className="basis-full"
          data-testid="status-conflict"
        >
          <AlertTitle>{t('issues.status.cannotReopen')}</AlertTitle>
          <AlertDescription>
            {conflict}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setConflict(null)}
            >
              {t('issues.status.dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('issues.status.markAs', {
                status: target ? ISSUE_STATUS_LABELS[target].toLowerCase() : '',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('issues.status.pickResolution')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="status-resolution">
                {t('issues.status.resolution')}
              </Label>
              <Select
                value={resolution}
                onValueChange={(v) => setResolution(v as IssueResolution)}
              >
                <SelectTrigger id="status-resolution">
                  <SelectValue placeholder={t('issues.status.selectResolution')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ISSUE_RESOLUTION_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status-note">
                {t('issues.status.noteOptional')}
              </Label>
              <Textarea
                id="status-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!resolution || changeStatus.isPending}
              onClick={() =>
                target &&
                resolution &&
                send({
                  status: target,
                  resolution,
                  ...(note.trim() ? { note: note.trim() } : {}),
                })
              }
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
