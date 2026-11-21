'use client';

import Page from '@/components/common/page';
import {
  isPipelineValid,
  ToolPipelineBuilder,
  type PipelineToolEntry,
} from '@/pages/projects/components/tool-pipeline-builder';
import { NoInstalledToolsState } from '@/pages/projects/components/no-installed-tools-state';
import { usePipelineTools } from '@/pages/projects/components/use-pipeline-tools';
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
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  useAssetsControllerGetHostAssets,
  useProjectsControllerCreate,
  useProjectsControllerGetWorkflowTemplates,
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
  { titleKey: 'projects.create.steps.info', icon: <FileTextIcon className="size-4" /> },
  { titleKey: 'projects.create.steps.scope', icon: <ScanSearchIcon className="size-4" /> },
  { titleKey: 'projects.create.steps.pipeline', icon: <WorkflowIcon className="size-4" /> },
  { titleKey: 'projects.create.steps.triggers', icon: <ZapIcon className="size-4" /> },
];

/** Host row as returned by the host-assets query (/api/assets/host). */
interface HostAssetRow {
  id: string;
  host: string;
  assetCount: number;
}

export function CreateProject() {
  const t = useT();
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
  const toolsQuery = usePipelineTools();
  const templatesQuery = useProjectsControllerGetWorkflowTemplates();
  const { tools, installableTools } = toolsQuery;
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
          toast.error(apiErrorMessage(error, t('projects.create.failed')));
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
            aria-label={t('projects.create.selectAll')}
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={hostIds.has(row.original.id)}
          onCheckedChange={() => setHostIds((prev) => toggleId(prev, row.original.id))}
          aria-label={t('projects.create.selectRow')}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: 'host', header: t('projects.create.host') },
    { accessorKey: 'assetCount', header: t('projects.create.services') },
  ];

  return (
    <Page
      title={t('projects.create.title')}
      headerClassName="mx-auto w-full max-w-4xl"
      description={t('projects.create.description')}
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
                    key={stepItem.titleKey}
                    step={i + 1}
                    className="relative flex-1 items-start"
                  >
                    <StepperTrigger className="flex grow flex-col items-start justify-center gap-2.5">
                      <StepperIndicator className="data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground data-[state=completed]:bg-success size-8 border-2 data-[state=completed]:text-white data-[state=inactive]:bg-transparent">
                        {stepItem.icon}
                      </StepperIndicator>
                      <div className="flex flex-col items-start gap-1">
                        <div className="text-muted-foreground text-[10px] font-semibold uppercase">
                          {t('projects.create.stepN', { n: i + 1 })}
                        </div>
                        <StepperTitle className="group-data-[state=inactive]/step:text-muted-foreground text-start text-base font-semibold">
                          {t(stepItem.titleKey)}
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
                    <Label htmlFor="project-name">{t('common.name')}</Label>
                    <Input
                      id="project-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('projects.create.namePlaceholder')}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="project-description">{t('common.description')}</Label>
                    <Textarea
                      id="project-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('projects.create.descriptionPlaceholder')}
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {step === 1 && (
                <Tabs defaultValue="rules">
                  <TabsList>
                    <TabsTrigger value="rules">{t('projects.create.byRules')}</TabsTrigger>
                    <TabsTrigger value="hosts" badge={hostIds.size || undefined}>
                      {t('projects.create.pickByHand')}
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
                      emptyMessage={t('projects.create.noHosts')}
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
                    <TabsTrigger value="template">{t('projects.create.fromTemplate')}</TabsTrigger>
                    <TabsTrigger value="tools">{t('projects.create.pickTools')}</TabsTrigger>
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
                    {toolsQuery.isLoading ? (
                      <div
                        className="flex min-h-40 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground"
                        role="status"
                      >
                        <LoaderCircleIcon className="size-4 animate-spin" />
                        {t('projects.create.loadingTools')}
                      </div>
                    ) : tools.length === 0 && installableTools.length === 0 ? (
                      <NoInstalledToolsState />
                    ) : (
                      <ToolPipelineBuilder
                        tools={tools}
                        installableTools={installableTools}
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
                    {t('projects.create.runNow')}
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="outline" onClick={() => navigate({ to: '/projects' })}>
                {t('common.cancel')}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={step === 0}
                  onClick={() => setStep((prev) => prev - 1)}
                >
                  {t('common.back')}
                </Button>
                <Button disabled={!canNext || isPending} onClick={handleNext}>
                  {isLastStep
                    ? isPending
                      ? t('projects.create.creating')
                      : t('common.create')
                    : t('common.next')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
