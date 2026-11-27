import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { fromNow } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import type { GetWorkerResponseDto } from '@/services/apis/gen/queries';
import type { ReactNode } from 'react';
import { DisconnectWorkerButton } from '../components/disconnect-worker-button';

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Identity of a worker and, for workspace workers, its disconnection. */
export function WorkerSettingsTab({
  worker,
  canDisconnect,
}: {
  worker: GetWorkerResponseDto;
  canDisconnect: boolean;
}) {
  const t = useT();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('workers.settings.details')}</CardTitle>
          <CardDescription>
            {t('workers.settings.detailsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          <Row title={t('workers.settings.id')}>
            <code className="text-sm text-muted-foreground">{worker.id}</code>
          </Row>
          <Row title={t('workers.settings.connectedAt')}>
            <span
              className="text-sm text-muted-foreground"
              title={worker.createdAt}
            >
              {fromNow(worker.createdAt)}
            </span>
          </Row>
          <Row title={t('workers.settings.lastSeen')}>
            <span
              className="text-sm text-muted-foreground"
              title={worker.lastSeenAt}
            >
              {fromNow(worker.lastSeenAt)}
            </span>
          </Row>
        </CardContent>
      </Card>

      {canDisconnect && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              {t('workers.settings.dangerZone')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Row
              title={t('workers.disconnect.action')}
              description={t('workers.disconnect.rowDescription')}
            >
              <DisconnectWorkerButton workerId={worker.id} />
            </Row>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
