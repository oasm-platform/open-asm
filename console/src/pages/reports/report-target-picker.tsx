import { Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import useDebounce from '@/hooks/use-debounce';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  useTargetsControllerGetTargetsInWorkspace,
  type GetManyTargetResponseDto,
} from '@/services/apis/gen/queries';

interface ReportTargetPickerProps {
  value: string[];
  onChange: (targetIds: string[]) => void;
}

/** Multi-select of workspace targets; an empty selection means every target. */
export function ReportTargetPicker({ value, onChange }: ReportTargetPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  // Labels of picked targets, so chips survive a search that no longer lists them.
  const [picked, setPicked] = useState<Record<string, string>>({});

  const { data, isLoading } = useTargetsControllerGetTargetsInWorkspace(
    { limit: 50, value: debouncedSearch || undefined },
    { query: { queryKey: ['targets-for-report', debouncedSearch], enabled: open } },
  );
  const targets = useMemo(() => data?.data ?? [], [data?.data]);

  const toggle = (target: GetManyTargetResponseDto) => {
    if (value.includes(target.id)) {
      onChange(value.filter((id) => id !== target.id));
    } else {
      setPicked((prev) => ({ ...prev, [target.id]: target.value }));
      onChange([...value, target.id]);
    }
  };

  const shown = value.slice(0, 2);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-auto min-h-9 w-full justify-between gap-2 px-2.5 py-1.5 font-normal"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{t('reports.generate.targetsAll')}</span>
            ) : (
              <>
                {/* Chips only label the selection: a button inside the trigger button is invalid. */}
                {shown.map((id) => (
                  <span
                    key={id}
                    className="inline-flex max-w-40 items-center rounded-md bg-muted px-2 py-0.5 text-xs"
                  >
                    <span className="truncate">{picked[id] ?? id}</span>
                  </span>
                ))}
                {value.length > shown.length && (
                  <span className="text-xs text-muted-foreground">
                    +{value.length - shown.length}
                  </span>
                )}
              </>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('reports.generate.targetsSearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {isLoading ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t('common.loading')}</div>
          ) : targets.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('reports.generate.targetsEmpty')}
            </div>
          ) : (
            targets.map((target) => {
              const selected = value.includes(target.id);
              return (
                <button
                  type="button"
                  key={target.id}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                    selected && 'bg-accent/50',
                  )}
                  onClick={() => toggle(target)}
                >
                  <Check className={cn('size-3.5 shrink-0', !selected && 'invisible')} />
                  <span className="truncate">{target.value}</span>
                </button>
              );
            })
          )}
        </div>
        {value.length > 0 && (
          <div className="mt-1 border-t pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              {t('reports.generate.targetsClear')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
