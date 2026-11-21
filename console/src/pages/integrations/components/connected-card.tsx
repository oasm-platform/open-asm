import { fromNow } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { MoreHorizontal, Unplug } from 'lucide-react';
import { useState } from 'react';
import { getIntegrationCapabilities } from '../capabilities';
import { IntegrationLogo } from './integration-logo';


interface ConnectedCardProps {
  integration: GetIntegrationDto;
  onDetail: () => void;
  onDisconnect: (id: string) => void;
  formatCategory: (category: string) => string;
}

export function ConnectedCard({
  integration,
  onDetail,
  onDisconnect,
  formatCategory,
}: ConnectedCardProps) {
  const t = useT();
  const [showDialog, setShowDialog] = useState(false);

  return (
    // Dark mode: the card fill, as outlines are off there (index.css)
    <div className="flex items-start justify-between gap-2 rounded-lg border p-5 transition-colors hover:bg-accent/70 dark:bg-card-surface dark:hover:bg-accent/70">
      <button
        type="button"
        className="flex min-w-0 flex-col items-start gap-2 text-left"
        onClick={onDetail}
      >
        <div className="flex items-center gap-2">
          <IntegrationLogo
            url={`/static/images/integrations/${integration.appType}.svg`}
          />
          <h3 className="text-base font-semibold capitalize truncate">
            {integration.name}
          </h3>
          {getIntegrationCapabilities(integration).map((capability) => (
            <Badge key={capability} variant="secondary" className="shrink-0">
              <span>{formatCategory(capability)}</span>
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('integrations.connected.connectedAgo', {
            time: fromNow(integration.createdAt),
          })}
        </p>
        {integration.lastRunAt && (
          <p className="text-sm text-muted-foreground">
            {t('integrations.connected.lastSyncAgo', {
              time: fromNow(integration.lastRunAt),
            })}
          </p>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={t('integrations.connected.actions')}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setShowDialog(true)}
          >
            <Unplug className="size-4 text-destructive" />
            {t('integrations.disconnect.action')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('integrations.disconnect.title')}</DialogTitle>
            <DialogDescription>
              {t('integrations.disconnect.confirm', { name: integration.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                onDisconnect(integration.id);
                setShowDialog(false);
              }}
            >
              {t('integrations.disconnect.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
