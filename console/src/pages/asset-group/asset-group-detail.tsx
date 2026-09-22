import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useAssetGroupControllerDelete,
  useAssetGroupControllerGetById,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Clock, Layers, Server, Trash, type LucideIcon } from 'lucide-react';
import { memo, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AssetGroupDetailSkeleton } from './asset-group-detail-skeleton';
import AssetGroupWorkflow from './components/asset-group-workflow';
import { AssetSection } from './components/asset-section';
import { EditAssetGroupDialog } from './components/edit-asset-group-dialog';

dayjs.extend(relativeTime);

/** Exact stamp, reused as the hover title of every relative time. */
const stamp = (value?: string | null) =>
  value ? dayjs(value).format('DD MMM YYYY, HH:mm:ss') : undefined;

const absolute = (value?: string | null) =>
  value ? dayjs(value).format('DD MMM YYYY, HH:mm') : '—';

/** One field. Memoised: pure function of two props. */
const InfoRow = memo(function InfoRow({
  icon: Icon,
  label,
  value,
  title,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {Icon && <Icon className="size-3" />}
        {label}
      </p>
      <p
        className="truncate text-sm font-medium tabular-nums"
        title={title ?? (typeof value === 'string' ? value : undefined)}
      >
        {value || '—'}
      </p>
    </div>
  );
});

export default function AssetGroupDetail() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data, refetch, isLoading } = useAssetGroupControllerGetById(id!);
  const { mutate, isPending } = useAssetGroupControllerDelete();
  const queryClient = useQueryClient();

  const handleDelete = useCallback(() => {
    mutate(
      { id: id! },
      {
        onSuccess: () => {
          toast('Automation group deleted successfully');
          // Invalidate the list cache so the deleted group disappears from
          // the asset groups list when navigating back.
          queryClient.invalidateQueries({ queryKey: ['asset-group'] });
          navigate({ to: '/groups' });
        },
        onError: () => {
          toast.error('Failed to delete automation group');
        },
      },
    );
  }, [mutate, queryClient, navigate, id]);

  if (isLoading) return <AssetGroupDetailSkeleton />;

  if (!data) {
    return (
      <Page isShowButtonGoBack permission="group.read">
        <div className="flex h-full items-center justify-center">
          <div className="text-lg text-red-500">
            Error loading group details
          </div>
        </div>
      </Page>
    );
  }

  const workflows = data.assetGroupWorkflows ?? [];
  const workflow = workflows[0];
  const lastRun = workflow?.lastRun;
  const toolCount = workflow?.workflow.content?.jobs?.length ?? 0;

  // One row per fact, one fact per row. The hero carries identity only (name +
  // the group colour, as a small swatch beside it) and never repeats a value
  // from below.
  const rows: {
    icon?: LucideIcon;
    label: string;
    value: ReactNode;
    title?: string;
  }[] = [
    { icon: Server, label: 'Hosts', value: String(data.totalAssets ?? 0) },
    { icon: Layers, label: 'Tools in pipeline', value: String(toolCount) },
    {
      icon: Clock,
      label: 'Last run',
      value: lastRun?.createdAt
        ? `${dayjs(lastRun.createdAt).fromNow()} · ${lastRun.jobRunType} · ${lastRun.status}`
        : 'Never',
      title: stamp(lastRun?.createdAt),
    },
    {
      label: 'Created',
      value: absolute(data.createdAt),
      title: stamp(data.createdAt),
    },
    {
      label: 'Updated',
      value: absolute(data.updatedAt),
      title: stamp(data.updatedAt),
    },
  ];

  return (
    <Page isShowButtonGoBack permission="group.read">
      <div className="space-y-4">
        <Card className="gap-0 overflow-hidden py-0">
          {/* Identity: name + colour swatch, liveness, actions. Every other fact
              is printed once, in the grid below. */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-primary/[0.07] via-transparent to-transparent p-5">
            <span
              className="size-3 shrink-0 rounded-full ring-1 ring-border/60"
              style={{ background: data.hexColor }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {data.name || 'Unnamed group'}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <EditAssetGroupDialog assetGroup={data} onSuccess={refetch} />
              <ConfirmDialog
                title="Delete automation group"
                description={`Are you sure you want to delete "${data.name}"? This action cannot be undone.`}
                onConfirm={handleDelete}
                typeToConfirm="delete"
                trigger={
                  <Button size="icon" variant="ghost">
                    <Trash className="size-4 text-red-500" />
                  </Button>
                }
                disabled={isPending}
              />
            </div>
          </div>

          {/* Every fact, once. */}
          <CardContent className="border-t py-4">
            <CardTitle className="sr-only">Group information</CardTitle>
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <InfoRow key={row.label} {...row} />
              ))}
            </div>
          </CardContent>

          {/* Schedule, tools and hosts share the card. Order and behaviour are
              unchanged — only the card chrome moved to the parent. */}
          <AssetGroupWorkflow
            assetGroupId={id!}
            workflows={workflows}
            onRefetch={refetch}
          />
          <AssetSection assetGroupId={id!} totalAssets={data.totalAssets} />
        </Card>
      </div>
    </Page>
  );
}
