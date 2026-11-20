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
import { t as tPlain, useT } from '@/lib/i18n-dictionary';
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
  translated,
  type IssuePriority,
} from '../issue-utils';
import { PriorityBadge } from './issue-chips';
import { MemberSelect, useWorkspaceMemberOptions } from './member-select';

const EVENT_LABELS: Record<IssueRuleDtoEvent, string> = translated({
  'vulnerability.detected': 'issues.rules.eventDetected',
  'vulnerability.resurfaced': 'issues.rules.eventResurfaced',
});

const GROUP_BY_LABELS: Record<IssueRuleDtoGroupBy, string> = translated({
  none: 'issues.rules.groupNone',
  vulnerability_name: 'issues.rules.groupVulnerability',
  asset: 'issues.rules.groupAsset',
  target: 'issues.rules.groupTarget',
});

const GROUP_BY_SHORT: Record<IssueRuleDtoGroupBy, string> = translated({
  none: 'issues.rules.shortNone',
  vulnerability_name: 'issues.rules.shortVulnerability',
  asset: 'issues.rules.shortAsset',
  target: 'issues.rules.shortTarget',
});

const SEVERITIES: IssueRuleConditionsDtoMinSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

/** Severity name in the active language ("High" in EN). */
const severityLabel = (value: string) => tPlain(`vulnerabilities.severity.${value}`);

export function conditionsSummary(rule: IssueRuleDto): string {
  const parts: string[] = [];
  const { minSeverity, minEpss, targetIds } = rule.conditions ?? {};
  if (minSeverity)
    parts.push(tPlain('issues.rules.severityGte', { severity: severityLabel(minSeverity) }));
  if (minEpss !== undefined && minEpss !== null)
    parts.push(tPlain('issues.rules.epssGte', { value: String(minEpss) }));
  if (targetIds?.length) {
    parts.push(tPlain('issues.rules.targets', { count: targetIds.length }));
  }
  return parts.length ? parts.join(' · ') : tPlain('issues.rules.everyFinding');
}

/**
 * Issue rules of the workspace: list, toggle, add/edit, delete, and a
 * one-click default rule. Rules only open vulnerability remediation issues.
 */
export function IssueRulesSection() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: rules, isLoading, isError } = useIssueRulesControllerListRules();
  const { members } = useWorkspaceMemberOptions();
  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.id === id)?.name ?? t('issues.rules.unknownMember')) : null;

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
          toast.error(apiErrorMessage(error, t('issues.rules.updateFailed'))),
      },
    );

  const addDefaults = () =>
    createDefaults.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('issues.rules.defaultAdded'));
        void invalidate();
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, t('issues.rules.addDefaultFailed'))),
    });

  return (
    <div className="flex flex-col gap-3" data-testid="issue-rules-section">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{t('issues.rules.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('issues.rules.description')}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('issues.rules.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {t('issues.rules.loadFailed')}
        </p>
      ) : !rules?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
          <Workflow className="size-6 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{t('issues.rules.empty')}</p>
            <p className="text-sm text-muted-foreground">
              {t('issues.rules.emptyHint')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={createDefaults.isPending}
            onClick={addDefaults}
          >
            {t('issues.rules.addDefault')}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border dark:bg-card-surface">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-testid="issue-rule-row"
            >
              <Switch
                checked={rule.enabled}
                aria-label={t('issues.rules.enable', { name: rule.name })}
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
                  <span>{t('issues.rules.toRemediation')}</span>
                  <span>
                    {t('issues.rules.dotShort', { text: GROUP_BY_SHORT[rule.groupBy] })}
                  </span>
                  <span>·</span>
                  {rule.priority ? (
                    <PriorityBadge priority={rule.priority} />
                  ) : (
                    <span>{t('issues.rules.priorityFromSeverity')}</span>
                  )}
                  {rule.defaultAssigneeId && (
                    <span>
                      {t('issues.rules.assign', {
                        name: memberName(rule.defaultAssigneeId) ?? '',
                      })}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('issues.rules.edit', { name: rule.name })}
                  onClick={() => setEditing(rule)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('issues.rules.delete', { name: rule.name })}
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
        title={t('issues.rules.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('issues.rules.deleteDesc')}
        confirmText={t('common.delete')}
        onConfirm={() => {
          if (!deleting) return;
          deleteRule.mutate(
            { id: deleting.id },
            {
              onSuccess: () => void invalidate(),
              onError: (error) =>
                toast.error(apiErrorMessage(error, t('issues.rules.deleteFailed'))),
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
  const t = useT();
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
          {value.length
            ? t('issues.rules.nSelected', { n: value.length })
            : t('issues.rules.allTargets')}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          placeholder={t('issues.rules.searchTargets')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8"
        />
        <div className="max-h-56 overflow-y-auto">
          {targets.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {t('issues.rules.noTargets')}
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
            {t('issues.rules.clearSelection')}
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
  const t = useT();
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
        toast.success(rule ? t('issues.rules.updated') : t('issues.rules.created'));
        onSaved();
      },
      onError: (error: unknown) =>
        toast.error(apiErrorMessage(error, t('issues.rules.saveFailed'))),
    };
    if (rule) updateRule.mutate({ id: rule.id, data: payload }, callbacks);
    else createRule.mutate({ data: payload }, callbacks);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {rule ? t('issues.rules.editTitle') : t('issues.rules.newTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('issues.rules.formDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">{t('issues.rules.name')}</Label>
            <Input
              id="rule-name"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('issues.rules.namePlaceholder')}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-event">{t('issues.rules.event')}</Label>
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
              <Label htmlFor="rule-severity">{t('issues.rules.minSeverity')}</Label>
              <Select value={minSeverity} onValueChange={setMinSeverity}>
                <SelectTrigger id="rule-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t('issues.rules.anySeverity')}</SelectItem>
                  {SEVERITIES.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {severityLabel(severity)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-epss">{t('issues.rules.minEpss')}</Label>
              <Input
                id="rule-epss"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={minEpss}
                aria-invalid={epssInvalid}
                onChange={(e) => setMinEpss(e.target.value)}
                placeholder={t('issues.rules.any')}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-targets">{t('issues.rules.targetsLabel')}</Label>
            <TargetsMultiSelect value={targetIds} onChange={setTargetIds} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-group">{t('issues.rules.groupBy')}</Label>
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
              <Label htmlFor="rule-priority">{t('issues.rules.priority')}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="rule-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DERIVE}>{t('issues.rules.derive')}</SelectItem>
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
              <Label htmlFor="rule-assignee">
                {t('issues.rules.defaultAssignee')}
              </Label>
              <MemberSelect
                id="rule-assignee"
                value={assignee}
                onChange={setAssignee}
                noneLabel={t('issues.rules.nobody')}
                placeholder={t('issues.rules.nobody')}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!name.trim() || epssInvalid || saving}
            onClick={submit}
          >
            {rule ? t('common.save') : t('issues.rules.createRule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default IssueRulesSection;
