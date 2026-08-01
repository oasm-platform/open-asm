'use client';

import Page from '@/components/common/page';
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
import { Image } from '@/components/ui/image';
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
  type AssetGroup,
  type CreateAssetGroupDto,
  type GetHostAssetsDTO,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClockIcon,
  CheckIcon,
  FileTextIcon,
  LoaderCircleIcon,
  Plus,
  ServerIcon,
  WrenchIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

const STEPS = [
  { title: 'Info', icon: <FileTextIcon className="size-4" /> },
  { title: 'Add hosts', icon: <ServerIcon className="size-4" /> },
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
  } = useServerDataTable({ isUpdateSearchQueryParam: false, defaultPageSize: 10 });

  const hostsQuery = useAssetsControllerGetHostAssets(
    { page, limit: pageSize, sortBy, sortOrder, search: filter },
    { query: { queryKey: ['create-group-hosts', page, pageSize, sortBy, sortOrder, filter] } },
  );

  const toolsQuery = useToolsControllerGetInstalledTools();

  const { mutate: createAssetGroup, isPending } = useAssetGroupControllerCreate();

  const isLastStep = step === STEPS.length - 1;
  const canNext =
    step === 0
      ? name.trim().length > 0
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
          toast.error('Failed to create host group');
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

  const hostColumns: ColumnDef<AssetRow>[] = [
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
    { accessorKey: 'assetCount', header: 'Assets' },
  ];

  return (
    <Page>
      <div className="h-full overflow-y-auto">
        <Card className="mx-auto w-full max-w-4xl">
          <CardHeader>
            <CardTitle>Create Host Group</CardTitle>
            <CardDescription>
              Runs automated security scans. Add your
              hosts, pick the tools to execute, and set a schedule — recurring
              scans run on their own, with no manual kick-off.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
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
              onRowClick={(row) =>
                setHostIds((prev) => toggleId(prev, (row as HostAssetRow).id))
              }
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
            <div className="flex flex-wrap gap-6">
              {(toolsQuery.data?.data || []).map((tool) => {
                const isSelected = toolIds.has(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className="group flex cursor-pointer flex-col items-center gap-2"
                    onClick={() =>
                      setToolIds((prev) => toggleId(prev, tool.id))
                    }
                  >
                    <div
                      className="relative"
                      style={{
                        filter: isSelected ? 'none' : 'grayscale(100%)',
                        opacity: isSelected ? 1 : 0.6,
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <Image
                        url={tool.logoUrl}
                        width={64}
                        height={64}
                        className="rounded-full"
                      />
                      {/* Show + on hover for unselected tools */}
                      {!isSelected && (
                        <div
                          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          aria-hidden
                        >
                          <Plus className="size-8 text-white" />
                        </div>
                      )}
                      {/* Show check badge for selected tools */}
                      {isSelected && (
                        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#10b981]">
                          <CheckIcon className="size-3 text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-center text-sm capitalize">
                      {tool.name}
                    </span>
                  </button>
                );
              })}
              {(toolsQuery.data?.data?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">No tools found</p>
              )}
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
