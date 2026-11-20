import { useT } from '@/lib/i18n-dictionary';
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
  const t = useT();
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
        toast.success(t('targets.settingsTab.scheduleUpdated'));
        refetch();
        void queryClient.invalidateQueries({
          queryKey: getTargetsControllerGetTargetOverviewQueryKey(target.id),
        });
      },
      onError: (error) => {
        setSchedule(target.scanSchedule as UpdateTargetDtoScanSchedule);
        toast.error(apiErrorMessage(error, t('targets.settingsTab.scheduleUpdateFailed')));
      },
    },
  });
  const { mutate: rescan, isPending: rescanning } = useTargetsControllerReScanTarget({
    mutation: {
      onSuccess: () => {
        toast.success(t('targets.settingsTab.discoveryStarted'));
        refetch();
        void navigate({
          to: '/targets/$id/$tab',
          params: { id: target.id, tab: 'overview' },
        });
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, t('targets.settingsTab.discoveryFailed'))),
    },
  });
  const { mutate: remove, isPending: deleting } = useTargetsControllerDeleteTarget({
    mutation: {
      onSuccess: () => {
        toast.success(t('targets.settingsTab.deleted'));
        void queryClient.invalidateQueries({ queryKey: ['targets'] });
        void navigate({ to: '/targets' });
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, t('targets.settingsTab.deleteFailed'))),
    },
  });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('targets.settingsTab.scanning')}</CardTitle>
          <CardDescription>
            {t('targets.settingsTab.scanningDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          <Row
            title={t('targets.settingsTab.scanSchedule')}
            description={t('targets.settingsTab.scanScheduleDescription')}
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
            title={t('targets.settingsTab.rediscover')}
            description={
              busy
                ? t('targets.settingsTab.busy')
                : t('targets.settingsTab.rediscoverDescription')
            }
          >
            <ConfirmDialog
              title={t('targets.settings.rediscoverTitle')}
              description={t('targets.settingsTab.rediscoverConfirm')}
              onConfirm={() => rescan({ id: target.id })}
              trigger={
                <Button variant="outline" disabled={busy || rescanning}>
                  <RefreshCw className={rescanning ? 'size-4 animate-spin' : 'size-4'} />
                  {t('targets.settingsTab.rediscover')}
                </Button>
              }
            />
          </Row>
          <Row
            title={t('targets.settingsTab.vulnScan')}
            description={t('targets.settingsTab.vulnScanDescription')}
          >
            <FastScanDialog target={{ id: target.id, value: target.value }} disabled={busy} />
          </Row>
          {target.type === TargetType.DOMAIN && (
            <Row title={t('targets.settingsTab.urlDiscovery')} description={t('targets.settingsTab.urlDiscoveryDescription')}>
              <DiscoverUrlsDialog target={{ id: target.id, value: target.value }} disabled={busy} />
            </Row>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t('targets.settingsTab.dangerZone')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title={t('targets.settings.deleteTitle')}
            description={t('targets.settingsTab.deleteDescription')}
          >
            <ConfirmDialog
              title={t('targets.settings.deleteTitle')}
              description={t('targets.settings.deleteDescription')}
              typeToConfirm={target.value}
              onConfirm={() => remove({ id: target.id })}
              trigger={
                <Button variant="outline" className="text-destructive" disabled={deleting}>
                  <Trash2 className="size-4" />
                  {t('targets.settingsTab.deleteButton')}
                </Button>
              }
            />
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}
