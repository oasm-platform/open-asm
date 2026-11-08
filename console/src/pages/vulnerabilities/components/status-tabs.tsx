import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as VulnerabilityStatus)}
    >
      <div className="w-full overflow-x-auto scrollbar-hide">
        <TabsList
          aria-label="Vulnerability status"
          className="flex w-max flex-nowrap rounded-none bg-transparent p-0"
        >
          {STATUS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-9 flex-none"
              badge={counts[tab.value]}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
