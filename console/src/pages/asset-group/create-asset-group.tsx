'use client';

import Page from '@/components/common/page';
import { ToolSelector } from '@/components/common/tool-selector';
import type { ToolSelectorItem } from '@/components/common/tool-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CronScheduleBuilder } from '@/components/ui/cron-schedule-builder';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  useAssetGroupControllerCreate,
  useAssetsControllerGetHostAssets,
  useToolsControllerGetInstalledTools,
  ToolsControllerGetManyToolsType,
  type AssetGroup,
  type CreateAssetGroupDto,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClockIcon,
  CheckIcon,
  FileTextIcon,
  LoaderCircleIcon,
  ServerIcon,
  AlertTriangle,
  WrenchIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

const STEPS = [
  { title: 'Info', icon: <FileTextIcon className="size-4" /> },
  { title: 'Hosts', icon: <ServerIcon className="size-4" /> },
  { title: 'Tools', icon: <WrenchIcon className="size-4" /> },
  { title: 'Schedule', icon: <CalendarClockIcon className="size-4" /> },
];

const COLORS = [
  '#78716C', // current/default
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // yellow
  '#7e22ce', // purple
  '#ec4899', // pink
];

/** Host row as returned by the host-assets query (/api/assets/host). */
interface HostAssetRow {
  id: string;
  host: string;
  assetCount: number;
}

export function CreateAssetGroup() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [hexColor, setHexColor] = useState<string | undefined>(undefined);
  const [hostIds, setHostIds] = useState<Set<string>>(new Set());
  const [toolIds, setToolIds] = useState<Set<string>>(new Set());
  const [schedule, setSchedule] = useState<string | undefined>(undefined);

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
    { query: { queryKey: ['create-group-hosts', page, pageSize, sortBy, sortOrder, filter] } },
  );

  const toolsQuery = useToolsControllerGetInstalledTools({
    category: 'vulnerabilities',
  });

  const { mutate: createAssetGroup, isPending } = useAssetGroupControllerCreate();

  const isLastStep = step === STEPS.length - 1;
  const canNext =
    step === 0
      ? name.trim().length > 0
      : step === 2
        ? toolIds.size > 0
        : step === 3
          ? Boolean(schedule)
          : true;

  const handleNext = () => {
    if (!isLastStep) {
      setStep((prev) => prev + 1);
      return;
    }
    const dto: CreateAssetGroupDto = {
      name: name.trim(),
      hexColor: hexColor || undefined,
      hostIds: Array.from(hostIds),
      toolIds: Array.from(toolIds),
      schedule,
    };
    createAssetGroup(
      { data: dto },
      {
        onSuccess: (response: AssetGroup) => {
          navigate({ to: `/groups/${response.id}` });
        },
        onError: () => {
          toast.error('Failed to create automation group');
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

  /** Per-tool state: connector without config → disabled. */
  const getToolState = (tool: ToolSelectorItem) => {
    const fullTool = toolsQuery.data?.data?.find((t) => t.id === tool.id);
    if (
      fullTool?.type === ToolsControllerGetManyToolsType.connector &&
      (fullTool as Record<string, unknown>).hasConfigProfile === false
    ) {
      return {
        disabled: true,
        tooltip: 'Configure this tool before adding it to a group.',
      };
    }
    return { disabled: false };
  };

  const hasUnconfiguredConnectors =
    toolsQuery.data?.data?.some(
      (t) =>
        t.type === ToolsControllerGetManyToolsType.connector &&
        (t as Record<string, unknown>).hasConfigProfile === false,
    ) ?? false;

  return (
    <Page permission="group.write">
      <div className="h-full overflow-y-auto">
        <Card className="mx-auto w-full max-w-4xl max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent">
          <CardHeader className="max-sm:px-0">
            <CardTitle>Automation group</CardTitle>
            <CardDescription>
              Runs automated security scans. Add your
              hosts, pick the tools to execute, and set a schedule — scans run
              automatically on schedule, or on demand.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex max-sm:px-0 flex-col gap-8">
            {/* Step indicator */}
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

        {/* Step content */}
        <div className="flex flex-col gap-5">
          {step === 0 && (
            <div className="flex max-w-md flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-group-name">Name</Label>
                <Input
                  id="asset-group-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production hosts"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        'h-8 w-8 cursor-pointer rounded-full border-2',
                        hexColor === color
                          ? 'border-gray-400 ring-2 ring-offset-2 ring-blue-500'
                          : 'border-gray-300',
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setHexColor(color)}
                      aria-label={`Select ${color} color`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
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
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              {hasUnconfiguredConnectors && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Some tools require configuration — visit the Tools detail page to configure them.
                  </AlertDescription>
                </Alert>
              )}
              <ToolSelector
                tools={(toolsQuery.data?.data || []).map((tool) => ({
                  id: tool.id,
                  name: tool.name,
                  logoUrl: tool.logoUrl,
                }))}
                selectedIds={toolIds}
                onToggle={(id) => setToolIds((prev) => toggleId(prev, id))}
                emptyMessage="No tools found"
                getToolState={getToolState}
              />
            </div>
          )}

          {step === 3 && (
            <div className="max-w-2xl">
              <CronScheduleBuilder
                onChange={(change) => setSchedule(change.cron)}
              />
            </div>
          )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t pt-4">
            <Button variant="outline" onClick={() => navigate({ to: '/groups' })}>
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
                {isLastStep ? (isPending ? 'Saving...' : 'Save') : 'Next'}
              </Button>
            </div>
          </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
