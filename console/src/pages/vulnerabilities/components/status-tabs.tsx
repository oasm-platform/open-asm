import { cn } from '@/lib/utils';
import type { VulnerabilityStatus } from '@/services/apis/gen/queries';
import { STATUS_TABS } from '../vulnerability-status';

interface StatusTabsProps {
  value: VulnerabilityStatus;
  onValueChange: (value: VulnerabilityStatus) => void;
  counts: Partial<Record<VulnerabilityStatus, number>>;
}

/** Status tabs of the vulnerability list, each with its count when known. */
export function VulnerabilityStatusTabs({ value, onValueChange, counts }: StatusTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Vulnerability status"
      className="flex w-full gap-1 overflow-x-auto border-b"
    >
      {STATUS_TABS.map((tab) => {
        const active = tab.value === value;
        const count = counts[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-value={tab.value}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
              active
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
              tab.value === 'pending_review' && 'text-amber-700 dark:text-amber-300',
            )}
          >
            {tab.label}
            {count !== undefined && (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
