import { Trash2, Edit2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LLMConfig {
  id: string;
  provider: string;
  model: string;
  apiKey: string;
  isPreferred: boolean;
  isEditable?: boolean;
  apiUrl?: string;
}

interface LLMListProps {
  configs: LLMConfig[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export function LLMList({
  configs,
  onEdit,
  onDelete,
  onSetDefault,
}: LLMListProps) {
  if (configs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {configs.map((config) => {
          const isPreferred = config.isPreferred;
          const isEditable = config.isEditable !== false; // Default to true if undefined

          return (
            <div
              key={config.id}
              className={`group flex items-center justify-between rounded-lg border p-4 transition-all ${
                isPreferred
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/20 hover:bg-accent/50'
              }`}
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold capitalize text-foreground">
                    {config.provider}
                  </span>
                  {isPreferred && (
                    <Badge
                      variant="default"
                      className="h-5 px-1.5 text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 shadow-none"
                    >
                      Preferred
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <code className="relative rounded bg-muted px-[0.3rem] py-[0.1rem] font-mono text-xs text-muted-foreground">
                      {config.model || 'Not set'}
                    </code>
                  </div>
                  {config.apiUrl && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[300px]">
                        {config.apiUrl}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onSetDefault(config.id)}
                  title={isPreferred ? 'Preferred' : 'Set as Preferred'}
                  className={cn(
                    'h-8 w-8 transition-colors',
                    isPreferred
                      ? 'text-yellow-500 hover:text-yellow-600 hover:bg-yellow-500/10'
                      : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10',
                  )}
                >
                  <Star
                    className={cn(
                      'h-4 w-4',
                      isPreferred && 'fill-yellow-500 text-yellow-500',
                    )}
                  />
                </Button>
                {isEditable && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(config.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <ConfirmDialog
                      title="Delete Configuration"
                      description={`Are you sure you want to delete the configuration for ${config.provider}?`}
                      onConfirm={() => onDelete(config.id)}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
