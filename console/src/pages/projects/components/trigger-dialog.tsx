import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CronScheduleBuilder } from '@/components/ui/cron-schedule-builder';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ProjectTriggerType,
  TargetType,
  useProjectsControllerCreateTrigger,
  useProjectsControllerUpdateTrigger,
  type ProjectWorkflow,
  type ProjectWorkflowTrigger,
} from '@/services/apis/gen/queries';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  useInvalidateProjects,
  workflowLabel,
} from '../project-utils';

const TARGET_TYPES: Array<{ value: TargetType; label: string }> = [
  { value: TargetType.DOMAIN, label: 'Domains' },
  { value: TargetType.IP, label: 'IPs' },
  { value: TargetType.CIDR, label: 'CIDR ranges' },
  { value: TargetType.GIT_ORG, label: 'Repositories' },
];

/** Adds a cron or "assets added" trigger, or edits one. */
export function TriggerDialog({
  projectId,
  workflows,
  open,
  onOpenChange,
  trigger,
}: {
  projectId: string;
  workflows: ProjectWorkflow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ProjectWorkflowTrigger;
}) {
  const invalidate = useInvalidateProjects();
  const create = useProjectsControllerCreateTrigger();
  const update = useProjectsControllerUpdateTrigger();
  const [binding, setBinding] = useState<string>();
  const [type, setType] = useState<ProjectTriggerType>(ProjectTriggerType.cron);
  const [cron, setCron] = useState<string>();
  const [windowMinutes, setWindowMinutes] = useState(10);
  const [maxAssets, setMaxAssets] = useState(200);
  const [targetTypes, setTargetTypes] = useState<TargetType[]>([]);

  // Reset on open only: keyed by ids, so a background refetch does not wipe
  // what is being typed.
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;
  const firstBinding = workflows[0]?.id;
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    setBinding(trigger?.projectWorkflowId ?? firstBinding);
    setType(trigger?.type ?? ProjectTriggerType.cron);
    setCron(trigger?.cron ?? undefined);
    setWindowMinutes(trigger?.config?.windowMinutes ?? 10);
    setMaxAssets(trigger?.config?.maxAssets ?? 200);
    setTargetTypes((trigger?.config?.targetTypes ?? []) as TargetType[]);
  }, [open, trigger?.id, firstBinding]);

  const config = { windowMinutes, maxAssets, targetTypes };
  const isCron = type === ProjectTriggerType.cron;
  const canSave = !!binding && (isCron ? !!cron : maxAssets >= 1 && windowMinutes >= 0);

  const done = () => {
    toast.success(trigger ? 'Trigger saved' : 'Trigger added');
    void invalidate();
    onOpenChange(false);
  };
  const failed = (error: unknown) =>
    toast.error(apiErrorMessage(error, 'Failed to save the trigger'));

  const save = () => {
    if (trigger) {
      update.mutate(
        {
          id: projectId,
          triggerId: trigger.id,
          data: isCron ? { cron } : { config },
        },
        { onSuccess: done, onError: failed },
      );
      return;
    }
    create.mutate(
      {
        id: projectId,
        data: {
          projectWorkflowId: binding!,
          type,
          ...(isCron ? { cron } : { config }),
        },
      },
      { onSuccess: done, onError: failed },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trigger ? 'Edit trigger' : 'Add trigger'}</DialogTitle>
          <DialogDescription>
            When the workflow runs on its own. Times show in your timezone and
            are stored in UTC.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Workflow</Label>
            <Select value={binding} onValueChange={setBinding} disabled={!!trigger}>
              <SelectTrigger aria-label="Workflow">
                <SelectValue placeholder="Pick a workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {workflowLabel(w.workflow)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!trigger && (
            <RadioGroup
              value={type}
              onValueChange={(value) => setType(value as ProjectTriggerType)}
              className="grid gap-2 sm:grid-cols-2"
            >
              <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value={ProjectTriggerType.cron} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">On a schedule</span>
                  <span className="text-xs text-muted-foreground">
                    Scans the whole scope at set times
                  </span>
                </span>
              </Label>
              <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value={ProjectTriggerType.assets_added} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">When assets join the project</span>
                  <span className="text-xs text-muted-foreground">
                    Scans only the new assets, not the whole scope
                  </span>
                </span>
              </Label>
            </RadioGroup>
          )}
          {isCron ? (
            <CronScheduleBuilder
              key={trigger?.id ?? 'new'}
              defaultValue={trigger?.cron ?? undefined}
              onChange={(change) => setCron(change.cron)}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="trigger-window">Gather for (minutes)</Label>
                  <Input
                    id="trigger-window"
                    type="number"
                    min={0}
                    max={1440}
                    value={windowMinutes}
                    onChange={(e) => setWindowMinutes(Number(e.target.value))}
                  />
                  <span className="text-xs text-muted-foreground">
                    Assets found within this window go into one run, so a
                    discovery of 500 subdomains does not start 500 runs.
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="trigger-max">Most assets per run</Label>
                  <Input
                    id="trigger-max"
                    type="number"
                    min={1}
                    max={5000}
                    value={maxAssets}
                    onChange={(e) => setMaxAssets(Number(e.target.value))}
                  />
                  <span className="text-xs text-muted-foreground">
                    More start further runs right away.
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Only assets of</Label>
                <div className="flex flex-wrap gap-4">
                  {TARGET_TYPES.map((t) => (
                    <label key={t.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={targetTypes.includes(t.value)}
                        onCheckedChange={(checked) =>
                          setTargetTypes((prev) =>
                            checked ? [...prev, t.value] : prev.filter((v) => v !== t.value),
                          )
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
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || create.isPending || update.isPending} onClick={save}>
            {trigger ? 'Save' : 'Add trigger'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
