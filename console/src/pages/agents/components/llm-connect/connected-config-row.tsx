import { Button } from '@/components/ui/button';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { memo } from 'react';
import Image from '@/components/ui/image';
import { ModelSelectForm } from './model-select-form';

export const ConnectedConfigRow = memo(function ConnectedConfigRow({
  item,
  isExpanded,
  onToggle,
  onModelChange,
  onDelete,
  onSetPreferred,
  isUpdating,
}: {
  item: LLMConfigWithProviderDto;
  isExpanded: boolean;
  onToggle: () => void;
  onModelChange: (configId: string, modelId: string) => Promise<void>;
  onDelete: (configId: string) => void;
  onSetPreferred: (configId: string) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white shrink-0">
            <Image width={24} height={24} url={item.logo} />
          </div>
          <div className="flex flex-col justify-start items-start">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">
                {item.providerName}
              </span>
              {item.isPreferred && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-medium leading-none">
                  default
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {item.name ? `${item.name} · ` : ''}
              {item.model ?? ''}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          className="gap-1 border border-green-600 text-green-600 hover:bg-green-50"
        >
          <Check size={16} />
          Connected
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      </div>

      {isExpanded && (
        <div className="border-t p-4 flex flex-col gap-3 bg-muted/30">
          <ModelSelectForm
            provider={item}
            onModelChange={onModelChange}
            onDelete={onDelete}
            onSetPreferred={onSetPreferred}
            isUpdating={isUpdating}
          />
        </div>
      )}
    </div>
  );
});
