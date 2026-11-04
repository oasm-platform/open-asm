import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CronScheduleBuilder,
  type CronScheduleChange,
} from '@/components/ui/cron-schedule-builder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ProjectTriggerType,
  TargetType,
  type ProjectWorkflowOnDto,
  type ProjectWorkflowTrigger,
} from '@/services/apis/gen/queries';
import { Plus, Trash2 } from 'lucide-react';
import {
  memo,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';

/**
 * When a project workflow runs on its own, as the workflow editor and the
 * create wizard edit it. It is saved as the workflow's `on:` block
 * (docs/workflows.md): schedules, and a run when assets join the project.
 * Each entry has an "Active" switch: off keeps it without running it.
 */

export interface ScheduleDraft {
  /** Row id of a saved schedule; a local id for a new one. */
  id: string;
  cron?: string;
  enabled: boolean;
}

export interface TriggersDraft {
  schedules: ScheduleDraft[];
  assetsAdded: {
    on: boolean;
    enabled: boolean;
    windowMinutes: number;
    maxAssets: number;
    targetTypes: TargetType[];
  };
}

const TARGET_TYPES: Array<{ value: TargetType; label: string }> = [
  { value: TargetType.DOMAIN, label: 'Domains' },
  { value: TargetType.IP, label: 'IPs' },
  { value: TargetType.CIDR, label: 'CIDR ranges' },
  { value: TargetType.GIT_ORG, label: 'Repositories' },
];

let nextLocalId = 0;
const localId = () => `new-${++nextLocalId}`;

/** A draft from a workflow's trigger rows (none: runs only when started). */
export function draftFromTriggers(
  triggers: ProjectWorkflowTrigger[] | undefined,
): TriggersDraft {
  const rows = triggers ?? [];
  const assets = rows.find((t) => t.type === ProjectTriggerType.assets_added);
  return {
    schedules: rows
      .filter((t) => t.type === ProjectTriggerType.cron && t.cron)
      .map((t) => ({ id: t.id, cron: t.cron ?? undefined, enabled: t.enabled })),
    assetsAdded: {
      on: !!assets,
      enabled: assets?.enabled ?? true,
      windowMinutes: assets?.config?.windowMinutes ?? 10,
      maxAssets: assets?.config?.maxAssets ?? 200,
      targetTypes: (assets?.config?.targetTypes ?? []) as TargetType[],
    },
  };
}

/** A draft for a new workflow: one schedule to pick, and new assets on. */
export function newTriggersDraft(): TriggersDraft {
  return {
    schedules: [{ id: localId(), enabled: true }],
    assetsAdded: {
      on: true,
      enabled: true,
      windowMinutes: 10,
      maxAssets: 200,
      targetTypes: [],
    },
  };
}

const normalizeCron = (cron: string) => cron.trim().replace(/\s+/g, ' ');

/**
 * For each schedule, the index of an earlier one at the same time (the API
 * keeps one of them only), or -1.
 */
export function duplicateSchedules(schedules: ScheduleDraft[]): number[] {
  const first = new Map<string, number>();
  return schedules.map((s, index) => {
    if (!s.cron) return -1;
    const cron = normalizeCron(s.cron);
    const earlier = first.get(cron);
    if (earlier !== undefined) return earlier;
    first.set(cron, index);
    return -1;
  });
}

/**
 * Every schedule has its own time and the "assets added" numbers are in
 * range.
 */
export function isTriggersDraftValid(draft: TriggersDraft): boolean {
  const { assetsAdded } = draft;
  return (
    draft.schedules.every((s) => !!s.cron) &&
    duplicateSchedules(draft.schedules).every((earlier) => earlier < 0) &&
    (!assetsAdded.on ||
      (assetsAdded.windowMinutes >= 0 &&
        assetsAdded.windowMinutes <= 1440 &&
        assetsAdded.maxAssets >= 1 &&
        assetsAdded.maxAssets <= 5000))
  );
}

/** The API's `on` for a draft. */
export function onInputOf(draft: TriggersDraft): ProjectWorkflowOnDto {
  const { on, enabled, windowMinutes, maxAssets, targetTypes } = draft.assetsAdded;
  return {
    schedule: draft.schedules
      .filter((s) => s.cron)
      .map((s) => ({ cron: s.cron!, enabled: s.enabled })),
    assetsAdded: on
      ? { enabled, windowMinutes, maxAssets, targetTypes }
      : null,
  };
}

const ScheduleRow = memo(function ScheduleRow({
  schedule,
  index,
  duplicateOf,
  disabled,
  onCron,
  onEnabled,
  onRemove,
}: {
  schedule: ScheduleDraft;
  index: number;
  /** Index of an earlier schedule at the same time, or -1. */
  duplicateOf: number;
  disabled?: boolean;
  onCron: (id: string, cron: string) => void;
  onEnabled: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}) {
  // Stable per row: the builder reports its cron whenever this changes.
  const handleChange = useCallback(
    (change: CronScheduleChange) => onCron(schedule.id, change.cron),
    [onCron, schedule.id],
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Schedule {index + 1}</span>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Active
          <Switch
            checked={schedule.enabled}
            disabled={disabled}
            onCheckedChange={(value) => onEnabled(schedule.id, value)}
            aria-label={`Schedule ${index + 1} active`}
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => onRemove(schedule.id)}
          aria-label={`Remove schedule ${index + 1}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <CronScheduleBuilder
        key={schedule.id}
        defaultValue={schedule.cron}
        onChange={handleChange}
      />
      {duplicateOf >= 0 && (
        <p className="text-sm text-destructive">
          Same time as Schedule {duplicateOf + 1}. Pick another time or remove it.
        </p>
      )}
    </div>
  );
});

export function WorkflowTriggersForm({
  value,
  onChange,
  disabled,
}: {
  value: TriggersDraft;
  /** A state setter: updates are functional, so callbacks stay stable. */
  onChange: Dispatch<SetStateAction<TriggersDraft>>;
  disabled?: boolean;
}) {
  const patchSchedule = useCallback(
    (id: string, patch: Partial<ScheduleDraft>) =>
      onChange((prev) => {
        const current = prev.schedules.find((s) => s.id === id);
        if (
          !current ||
          Object.entries(patch).every(
            ([key, v]) => current[key as keyof ScheduleDraft] === v,
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          schedules: prev.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        };
      }),
    [onChange],
  );
  const onCron = useCallback(
    (id: string, cron: string) => patchSchedule(id, { cron }),
    [patchSchedule],
  );
  const onEnabled = useCallback(
    (id: string, enabled: boolean) => patchSchedule(id, { enabled }),
    [patchSchedule],
  );
  const onRemove = useCallback(
    (id: string) =>
      onChange((prev) => ({
        ...prev,
        schedules: prev.schedules.filter((s) => s.id !== id),
      })),
    [onChange],
  );
  const setAssets = (patch: Partial<TriggersDraft['assetsAdded']>) =>
    onChange((prev) => ({ ...prev, assetsAdded: { ...prev.assetsAdded, ...patch } }));
  const assets = value.assetsAdded;
  const duplicates = duplicateSchedules(value.schedules);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label>When it runs</Label>
        <p className="text-sm text-muted-foreground">
          Every run scans this project&apos;s assets. Times show in your
          timezone and are stored in UTC. With nothing here, the workflow runs
          only when started.
        </p>
      </div>

      {value.schedules.map((schedule, index) => (
        <ScheduleRow
          key={schedule.id}
          schedule={schedule}
          index={index}
          duplicateOf={duplicates[index]}
          disabled={disabled}
          onCron={onCron}
          onEnabled={onEnabled}
          onRemove={onRemove}
        />
      ))}
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              schedules: [...prev.schedules, { id: localId(), enabled: true }],
            }))
          }
        >
          <Plus className="size-4" />
          Add schedule
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={assets.on}
              disabled={disabled}
              onCheckedChange={(checked) => setAssets({ on: checked === true })}
            />
            When assets join the project
          </label>
          {assets.on && (
            <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              Active
              <Switch
                checked={assets.enabled}
                disabled={disabled}
                onCheckedChange={(enabled) => setAssets({ enabled })}
                aria-label="Assets added active"
              />
            </label>
          )}
        </div>
        {assets.on ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="assets-window">Gather for (minutes)</Label>
                <Input
                  id="assets-window"
                  type="number"
                  min={0}
                  max={1440}
                  disabled={disabled}
                  value={assets.windowMinutes}
                  onChange={(e) => setAssets({ windowMinutes: Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">
                  Assets found within this window go into one run.
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="assets-max">Most assets per run</Label>
                <Input
                  id="assets-max"
                  type="number"
                  min={1}
                  max={5000}
                  disabled={disabled}
                  value={assets.maxAssets}
                  onChange={(e) => setAssets({ maxAssets: Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">
                  More start further runs right away.
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm">Only assets of</span>
              <div className="flex flex-wrap gap-4">
                {TARGET_TYPES.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={assets.targetTypes.includes(t.value)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        setAssets({
                          targetTypes: checked
                            ? [...assets.targetTypes, t.value]
                            : assets.targetTypes.filter((v) => v !== t.value),
                        })
                      }
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                None checked = every new asset.
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Scans only the assets that joined, not the whole scope.
          </p>
        )}
      </div>
    </div>
  );
}
