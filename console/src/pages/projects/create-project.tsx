'use client';

import Page from '@/components/common/page';
import {
  isPipelineValid,
  ToolPipelineBuilder,
  type PipelineToolEntry,
} from '@/pages/projects/components/tool-pipeline-builder';
import { NoInstalledToolsState } from '@/pages/projects/components/no-installed-tools-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/reui/stepper';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { cn } from '@/lib/utils';
import {
  useAssetsControllerGetHostAssets,
  useProjectsControllerCreate,
  useProjectsControllerGetWorkflowTemplates,
  useToolsControllerGetInstalledTools,
  type CreateProjectDto,
  type Project,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from '@tanstack/react-router';
import {
  CheckIcon,
  FileTextIcon,
  LoaderCircleIcon,
  ScanSearchIcon,
  WorkflowIcon,
  ZapIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMemo, useState } from 'react';
import { PipelineSteps } from './components/pipeline-steps';
import {
  isCompleteRule,
  ScopeRulesEditor,
  type EditableScopeRule,
} from './components/scope-rules-editor';
import {
  isTriggersDraftValid,
  newTriggersDraft,
  onInputOf,
  WorkflowTriggersForm,
  type TriggersDraft,
} from './components/workflow-triggers-form';
import { apiErrorMessage, pipelineSteps, toToolInputs } from './project-utils';

const STEPS = [
  { title: 'Info', icon: <FileTextIcon className="size-4" /> },
  { title: 'Scope', icon: <ScanSearchIcon className="size-4" /> },
  { title: 'Pipeline', icon: <WorkflowIcon className="size-4" /> },
  { title: 'Triggers', icon: <ZapIcon className="size-4" /> },
];

/** Host row as returned by the host-assets query (/api/assets/host). */
interface HostAssetRow {
  id: string;
  host: string;
  assetCount: number;
}

export function CreateProject() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<EditableScopeRule[]>([]);
  const [autoAddAssets, setAutoAddAssets] = useState(true);
  const [hostIds, setHostIds] = useState<Set<string>>(new Set());
  const [pipelineSource, setPipelineSource] = useState<'template' | 'tools'>('template');
  const [template, setTemplate] = useState<string>();
  const [pipeline, setPipeline] = useState<PipelineToolEntry[]>([]);
  const [triggers, setTriggers] = useState<TriggersDraft>(newTriggersDraft);
  const [runNow, setRunNow] = useState(true);

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setParams, setFilter },
  } = useServerDataTable({
    isUpdateSearchQueryParam: false,
    defaultPageSize: 5,
    defaultSortBy: 'host',
    defaultSortOrder: 'ASC',
  });

  const hostsQuery = useAssetsControllerGetHostAssets(
    { page, limit: pageSize, sortBy, sortOrder, value: filter },
    { query: { queryKey: ['create-project-hosts', page, pageSize, sortBy, sortOrder, filter] } },
  );
  const toolsQuery = useToolsControllerGetInstalledTools();
  const templatesQuery = useProjectsControllerGetWorkflowTemplates();
  const tools = useMemo(() => toolsQuery.data?.data ?? [], [toolsQuery.data?.data]);
  const toolsById = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools]);

  const { mutate: createProject, isPending } = useProjectsControllerCreate();

  const hasPipeline =
    pipelineSource === 'template'
      ? !!template
      : pipeline.length > 0 && isPipelineValid(pipeline, toolsById);
  const isLastStep = step === STEPS.length - 1;
  const canNext =
    step === 0
      ? name.trim().length > 0
      : step === 2
        ? hasPipeline
        : step === 3
          ? isTriggersDraftValid(triggers)
          : true;

  const handleNext = () => {
    if (!isLastStep) {
      setStep((prev) => prev + 1);
      return;
    }
    const dto: CreateProjectDto = {
      name: name.trim(),
      description: description.trim() || undefined,
      hostIds: Array.from(hostIds),
      scopeRules: rules
        .filter(isCompleteRule)
        .map(({ mode, type, value }) => ({ mode, type, value })),
      autoAddAssets,
      ...(pipelineSource === 'template'
        ? { template }
        : { tools: toToolInputs(pipeline) }),
      on: onInputOf(triggers),
      runNow,
    };
    createProject(
      { data: dto },
      {
        onSuccess: (response: Project) => {
          void navigate({
            to: '/projects/$id/$tab',
            params: { id: response.id, tab: 'overview' },
          });
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, 'Failed to create project'));
        },
      },
    );
  };

  // Toggle an id in a Set and return the new Set.
  const toggleId = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  };

  const hostColumns: ColumnDef<HostAssetRow>[] = [
    {
      id: 'select',
      header: () => {
        const ids = hostsQuery.data?.data?.map((h) => h.id) || [];
        const allSelected = ids.length > 0 && ids.every((id) => hostIds.has(id));
        const someSelected = ids.some((id) => hostIds.has(id));
        return (
          <Checkbox
            checked={allSelected || (someSelected && 'indeterminate')}
            onCheckedChange={(value) => {
              setHostIds((prev) => {
                const next = new Set(prev);
                ids.forEach((id) => {
                  if (value) next.add(id);
                  else next.delete(id);
                });
                return next;
              });
            }}
            aria-label="Select all"
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={hostIds.has(row.original.id)}
          onCheckedChange={() => setHostIds((prev) => toggleId(prev, row.original.id))}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: 'host', header: 'Host' },
    { accessorKey: 'assetCount', header: 'Services' },
  ];

  return (
    <Page
      title="Create project"
      description="Choose the assets to keep scanned, the pipeline that scans them, and when it runs"
      isShowButtonGoBack
      permission="project.write"
    >
      <div className="h-full overflow-y-auto">
        <Card className="mx-auto w-full max-w-4xl max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent">
          <CardContent className="flex max-sm:px-0 flex-col gap-8">
            <Stepper
              value={step + 1}
              indicators={{
                completed: <CheckIcon className="size-3.5" />,
                loading: <LoaderCircleIcon className="size-3.5 animate-spin" />,
              }}
              className="w-full"
            >
              <StepperNav className="gap-3">
                {STEPS.map((stepItem, i) => (
                  <StepperItem
                    key={stepItem.title}
                    step={i + 1}
                    className="relative flex-1 items-start"
                  >
                    <StepperTrigger className="flex grow flex-col items-start justify-center gap-2.5">
                      <StepperIndicator className="data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground data-[state=completed]:bg-success size-8 border-2 data-[state=completed]:text-white data-[state=inactive]:bg-transparent">
                        {stepItem.icon}
                      </StepperIndicator>
                      <div className="flex flex-col items-start gap-1">
                        <div className="text-muted-foreground text-[10px] font-semibold uppercase">
                          Step {i + 1}
                        </div>
                        <StepperTitle className="group-data-[state=inactive]/step:text-muted-foreground text-start text-base font-semibold">
                          {stepItem.title}
                        </StepperTitle>
                      </div>
                    </StepperTrigger>

                    {STEPS.length > i + 1 && (
                      <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-x-0 start-9 top-4 m-0 group-data-[orientation=horizontal]/stepper-nav:w-[calc(100%-2rem)] group-data-[orientation=horizontal]/stepper-nav:flex-none" />
                    )}
                  </StepperItem>
                ))}
              </StepperNav>
            </Stepper>

            <div className="flex flex-col gap-5">
              {step === 0 && (
                <div className="flex max-w-md flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="project-name">Name</Label>
                    <Input
                      id="project-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Production hosts"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="project-description">Description</Label>
                    <Textarea
                      id="project-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What this project covers"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {step === 1 && (
                <Tabs defaultValue="rules">
                  <TabsList>
                    <TabsTrigger value="rules">By rules</TabsTrigger>
                    <TabsTrigger value="hosts" badge={hostIds.size || undefined}>
                      Pick by hand
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="rules" className="pt-3">
                    <ScopeRulesEditor
                      rules={rules}
                      onChange={setRules}
                      autoAddAssets={autoAddAssets}
                      onAutoAddAssetsChange={setAutoAddAssets}
                    />
                  </TabsContent>
                  <TabsContent value="hosts" className="pt-3">
                    <DataTable
                      columns={hostColumns}
                      data={hostsQuery.data?.data || []}
                      isLoading={hostsQuery.isLoading}
                      page={hostsQuery.data?.page || 1}
                      pageSize={hostsQuery.data?.limit || 10}
                      totalItems={hostsQuery.data?.total || 0}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSortChange={(col, order) => setParams({ sortBy: col, sortOrder: order })}
                      filterValue={filter}
                      onFilterChange={setFilter}
                      filterColumnKey="host"
                      onPageChange={setPage}
                      onPageSizeChange={setPageSize}
                      onRowClick={(row) => setHostIds((prev) => toggleId(prev, row.id))}
                      tableState={{
                        rowSelection: Array.from(hostIds).reduce(
                          (acc, id) => {
                            acc[id] = true;
                            return acc;
                          },
                          {} as Record<string, boolean>,
                        ),
                      }}
                      emptyMessage="No hosts found"
                    />
                  </TabsContent>
                </Tabs>
              )}

              {step === 2 && (
                <Tabs
                  value={pipelineSource}
                  onValueChange={(value) => setPipelineSource(value as 'template' | 'tools')}
                >
                  <TabsList>
                    <TabsTrigger value="template">From a template</TabsTrigger>
                    <TabsTrigger value="tools">Pick tools</TabsTrigger>
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
                    {toolsQuery.isLoading ? (
                      <div
                        className="flex min-h-40 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground"
                        role="status"
                      >
                        <LoaderCircleIcon className="size-4 animate-spin" />
                        Loading installed tools...
                      </div>
                    ) : tools.length === 0 ? (
                      <NoInstalledToolsState />
                    ) : (
                      <ToolPipelineBuilder
                        tools={tools}
                        value={pipeline}
                        onChange={setPipeline}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              )}

              {step === 3 && (
                <div className="flex max-w-2xl flex-col gap-5">
                  <WorkflowTriggersForm value={triggers} onChange={setTriggers} />
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={runNow}
                      onCheckedChange={(value) => setRunNow(value === true)}
                    />
                    Run once right after creating
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="outline" onClick={() => navigate({ to: '/projects' })}>
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={step === 0}
                  onClick={() => setStep((prev) => prev - 1)}
                >
                  Back
                </Button>
                <Button disabled={!canNext || isPending} onClick={handleNext}>
                  {isLastStep ? (isPending ? 'Creating...' : 'Create') : 'Next'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
