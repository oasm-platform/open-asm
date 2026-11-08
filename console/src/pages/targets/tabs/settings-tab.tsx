import { ScanScheduleSelect } from '@/components/scan-schedule-select';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  JobStatus,
  TargetType,
  UpdateTargetDtoScanSchedule,
  getTargetsControllerGetTargetOverviewQueryKey,
  useTargetsControllerDeleteTarget,
  useTargetsControllerReScanTarget,
  useTargetsControllerUpdateTarget,
  type Target,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DiscoverUrlsDialog } from '../../assets/components/discover-urls-dialog';
import { apiErrorMessage } from '../../projects/project-utils';
import { FastScanDialog } from '../../vulnerabilities/components/fast-scan-dialog';

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Schedule, scans on demand and deletion of a target. */
export function TargetSettingsTab({
  target,
  refetch,
}: {
  target: Target;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<UpdateTargetDtoScanSchedule>(
    (target.scanSchedule as UpdateTargetDtoScanSchedule) ??
      UpdateTargetDtoScanSchedule.disabled,
  );
  const busy = target.status !== JobStatus.completed;

  const { mutate: update, isPending: saving } = useTargetsControllerUpdateTarget({
    mutation: {
      onSuccess: () => {
        toast.success('Scan schedule updated');
        refetch();
        void queryClient.invalidateQueries({
          queryKey: getTargetsControllerGetTargetOverviewQueryKey(target.id),
        });
      },
      onError: (error) => {
        setSchedule(target.scanSchedule as UpdateTargetDtoScanSchedule);
        toast.error(apiErrorMessage(error, 'Failed to update the scan schedule'));
      },
    },
  });
  const { mutate: rescan, isPending: rescanning } = useTargetsControllerReScanTarget({
    mutation: {
      onSuccess: () => {
        toast.success('Discovery started');
        refetch();
        void navigate({
          to: '/targets/$id/$tab',
          params: { id: target.id, tab: 'overview' },
        });
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, 'Failed to start the discovery')),
    },
  });
  const { mutate: remove, isPending: deleting } = useTargetsControllerDeleteTarget({
    mutation: {
      onSuccess: () => {
        toast.success('Target deleted');
        void queryClient.invalidateQueries({ queryKey: ['targets'] });
        void navigate({ to: '/targets' });
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, 'Failed to delete the target')),
    },
  });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Scanning</CardTitle>
          <CardDescription>
            When the target is discovered again, and scans to start now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          <Row
            title="Scan schedule"
            description="Discovery runs again on this schedule (00:00 server time)."
          >
            <ScanScheduleSelect
              value={schedule}
              disabled={saving}
              onChange={(value) => {
                setSchedule(value);
                update({ id: target.id, data: { scanSchedule: value } });
              }}
            />
          </Row>
          <Row
            title="Re-discover"
            description={
              busy
                ? 'A scan of the target is still running.'
                : 'Find subdomains, hosts and services again.'
            }
          >
            <ConfirmDialog
              title="Re-discover target"
              description="This starts a new discovery of the target. It can take a few minutes."
              onConfirm={() => rescan({ id: target.id })}
              trigger={
                <Button variant="outline" disabled={busy || rescanning}>
                  <RefreshCw className={rescanning ? 'size-4 animate-spin' : 'size-4'} />
                  Re-discover
                </Button>
              }
            />
          </Row>
          <Row
            title="Vulnerability scan"
            description="Scan the services found so far for known vulnerabilities."
          >
            <FastScanDialog target={{ id: target.id, value: target.value }} disabled={busy} />
          </Row>
          {target.type === TargetType.DOMAIN && (
            <Row title="URL discovery" description="Crawl the web services of the target for URLs.">
              <DiscoverUrlsDialog target={{ id: target.id, value: target.value }} disabled={busy} />
            </Row>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title="Delete target"
            description="Deletes the target with its assets, vulnerabilities and scan history. This cannot be undone."
          >
            <ConfirmDialog
              title="Delete target"
              description="This action cannot be undone. This will permanently delete the target and all its data."
              typeToConfirm={target.value}
              onConfirm={() => remove({ id: target.id })}
              trigger={
                <Button variant="outline" className="text-destructive" disabled={deleting}>
                  <Trash2 className="size-4" />
                  Delete target
                </Button>
              }
            />
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}
