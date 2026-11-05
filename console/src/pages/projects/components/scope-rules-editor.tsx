import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useDebounce from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import {
  ProjectScopeRuleMode,
  ProjectScopeRuleType,
  useProjectsControllerPreviewScope,
  useTargetsControllerGetTargetsInWorkspace,
  type ScopeRuleInputDto,
} from '@/services/apis/gen/queries';
import { Plus, X } from 'lucide-react';
import { assetCount } from '../project-utils';
import { useEffect } from 'react';

/** A rule being edited, with the label of id-based values. */
export interface EditableScopeRule extends ScopeRuleInputDto {
  label?: string;
}

const TYPE_LABEL: Record<ProjectScopeRuleType, string> = {
  target: 'Target',
  hostname: 'Hostname',
  cidr: 'CIDR',
  asset: 'Asset',
};

const PLACEHOLDER: Partial<Record<ProjectScopeRuleType, string>> = {
  hostname: '*.example.com',
  cidr: '203.0.113.0/24',
};

/** A rule worth sending: id-based ones need an id, the others any text. */
export const isCompleteRule = (rule: ScopeRuleInputDto) => rule.value.trim().length > 0;

/**
 * Include/exclude rules with a live count of what they select. Used by the
 * create wizard and the Assets tab; `projectId` adds the hand-picked assets
 * to the total.
 */
export function ScopeRulesEditor({
  rules,
  onChange,
  autoAddAssets,
  onAutoAddAssetsChange,
  projectId,
  disabled,
}: {
  rules: EditableScopeRule[];
  onChange: (rules: EditableScopeRule[]) => void;
  autoAddAssets: boolean;
  onAutoAddAssetsChange: (value: boolean) => void;
  projectId?: string;
  disabled?: boolean;
}) {
  const targets = useTargetsControllerGetTargetsInWorkspace({
    page: 1,
    limit: 100,
    sortBy: 'value',
    sortOrder: 'ASC',
  });
  const preview = useProjectsControllerPreviewScope();
  const complete = rules.filter(isCompleteRule);
  const debounced = useDebounce(JSON.stringify(complete), 400);

  useEffect(() => {
    const parsed = JSON.parse(debounced) as ScopeRuleInputDto[];
    preview.mutate({
      data: {
        rules: parsed.map(({ mode, type, value }) => ({ mode, type, value })),
        ...(projectId ? { projectId } : {}),
      },
    });
    // `preview` is a fresh object every render; the input is the rule set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, projectId]);

  const perRule = preview.data?.perRule ?? [];
  // Counts line up with the complete rules only.
  const countFor = (index: number) => {
    const position = rules
      .slice(0, index + 1)
      .filter(isCompleteRule).length - 1;
    return isCompleteRule(rules[index]) ? perRule[position] : undefined;
  };

  const patch = (index: number, change: Partial<EditableScopeRule>) =>
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)));

  return (
    <div className="flex flex-col gap-3">
      {rules.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No rules. Add one to keep the project in sync with a target, a
          hostname pattern or an address range.
        </p>
      )}
      {rules.map((rule, index) => {
        const count = countFor(index);
        return (
          <div
            key={index}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-2 sm:grid-cols-[110px_120px_minmax(0,1fr)_80px_auto]"
          >
            <Select
              value={rule.mode}
              disabled={disabled}
              onValueChange={(mode) => patch(index, { mode: mode as ProjectScopeRuleMode })}
            >
              <SelectTrigger
                aria-label="Include or exclude"
                className={cn(
                  'h-8 text-xs',
                  rule.mode === ProjectScopeRuleMode.exclude && 'text-destructive',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ProjectScopeRuleMode.include}>Include</SelectItem>
                <SelectItem value={ProjectScopeRuleMode.exclude}>Exclude</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={rule.type}
              disabled={disabled}
              onValueChange={(type) =>
                patch(index, { type: type as ProjectScopeRuleType, value: '', label: undefined })
              }
            >
              <SelectTrigger aria-label="Rule type" className="hidden h-8 text-xs sm:flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    ProjectScopeRuleType.target,
                    ProjectScopeRuleType.hostname,
                    ProjectScopeRuleType.cidr,
                  ] as ProjectScopeRuleType[]
                ).map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_LABEL[type]}
                  </SelectItem>
                ))}
                {rule.type === ProjectScopeRuleType.asset && (
                  <SelectItem value={ProjectScopeRuleType.asset}>Asset</SelectItem>
                )}
              </SelectContent>
            </Select>
            {rule.type === ProjectScopeRuleType.target ? (
              <Select
                value={rule.value || undefined}
                disabled={disabled}
                onValueChange={(value) => patch(index, { value })}
              >
                <SelectTrigger aria-label="Target" className="h-8 min-w-0 text-xs">
                  <SelectValue placeholder="Pick a target" />
                </SelectTrigger>
                <SelectContent>
                  {(targets.data?.data ?? []).map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : rule.type === ProjectScopeRuleType.asset ? (
              <span className="truncate px-2 text-sm" title={rule.value}>
                {rule.label ?? rule.value}
              </span>
            ) : (
              <Input
                value={rule.value}
                disabled={disabled}
                onChange={(e) => patch(index, { value: e.target.value })}
                placeholder={PLACEHOLDER[rule.type]}
                aria-label={TYPE_LABEL[rule.type]}
                className="h-8"
              />
            )}
            <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
              {count === undefined
                ? ''
                : rule.mode === ProjectScopeRuleMode.exclude
                  ? `−${count}`
                  : assetCount(count)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={disabled}
              aria-label="Remove rule"
              onClick={() => onChange(rules.filter((_, i) => i !== index))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...rules,
              {
                mode: ProjectScopeRuleMode.include,
                type: ProjectScopeRuleType.hostname,
                value: '',
              },
            ])
          }
        >
          <Plus className="size-3.5" />
          Add rule
        </Button>
        <span className="text-sm">
          <span className="font-semibold tabular-nums">
            {preview.data?.total ?? 0}
          </span>{' '}
          <span className="text-muted-foreground">assets in scope</span>
          {preview.isError && (
            <span className="ml-2 text-xs text-destructive">
              A rule is not valid yet
            </span>
          )}
        </span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={autoAddAssets}
          disabled={disabled}
          onCheckedChange={(value) => onAutoAddAssetsChange(value === true)}
        />
        Add assets found later when they match a rule
      </label>
    </div>
  );
}
