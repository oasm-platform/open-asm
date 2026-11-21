import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import useDebounce from '@/hooks/use-debounce';
import { useT } from '@/lib/i18n-dictionary';
import {
  useProjectsControllerGetAssets,
  useProjectsControllerRunWorkflow,
  type ProjectWorkflow,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { LoaderCircle, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  assetCount,
  useInvalidateProjects,
  workflowLabel,
} from '../project-utils';

interface RunWorkflowDialogProps {
  projectId: string;
  workflows: ProjectWorkflow[];
  totalAssets: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workflow to preselect; the first one otherwise. */
  bindingId?: string;
}

/** Manual run of a project workflow on the whole scope or some assets. */
export function RunWorkflowDialog({
  projectId,
  workflows,
  totalAssets,
  open,
  onOpenChange,
  bindingId,
}: RunWorkflowDialogProps) {
  const t = useT();
  const navigate = useNavigate();
  const invalidate = useInvalidateProjects();
  const [selectedBinding, setSelectedBinding] = useState(bindingId);
  const [scope, setScope] = useState<'all' | 'some'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);

  // Reset on open only: keyed by ids, so a background refetch of the
  // project does not wipe the selection.
  const firstBinding = workflows[0]?.id;
  useEffect(() => {
    if (open) {
      setSelectedBinding(bindingId ?? firstBinding);
      setScope('all');
      setPicked(new Set());
      setSearch('');
    }
  }, [open, bindingId, firstBinding]);

  const assetsQuery = useProjectsControllerGetAssets(
    projectId,
    { page: 1, limit: 50, search: debounced, sortBy: 'value', sortOrder: 'ASC' },
    { query: { enabled: open && scope === 'some' } },
  );

  const { mutate, isPending } = useProjectsControllerRunWorkflow();

  const run = () => {
    if (!selectedBinding) return;
    mutate(
      {
        id: projectId,
        bindingId: selectedBinding,
        data: scope === 'some' ? { assetIds: [...picked] } : {},
      },
      {
        onSuccess: (result) => {
          toast.success(t('projects.runDialog.started', { assets: assetCount(result.assets) }), {
            action: {
              label: t('projects.runDialog.openRun'),
              onClick: () =>
                navigate({ to: '/jobs/runs/$id', params: { id: result.jobHistoryId } }),
            },
          });
          void invalidate();
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, t('projects.runDialog.failed'))),
      },
    );
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canRun =
    !!selectedBinding && (scope === 'all' ? totalAssets > 0 : picked.size > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('projects.runDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('projects.runDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {workflows.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label>{t('projects.schedule.colWorkflow')}</Label>
              <Select value={selectedBinding} onValueChange={setSelectedBinding}>
                <SelectTrigger aria-label={t('projects.schedule.colWorkflow')}>
                  <SelectValue placeholder={t('projects.runDialog.pickWorkflow')} />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((binding) => (
                    <SelectItem key={binding.id} value={binding.id}>
                      {workflowLabel(binding.workflow)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <RadioGroup
            value={scope}
            onValueChange={(value) => setScope(value as 'all' | 'some')}
            className="gap-2"
          >
            <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="all" className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t('projects.runDialog.wholeScope')}</span>
                <span className="text-xs text-muted-foreground">
                  {t('projects.runDialog.inProject', { assets: assetCount(totalAssets) })}
                </span>
              </span>
            </Label>
            <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="some" className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t('projects.runDialog.selectedAssets')}</span>
                <span className="text-xs text-muted-foreground">
                  {t('projects.runDialog.selectedHint')}
                </span>
              </span>
            </Label>
          </RadioGroup>
          {scope === 'some' && (
            <div className="flex flex-col gap-2">
              <Input
                placeholder={t('projects.runDialog.searchAssets')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {assetsQuery.isLoading ? (
                  <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3 animate-spin" />
                    {t('projects.runDialog.loadingAssets')}
                  </p>
                ) : (assetsQuery.data?.data ?? []).length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">{t('projects.runDialog.noAssets')}</p>
                ) : (
                  (assetsQuery.data?.data ?? []).map((asset) => (
                    <label
                      key={asset.id}
                      className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={picked.has(asset.id)}
                        onCheckedChange={() => toggle(asset.id)}
                        aria-label={t('projects.runDialog.selectAria', { value: asset.value })}
                      />
                      <span className="truncate text-sm">{asset.value}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('projects.runDialog.selected', { n: picked.size })}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!canRun || isPending} onClick={run}>
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {t('projects.detail.run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
