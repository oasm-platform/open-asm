import { fromNow } from '@/lib/date-locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  WorkflowFileSheet,
  workflowYaml,
} from '@/components/common/workflow-file-sheet';
import JobStatusBadge from '@/components/ui/job-status';
import { formatCronLabel, getLocalTimezone } from '@/lib/cron-schedule';
import { useT } from '@/lib/i18n-dictionary';
import {
  ProjectTriggerType,
  useProjectsControllerRemoveWorkflow,
  type JobStatus,
  type ProjectWorkflow,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import {
  CalendarClock,
  Pencil,
  Play,
  Plus,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PipelineSteps } from '../components/pipeline-steps';
import { WorkflowEditorSheet } from '../components/workflow-editor-sheet';
import {
  apiErrorMessage,
  pipelineSteps,
  runTriggerLabel,
  TRIGGER_EVENT_LABELS,
  useInvalidateProjects,
  workflowLabel,
} from '../project-utils';


function WorkflowCard({
  projectId,
  binding,
  archived,
  onRun,
  onEdit,
}: {
  projectId: string;
  binding: ProjectWorkflow;
  archived: boolean;
  onRun: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const timezone = getLocalTimezone();
  const invalidate = useInvalidateProjects();
  const remove = useProjectsControllerRemoveWorkflow();
  const [confirm, setConfirm] = useState(false);
  const owned = binding.workflow.filePath?.includes(projectId) ?? true;
  const lastRun = binding.lastRun;

  const handleRemove = () =>
    remove.mutate(
      { id: projectId, bindingId: binding.id },
      {
        onSuccess: () => {
          toast.success(t('projects.workflows.removed'));
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, t('projects.workflows.removeFailed'))),
      },
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Workflow className="size-5 text-primary" />
          {workflowLabel(binding.workflow)}
        </CardTitle>
        <Button disabled={archived} onClick={onRun}>
          <Play className="size-4" />
          {t('projects.detail.run')}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PipelineSteps steps={pipelineSteps(binding.workflow.content)} />
        <div className="flex flex-wrap gap-1.5">
          {(binding.triggers ?? []).length === 0 && (
            <Badge variant="outline" className="font-normal">
              {t('projects.list.manualOnly')}
            </Badge>
          )}
          {(binding.triggers ?? []).map((trigger) =>
            trigger.type === ProjectTriggerType.cron ? (
              <Badge
                key={trigger.id}
                variant="outline"
                className="gap-1 font-normal"
                title={trigger.cron ?? undefined}
              >
                <CalendarClock className="size-3" />
                {formatCronLabel(trigger.cron ?? '', timezone) ?? trigger.cron}
                {!trigger.enabled && t('projects.workflows.offSuffix')}
              </Badge>
            ) : (
              <Badge key={trigger.id} variant="outline" className="gap-1 font-normal">
                <Zap className="size-3" />
                {trigger.event ? TRIGGER_EVENT_LABELS[trigger.event] : t('projects.runTrigger.event')}
                {!trigger.enabled && t('projects.workflows.offSuffix')}
              </Badge>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
          {lastRun ? (
            <>
              <JobStatusBadge status={lastRun.status as JobStatus} />
              <Link
                to="/jobs/runs/$id"
                params={{ id: lastRun.id }}
                className="hover:underline"
              >
                {fromNow(lastRun.createdAt)}
              </Link>
              <span>· {runTriggerLabel(lastRun.jobRunType, lastRun.triggerEvent)}</span>
            </>
          ) : (
            <span>{t('projects.workflows.neverRun')}</span>
          )}
          <span className="ml-auto flex gap-1">
            <WorkflowFileSheet
              yaml={workflowYaml(binding.workflow.content)}
              description={t('projects.workflows.fileDescription')}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={archived || !owned}
              title={owned ? undefined : t('projects.workflows.notOwned')}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
              {t('common.edit')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={archived}
              aria-label={t('projects.workflows.removeTitle')}
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('projects.workflows.removeTitle')}
        description={t('projects.workflows.removeDescription', {
          name: workflowLabel(binding.workflow),
        })}
        onConfirm={handleRemove}
        typeToConfirm="delete"
        disabled={remove.isPending}
      />
    </Card>
  );
}

export function WorkflowsTab({
  projectId,
  workflows,
  archived,
  onRun,
}: {
  projectId: string;
  workflows: ProjectWorkflow[];
  archived: boolean;
  onRun: (bindingId: string) => void;
}) {
  const t = useT();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectWorkflow | undefined>();

  const openEditor = (binding?: ProjectWorkflow) => {
    setEditing(binding);
    setEditorOpen(true);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {workflows.map((binding) => (
        <WorkflowCard
          key={binding.id}
          projectId={projectId}
          binding={binding}
          archived={archived}
          onRun={() => onRun(binding.id)}
          onEdit={() => openEditor(binding)}
        />
      ))}
      <button
        type="button"
        disabled={archived}
        onClick={() => openEditor()}
        className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:bg-accent/70 disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="size-5" />
        <span className="font-medium text-foreground">{t('projects.workflows.add')}</span>
        <span className="text-sm">{t('projects.workflows.addHint')}</span>
      </button>
      <WorkflowEditorSheet
        projectId={projectId}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        binding={editing}
      />
    </div>
  );
}
