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
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  useProjectsControllerCreateWorkflow,
  useProjectsControllerGetMany,
  useProjectsControllerGetWorkflowTemplates,
  useProjectsControllerGetWorkflows,
  useProjectsControllerUpdateWorkflow,
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
import { usePipelineTools } from './use-pipeline-tools';
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
  const t = useT();
  const invalidate = useInvalidateProjects();
  const editing = !!binding;
  const toolsQuery = usePipelineTools({ enabled: open });
  const { tools, installableTools } = toolsQuery;
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
  // The ones this workflow can run after: every other workflow of the project.
  const projectWorkflows = useProjectsControllerGetWorkflows(projectId, {
    query: { enabled: open },
  });
  const otherWorkflows = useMemo(
    () =>
      (projectWorkflows.data ?? [])
        .filter((other) => other.id !== binding?.id && other.workflow?.name)
        .map((other) => other.workflow.name),
    [projectWorkflows.data, binding?.id],
  );

  // Reset on open (and once the tools arrive) only, so a refetch — or a tool
  // installed from the picker — does not wipe a pipeline being edited.
  const latest = useRef({ binding, tools });
  latest.current = { binding, tools };
  const toolsLoaded = !toolsQuery.isLoading;
  useEffect(() => {
    if (!open || !toolsLoaded) return;
    const { binding, tools } = latest.current;
    setName(binding ? workflowLabel(binding.workflow) : '');
    setSource(binding ? 'tools' : 'template');
    setTemplate(undefined);
    setCopyProject(undefined);
    setCopyBinding(undefined);
    setEntries(binding ? entriesFromContent(binding.workflow.content, tools) : []);
    setTriggers(draftFromTriggers(binding?.triggers));
  }, [open, binding?.id, toolsLoaded]);

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
    toast.error(apiErrorMessage(error, t('projects.workflowEditor.saveFailed')));

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
        { onSuccess: () => done(t('projects.workflowEditor.saved')), onError: failed },
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
      { onSuccess: () => done(t('projects.workflowEditor.added')), onError: failed },
    );
  };

  const builder = toolsQuery.isLoading ? (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {t('projects.create.loadingTools')}
    </p>
  ) : tools.length === 0 && installableTools.length === 0 ? (
    <NoInstalledToolsState />
  ) : (
    <ToolPipelineBuilder
      tools={tools}
      installableTools={installableTools}
      value={entries}
      onChange={setEntries}
    />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{editing ? t('projects.workflowEditor.editTitle') : t('projects.workflows.add')}</SheetTitle>
          <SheetDescription>
            {t('projects.workflowEditor.description')}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4">
          <div className="flex max-w-md flex-col gap-2">
            <Label htmlFor="workflow-name">{t('common.name')}</Label>
            <Input
              id="workflow-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={editing ? undefined : t('projects.workflowEditor.namePlaceholder')}
            />
          </div>
          {editing ? (
            builder
          ) : (
            <Tabs value={source} onValueChange={(value) => setSource(value as Source)}>
              <TabsList>
                <TabsTrigger value="template">{t('projects.create.fromTemplate')}</TabsTrigger>
                <TabsTrigger value="tools">{t('projects.create.pickTools')}</TabsTrigger>
                <TabsTrigger value="copy">{t('projects.workflowEditor.copyFromProject')}</TabsTrigger>
              </TabsList>
              <TabsContent value="template" className="flex flex-col gap-2 pt-3">
                {(templatesQuery.data ?? []).map((tpl) => (
                  <button
                    key={tpl.filePath}
                    type="button"
                    onClick={() => setTemplate(tpl.filePath)}
                    aria-pressed={template === tpl.filePath}
                    className={cn(
                      'flex flex-col gap-2 rounded-md border p-3 text-left hover:bg-accent/50',
                      template === tpl.filePath && 'border-primary bg-primary/5',
                    )}
                  >
                    <span className="text-sm font-medium">{tpl.name}</span>
                    <PipelineSteps
                      steps={pipelineSteps({
                        name: tpl.name,
                        jobs: Object.fromEntries(
                          tpl.jobs.map((job) => [job.id, { run: job.run, needs: job.needs }]),
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
                  <SelectTrigger aria-label={t('projects.workflowEditor.copyProjectLabel')}>
                    <SelectValue placeholder={t('projects.workflowEditor.pickProject')} />
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
                  {t('projects.workflowEditor.copyHint')}
                </p>
              </TabsContent>
            </Tabs>
          )}
          <div className="border-t pt-5">
            <WorkflowTriggersForm
              value={triggers}
              onChange={setTriggers}
              otherWorkflows={otherWorkflows}
            />
          </div>
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!canSave || pending} onClick={save}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {editing ? t('common.save') : t('projects.workflows.add')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
