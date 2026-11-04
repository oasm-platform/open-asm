import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  useProjectsControllerCreateWorkflow,
  useProjectsControllerGetMany,
  useProjectsControllerGetWorkflowTemplates,
  useProjectsControllerGetWorkflows,
  useProjectsControllerUpdateWorkflow,
  useToolsControllerGetInstalledTools,
  type ProjectWorkflow,
} from '@/services/apis/gen/queries';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  entriesFromContent,
  pipelineSteps,
  toToolInputs,
  useInvalidateProjects,
  workflowLabel,
} from '../project-utils';
import { NoInstalledToolsState } from './no-installed-tools-state';
import { PipelineSteps } from './pipeline-steps';
import {
  isPipelineValid,
  ToolPipelineBuilder,
  type PipelineToolEntry,
} from './tool-pipeline-builder';
import {
  draftFromTriggers,
  isTriggersDraftValid,
  onInputOf,
  WorkflowTriggersForm,
  type TriggersDraft,
} from './workflow-triggers-form';

type Source = 'template' | 'tools' | 'copy';

/** Creates a project workflow, or edits one: name, pipeline and when it runs. */
export function WorkflowEditorSheet({
  projectId,
  open,
  onOpenChange,
  binding,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this workflow; create a new one when absent. */
  binding?: ProjectWorkflow;
}) {
  const invalidate = useInvalidateProjects();
  const editing = !!binding;
  const toolsQuery = useToolsControllerGetInstalledTools();
  const tools = useMemo(() => toolsQuery.data?.data ?? [], [toolsQuery.data?.data]);
  const templatesQuery = useProjectsControllerGetWorkflowTemplates({
    query: { enabled: open && !editing },
  });
  const projectsQuery = useProjectsControllerGetMany(
    { page: 1, limit: 50, sortBy: 'name', sortOrder: 'ASC', status: 'all' },
    { query: { enabled: open && !editing } },
  );

  const [name, setName] = useState('');
  const [source, setSource] = useState<Source>('template');
  const [template, setTemplate] = useState<string>();
  const [entries, setEntries] = useState<PipelineToolEntry[]>([]);
  const [copyProject, setCopyProject] = useState<string>();
  const [copyBinding, setCopyBinding] = useState<string>();
  const [triggers, setTriggers] = useState<TriggersDraft>(() =>
    draftFromTriggers(undefined),
  );
  const copyWorkflows = useProjectsControllerGetWorkflows(copyProject ?? '', {
    query: { enabled: !!copyProject },
  });

  // Reset on open (and once the tools arrive) only: keyed by ids, so a
  // background refetch does not wipe a pipeline being edited.
  const latest = useRef({ binding, tools });
  latest.current = { binding, tools };
  const toolKey = tools.map((tool) => tool.id).join(',');
  useEffect(() => {
    if (!open) return;
    const { binding, tools } = latest.current;
    setName(binding ? workflowLabel(binding.workflow) : '');
    setSource(binding ? 'tools' : 'template');
    setTemplate(undefined);
    setCopyProject(undefined);
    setCopyBinding(undefined);
    setEntries(binding ? entriesFromContent(binding.workflow.content, tools) : []);
    setTriggers(draftFromTriggers(binding?.triggers));
  }, [open, binding?.id, toolKey]);

  const create = useProjectsControllerCreateWorkflow();
  const update = useProjectsControllerUpdateWorkflow();
  const pending = create.isPending || update.isPending;

  const byId = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools]);
  const canSave =
    isTriggersDraftValid(triggers) &&
    (source === 'template'
      ? !!template
      : source === 'copy'
        ? !!copyBinding
        : entries.length > 0 && isPipelineValid(entries, byId));

  const done = (message: string) => {
    toast.success(message);
    void invalidate();
    onOpenChange(false);
  };
  const failed = (error: unknown) =>
    toast.error(apiErrorMessage(error, 'Failed to save the workflow'));

  const save = () => {
    const trimmed = name.trim() || undefined;
    if (binding) {
      update.mutate(
        {
          id: projectId,
          bindingId: binding.id,
          data: {
            name: trimmed,
            tools: toToolInputs(entries),
            on: onInputOf(triggers),
          },
        },
        { onSuccess: () => done('Workflow saved'), onError: failed },
      );
      return;
    }
    create.mutate(
      {
        id: projectId,
        data: {
          name: trimmed,
          ...(source === 'template' ? { template } : {}),
          ...(source === 'tools' ? { tools: toToolInputs(entries) } : {}),
          ...(source === 'copy' ? { copyFromProjectWorkflowId: copyBinding } : {}),
          on: onInputOf(triggers),
        },
      },
      { onSuccess: () => done('Workflow added'), onError: failed },
    );
  };

  const builder = toolsQuery.isLoading ? (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      Loading installed tools...
    </p>
  ) : tools.length === 0 ? (
    <NoInstalledToolsState />
  ) : (
    <ToolPipelineBuilder tools={tools} value={entries} onChange={setEntries} />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{editing ? 'Edit workflow' : 'Add workflow'}</SheetTitle>
          <SheetDescription>
            Tools of one step run together; the next step starts when they are
            done. The workflow runs on this project's assets only, when started
            or on its own as set below.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4">
          <div className="flex max-w-md flex-col gap-2">
            <Label htmlFor="workflow-name">Name</Label>
            <Input
              id="workflow-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={editing ? undefined : 'e.g. Recon and vulnerability scan'}
            />
          </div>
          {editing ? (
            builder
          ) : (
            <Tabs value={source} onValueChange={(value) => setSource(value as Source)}>
              <TabsList>
                <TabsTrigger value="template">From a template</TabsTrigger>
                <TabsTrigger value="tools">Pick tools</TabsTrigger>
                <TabsTrigger value="copy">Copy from a project</TabsTrigger>
              </TabsList>
              <TabsContent value="template" className="flex flex-col gap-2 pt-3">
                {(templatesQuery.data ?? []).map((t) => (
                  <button
                    key={t.filePath}
                    type="button"
                    onClick={() => setTemplate(t.filePath)}
                    aria-pressed={template === t.filePath}
                    className={cn(
                      'flex flex-col gap-2 rounded-md border p-3 text-left hover:bg-accent/50',
                      template === t.filePath && 'border-primary bg-primary/5',
                    )}
                  >
                    <span className="text-sm font-medium">{t.name}</span>
                    <PipelineSteps
                      steps={pipelineSteps({
                        name: t.name,
                        jobs: Object.fromEntries(
                          t.jobs.map((job) => [job.id, { run: job.run, needs: job.needs }]),
                        ),
                      })}
                    />
                  </button>
                ))}
              </TabsContent>
              <TabsContent value="tools" className="pt-3">
                {builder}
              </TabsContent>
              <TabsContent value="copy" className="flex flex-col gap-3 pt-3">
                <Select
                  value={copyProject}
                  onValueChange={(value) => {
                    setCopyProject(value);
                    setCopyBinding(undefined);
                  }}
                >
                  <SelectTrigger aria-label="Project to copy from">
                    <SelectValue placeholder="Pick a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projectsQuery.data?.data ?? [])
                      .filter((p) => p.id !== projectId && p.workflowCount > 0)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {(copyWorkflows.data ?? []).map((other) => (
                  <button
                    key={other.id}
                    type="button"
                    onClick={() => setCopyBinding(other.id)}
                    aria-pressed={copyBinding === other.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-md border p-3 text-left hover:bg-accent/50',
                      copyBinding === other.id && 'border-primary bg-primary/5',
                    )}
                  >
                    <span className="text-sm font-medium">
                      {workflowLabel(other.workflow)}
                    </span>
                    <PipelineSteps steps={pipelineSteps(other.workflow.content)} />
                  </button>
                ))}
                <p className="text-xs text-muted-foreground">
                  The copy is independent: editing it does not change the original.
                </p>
              </TabsContent>
            </Tabs>
          )}
          <div className="border-t pt-5">
            <WorkflowTriggersForm value={triggers} onChange={setTriggers} />
          </div>
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || pending} onClick={save}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {editing ? 'Save' : 'Add workflow'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
