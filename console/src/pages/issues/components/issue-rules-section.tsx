import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  getIssueRulesControllerListRulesQueryKey,
  useIssueRulesControllerCreateDefaultRules,
  useIssueRulesControllerCreateRule,
  useIssueRulesControllerDeleteRule,
  useIssueRulesControllerListRules,
  useIssueRulesControllerUpdateRule,
  useTargetsControllerGetTargetsInWorkspace,
  type CreateIssueRuleDto,
  type IssueRuleConditionsDtoMinSeverity,
  type IssueRuleDto,
  type IssueRuleDtoEvent,
  type IssueRuleDtoGroupBy,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  ISSUE_PRIORITY_HINT,
  type IssuePriority,
} from '../issue-utils';
import { PriorityBadge } from './issue-chips';
import { MemberSelect, useWorkspaceMemberOptions } from './member-select';

const EVENT_LABELS: Record<IssueRuleDtoEvent, string> = {
  'vulnerability.detected': 'Vulnerability detected',
  'vulnerability.resurfaced': 'Vulnerability resurfaced',
};

const GROUP_BY_LABELS: Record<IssueRuleDtoGroupBy, string> = {
  none: 'No grouping (one issue per finding)',
  vulnerability_name: 'Vulnerability (CVE / template)',
  asset: 'Asset',
  target: 'Target',
};

const GROUP_BY_SHORT: Record<IssueRuleDtoGroupBy, string> = {
  none: 'one per finding',
  vulnerability_name: 'grouped by vulnerability',
  asset: 'grouped by asset',
  target: 'grouped by target',
};

const SEVERITIES: IssueRuleConditionsDtoMinSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export function conditionsSummary(rule: IssueRuleDto): string {
  const parts: string[] = [];
  const { minSeverity, minEpss, targetIds } = rule.conditions ?? {};
  if (minSeverity) parts.push(`Severity ≥ ${capitalize(minSeverity)}`);
  if (minEpss !== undefined && minEpss !== null) parts.push(`EPSS ≥ ${minEpss}`);
  if (targetIds?.length) {
    parts.push(`${targetIds.length} target${targetIds.length > 1 ? 's' : ''}`);
  }
  return parts.length ? parts.join(' · ') : 'Every finding';
}

/**
 * Issue rules of the workspace: list, toggle, add/edit, delete, and a
 * one-click default rule. Rules only open vulnerability remediation issues.
 */
