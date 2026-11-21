import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/lib/i18n-dictionary';
import type {
  IssueDetailDto,
  UpdateIssueDto,
} from '@/services/apis/gen/queries';
import { useEffect, useState, type ReactNode } from 'react';
import {
  dateInputToIso,
  dueState,
  daysOverdue,
  ISSUE_PRIORITY_HINT,
  ISSUE_RESOLUTION_LABELS,
  isoToDateInput,
  type IssuePriority,
} from '../issue-utils';
import { SideCard } from './detail-blocks';
import { MemberSelect } from './member-select';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TagsEditor({
  tags,
  onSave,
}: {
  tags: string[];
  onSave: (tags: string[]) => void;
}) {
  const t = useT();
  const joined = tags.join(', ');
  const [value, setValue] = useState(joined);
  useEffect(() => setValue(joined), [joined]);
  const commit = () => {
    const next = Array.from(
      new Set(
        value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    );
    if (next.join(', ') !== joined) onSave(next);
  };
  return (
    <div className="flex flex-col gap-1">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <Input
        aria-label={t('issues.props.tags')}
        className="h-8"
        placeholder={t('issues.props.tagsPlaceholder')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

export function IssueProperties({
  issue,
  onUpdate,
  disabled,
}: {
  issue: IssueDetailDto;
  onUpdate: (data: UpdateIssueDto) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const due = dueState(issue.dueAt, issue.status);

  return (
    <SideCard title={t('issues.props.title')} testId="issue-properties">
      {issue.resolution && (
        <Row label={t('issues.props.resolution')}>
          {ISSUE_RESOLUTION_LABELS[issue.resolution]}
        </Row>
      )}
      <Row label={t('issues.props.priority')}>
        <Select
          value={issue.priority}
          disabled={disabled}
          onValueChange={(v) => onUpdate({ priority: v as IssuePriority })}
        >
          <SelectTrigger aria-label={t('issues.props.priority')} className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ISSUE_PRIORITY_HINT) as IssuePriority[]).map((p) => (
              <SelectItem key={p} value={p}>
                {ISSUE_PRIORITY_HINT[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label={t('issues.props.assignee')}>
        <MemberSelect
          ariaLabel={t('issues.props.assignee')}
          className="h-8"
          value={issue.assignee?.id ?? null}
          disabled={disabled}
          onChange={(assigneeId) => onUpdate({ assigneeId })}
        />
      </Row>
      <Row label={t('issues.props.due')}>
        <div className="flex flex-col gap-0.5">
          <Input
            type="date"
            aria-label={t('issues.props.dueDate')}
            className="h-8"
            disabled={disabled}
            value={isoToDateInput(issue.dueAt)}
            onChange={(e) =>
              onUpdate({ dueAt: dateInputToIso(e.target.value) })
            }
          />
          {issue.dueAt && due === 'overdue' && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {t('issues.props.daysOverdue', { n: daysOverdue(issue.dueAt) })}
            </span>
          )}
          {due === 'soon' && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t('issues.props.dueSoon')}
            </span>
          )}
        </div>
      </Row>
      {issue.groupKey && (
        <Row label={t('issues.props.groupKey')}>
          <code className="break-all rounded bg-muted px-1 py-0.5 text-xs">
            {issue.groupKey}
          </code>
        </Row>
      )}
      <Row label={t('issues.props.tags')}>
        <TagsEditor tags={issue.tags} onSave={(tags) => onUpdate({ tags })} />
      </Row>
    </SideCard>
  );
}
