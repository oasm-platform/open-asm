import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n-dictionary';
import {
  useIssuesControllerCreate,
  type CreateIssueDto,
  type IssueLinkInputDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  dateInputToIso,
  formatIssueNo,
  ISSUE_PRIORITY_HINT,
  ISSUE_TYPE_LABELS,
  type IssuePriority,
} from '../issue-utils';
import { MemberSelect } from './member-select';

type CreatableType = 'task' | 'vulnerability_remediation';
const CREATABLE_TYPES: CreatableType[] = ['task', 'vulnerability_remediation'];

export function CreateIssueDialog({
  open,
  onOpenChange,
  links,
  defaultType = 'task',
  defaultTitle = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resources to link to the new issue (e.g. from a vulnerability page). */
  links?: IssueLinkInputDto[];
  defaultType?: CreatableType;
  defaultTitle?: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(defaultTitle);
  const [type, setType] = useState<CreatableType>(defaultType);
  const [priority, setPriority] = useState<IssuePriority>('p3');
  const [due, setDue] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const create = useIssuesControllerCreate();

  const reset = () => {
    setTitle(defaultTitle);
    setType(defaultType);
    setPriority('p3');
    setDue('');
    setAssigneeId(null);
    setDescription('');
  };

  const submit = () => {
    const data: CreateIssueDto = {
      title: title.trim(),
      type,
      priority,
      dueAt: dateInputToIso(due),
      assigneeId,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(links?.length ? { links } : {}),
    };
    create.mutate(
      { data },
      {
        onSuccess: (issue) => {
          toast.success(t('issues.create.created', { no: formatIssueNo(issue.no) }));
          void queryClient.invalidateQueries({ queryKey: ['/api/issues'] });
          reset();
          onOpenChange(false);
          void navigate({ to: '/issues/$id', params: { id: issue.id } });
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, t('issues.create.failed'))),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('issues.create.title')}</DialogTitle>
          <DialogDescription>
            {t('issues.create.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="issue-title">{t('issues.create.titleLabel')}</Label>
            <Input
              id="issue-title"
              value={title}
              maxLength={500}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('issues.create.titlePlaceholder')}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-type">{t('issues.create.type')}</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as CreatableType)}
              >
                <SelectTrigger id="issue-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {ISSUE_TYPE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="issue-priority">{t('issues.create.priority')}</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as IssuePriority)}
              >
                <SelectTrigger id="issue-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ISSUE_PRIORITY_HINT) as IssuePriority[]).map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {ISSUE_PRIORITY_HINT[p]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-due">{t('issues.create.dueDate')}</Label>
              <Input
                id="issue-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="issue-assignee">{t('issues.create.assignee')}</Label>
              <MemberSelect
                id="issue-assignee"
                value={assigneeId}
                onChange={setAssigneeId}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="issue-description">
              {t('issues.create.descriptionLabel')}
            </Label>
            <Textarea
              id="issue-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('issues.create.descriptionPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!title.trim() || create.isPending}
            onClick={submit}
          >
            {t('issues.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
