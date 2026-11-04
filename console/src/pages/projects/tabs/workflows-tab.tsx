import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import JobStatusBadge from '@/components/ui/job-status';
import { formatCronLabel, getLocalTimezone } from '@/lib/cron-schedule';
import {
  ProjectTriggerType,
  useProjectsControllerRemoveWorkflow,
  type JobStatus,
  type ProjectWorkflow,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
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
  useInvalidateProjects,
  workflowLabel,
} from '../project-utils';

dayjs.extend(relativeTime);

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
          toast.success('Workflow removed');
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Failed to remove the workflow')),
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
          Run
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PipelineSteps steps={pipelineSteps(binding.workflow.content)} />
        <div className="flex flex-wrap gap-1.5">
          {(binding.triggers ?? []).length === 0 && (
            <Badge variant="outline" className="font-normal">
              Manual only
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
                {!trigger.enabled && ' (off)'}
              </Badge>
            ) : (
              <Badge key={trigger.id} variant="outline" className="gap-1 font-normal">
                <Zap className="size-3" />
                Assets added
                {!trigger.enabled && ' (off)'}
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
                {dayjs(lastRun.createdAt).fromNow()}
              </Link>
              <span>· {runTriggerLabel(lastRun.jobRunType)}</span>
            </>
          ) : (
            <span>Never run</span>
          )}
          <span className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={archived || !owned}
              title={owned ? undefined : 'Not owned by this project'}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
              Edit pipeline
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/projects/$id/$tab" params={{ id: projectId, tab: 'schedule' }}>
                <CalendarClock className="size-4" />
                Triggers
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={archived}
              aria-label="Remove workflow"
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
        title="Remove workflow"
        description={`Remove "${workflowLabel(binding.workflow)}"? Its triggers and run history are deleted with it. Vulnerabilities stay.`}
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
        <span className="font-medium text-foreground">Add workflow</span>
        <span className="text-sm">From a template, your own tools, or a copy</span>
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
