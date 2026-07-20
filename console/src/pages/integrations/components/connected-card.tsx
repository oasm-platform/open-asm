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
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MoreHorizontal, Unplug } from 'lucide-react';
import { useState } from 'react';
import { IntegrationLogo } from './integration-logo';

dayjs.extend(relativeTime);

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
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border p-5 transition-colors hover:border-primary hover:bg-accent/50">
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
          <Badge variant="secondary" className="shrink-0">
            <span>{formatCategory(integration.category)}</span>
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Connected {dayjs(integration.createdAt).fromNow()}
        </p>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="shrink-0">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setShowDialog(true)}
          >
            <Unplug className="size-4 text-destructive" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Integration</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect &quot;{integration.name}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onDisconnect(integration.id);
                setShowDialog(false);
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