export function IssueRulesSection() {
  const queryClient = useQueryClient();
  const { data: rules, isLoading, isError } = useIssueRulesControllerListRules();
  const { members } = useWorkspaceMemberOptions();
  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.id === id)?.name ?? 'Unknown member') : null;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getIssueRulesControllerListRulesQueryKey(),
    });

  const [editing, setEditing] = useState<IssueRuleDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<IssueRuleDto | null>(null);

  const updateRule = useIssueRulesControllerUpdateRule();
  const deleteRule = useIssueRulesControllerDeleteRule();
  const createDefaults = useIssueRulesControllerCreateDefaultRules();

  const toggle = (rule: IssueRuleDto, enabled: boolean) =>
    updateRule.mutate(
      { id: rule.id, data: { enabled } },
      {
        onSuccess: () => void invalidate(),
        onError: (error) =>
          toast.error(apiErrorMessage(error, 'Failed to update the rule')),
      },
    );

  const addDefaults = () =>
    createDefaults.mutate(undefined, {
      onSuccess: () => {
        toast.success('Default rule added');
        void invalidate();
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, 'Failed to add the default rule')),
    });

  return (
    <div className="flex flex-col gap-3" data-testid="issue-rules-section">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Issue rules</h3>
          <p className="text-sm text-muted-foreground">
            Open vulnerability remediation issues automatically when findings
            match. Matching findings join the open issue of the same group.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          Add rule
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load issue rules.</p>
      ) : !rules?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
          <Workflow className="size-6 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">No issue rules yet</p>
            <p className="text-sm text-muted-foreground">
              Start with the default rule: critical and high findings open a
              remediation issue, grouped by vulnerability.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={createDefaults.isPending}
            onClick={addDefaults}
          >
            Add default rule
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-testid="issue-rule-row"
            >
              <Switch
                checked={rule.enabled}
                aria-label={`Enable ${rule.name}`}
                onCheckedChange={(checked) => toggle(rule, checked)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{rule.name}</span>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {rule.event}
                  </Badge>
                </div>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span>{conditionsSummary(rule)}</span>
                  <span>→ Vulnerability remediation</span>
                  <span>· {GROUP_BY_SHORT[rule.groupBy]}</span>
                  <span>·</span>
                  {rule.priority ? (
                    <PriorityBadge priority={rule.priority} />
                  ) : (
                    <span>priority from severity</span>
                  )}
                  {rule.defaultAssigneeId && (
                    <span>· assign {memberName(rule.defaultAssigneeId)}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${rule.name}`}
                  onClick={() => setEditing(rule)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${rule.name}`}
                  onClick={() => setDeleting(rule)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <IssueRuleFormDialog
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void invalidate();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete rule "${deleting?.name ?? ''}"?`}
        description="Issues the rule already opened stay as they are."
        confirmText="Delete"
        onConfirm={() => {
          if (!deleting) return;
          deleteRule.mutate(
            { id: deleting.id },
            {
              onSuccess: () => void invalidate(),
              onError: (error) =>
                toast.error(apiErrorMessage(error, 'Failed to delete the rule')),
            },
          );
        }}
      />
    </div>
  );
}

const DERIVE = 'derive';
const ANY = 'any';

function TargetsMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const { data } = useTargetsControllerGetTargetsInWorkspace({
    limit: 50,
    value: search || undefined,
  });
  const targets = data?.data ?? [];
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal"
          id="rule-targets"
        >
          {value.length ? `${value.length} selected` : 'All targets'}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          placeholder="Search targets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8"
        />
        <div className="max-h-56 overflow-y-auto">
          {targets.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No targets found
            </p>
          ) : (
            targets.map((target) => (
              <label
                key={target.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={value.includes(target.id)}
                  onCheckedChange={() => toggle(target.id)}
                />
                <span className="truncate">{target.value}</span>
              </label>
            ))
          )}
        </div>
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            onClick={() => onChange([])}
          >
            Clear selection
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function IssueRuleFormDialog({
  rule,
  onClose,
  onSaved,
}: {
  rule: IssueRuleDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [event, setEvent] = useState<IssueRuleDtoEvent>(
    rule?.event ?? 'vulnerability.detected',
  );
  const [minSeverity, setMinSeverity] = useState<string>(
    rule?.conditions?.minSeverity ?? ANY,
  );
  const [minEpss, setMinEpss] = useState<string>(
    rule?.conditions?.minEpss !== undefined && rule?.conditions?.minEpss !== null
      ? String(rule.conditions.minEpss)
      : '',
  );
  const [targetIds, setTargetIds] = useState<string[]>(
    rule?.conditions?.targetIds ?? [],
  );
  const [groupBy, setGroupBy] = useState<IssueRuleDtoGroupBy>(
    rule?.groupBy ?? 'vulnerability_name',
  );
  const [priority, setPriority] = useState<string>(rule?.priority ?? DERIVE);
  const [assignee, setAssignee] = useState<string | null>(
    rule?.defaultAssigneeId ?? null,
  );

  const createRule = useIssueRulesControllerCreateRule();
  const updateRule = useIssueRulesControllerUpdateRule();
  const saving = createRule.isPending || updateRule.isPending;

  const epssValue = minEpss.trim() === '' ? undefined : Number(minEpss);
  const epssInvalid =
    epssValue !== undefined &&
    (Number.isNaN(epssValue) || epssValue < 0 || epssValue > 1);

  const payload = useMemo<CreateIssueRuleDto>(
    () => ({
      name: name.trim(),
      event: event as CreateIssueRuleDto['event'],
      issueType: 'vulnerability_remediation',
      conditions: {
        ...(minSeverity !== ANY
          ? { minSeverity: minSeverity as IssueRuleConditionsDtoMinSeverity }
          : {}),
        ...(epssValue !== undefined && !epssInvalid ? { minEpss: epssValue } : {}),
        ...(targetIds.length ? { targetIds } : {}),
      },
      groupBy,
      priority: priority === DERIVE ? null : (priority as IssuePriority),
      defaultAssigneeId: assignee,
    }),
    [name, event, minSeverity, epssValue, epssInvalid, targetIds, groupBy, priority, assignee],
  );

  const submit = () => {
    const callbacks = {
      onSuccess: () => {
        toast.success(rule ? 'Rule updated' : 'Rule created');
        onSaved();
      },
      onError: (error: unknown) =>
        toast.error(apiErrorMessage(error, 'Failed to save the rule')),
    };
    if (rule) updateRule.mutate({ id: rule.id, data: payload }, callbacks);
    else createRule.mutate({ data: payload }, callbacks);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit rule' : 'New issue rule'}</DialogTitle>
          <DialogDescription>
            Matching findings open (or join) a vulnerability remediation issue.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="Critical & high"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-event">Event</Label>
            <Select
              value={event}
              onValueChange={(v) => setEvent(v as IssueRuleDtoEvent)}
            >
              <SelectTrigger id="rule-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-severity">Minimum severity</Label>
              <Select value={minSeverity} onValueChange={setMinSeverity}>
                <SelectTrigger id="rule-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any severity</SelectItem>
                  {SEVERITIES.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {capitalize(severity)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-epss">Minimum EPSS (0–1)</Label>
              <Input
                id="rule-epss"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={minEpss}
                aria-invalid={epssInvalid}
                onChange={(e) => setMinEpss(e.target.value)}
                placeholder="Any"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-targets">Targets</Label>
            <TargetsMultiSelect value={targetIds} onChange={setTargetIds} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-group">Group findings by</Label>
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as IssueRuleDtoGroupBy)}
            >
              <SelectTrigger id="rule-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GROUP_BY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="rule-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DERIVE}>Derive from severity</SelectItem>
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
            <div className="grid gap-1.5">
              <Label htmlFor="rule-assignee">Default assignee</Label>
              <MemberSelect
                id="rule-assignee"
                value={assignee}
                onChange={setAssignee}
                noneLabel="Nobody"
                placeholder="Nobody"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || epssInvalid || saving}
            onClick={submit}
          >
            {rule ? 'Save' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default IssueRulesSection;
