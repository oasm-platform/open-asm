/**
 * SeverityFilter Component
 *
 * A multi-select dropdown component for filtering vulnerabilities by severity levels.
 * Used in the vulnerabilities list page toolbar.
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { VulnerabilitiesControllerGetVulnerabilitiesSeverityItem } from '@/services/apis/gen/queries';
import { ChevronDown, Filter } from 'lucide-react';

/** Severity filter options with display labels and colors */
const SEVERITY_OPTIONS = [
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem.critical,
    label: 'Critical',
    color: 'text-red-500',
    bgColor: 'bg-red-500',
  },
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem.high,
    label: 'High',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
  },
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem.medium,
    label: 'Medium',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
  },
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem.low,
    label: 'Low',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
  },
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem.info,
    label: 'Info',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500',
  },
] as const;

interface SeverityFilterProps {
  /** Current selected severity values */
  value: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem[];
  /** Callback when severity selection changes */
  onValueChange: (
    value: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem[],
  ) => void;
}

/**
 * Renders a multi-select dropdown for filtering vulnerabilities by severity.
 * Supports selecting multiple severity levels simultaneously.
 */
export function SeverityFilter({ value, onValueChange }: SeverityFilterProps) {
  const toggleSeverity = (
    severity: VulnerabilitiesControllerGetVulnerabilitiesSeverityItem,
  ) => {
    if (value.includes(severity)) {
      onValueChange(value.filter((s) => s !== severity));
    } else {
      onValueChange([...value, severity]);
    }
  };

  const selectedCount = value.length;
  const hasSelection = selectedCount > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 border-dashed py-0 text-xs justify-between',
            hasSelection && 'border-solid border-primary',
          )}
        >
          <Filter className="mr-2 h-3.5 w-3.5" />
          Severity
          {hasSelection && (
            <>
              <span className="mx-1.5">·</span>
              <span className="text-primary font-medium">{selectedCount}</span>
            </>
          )}
          <ChevronDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          {SEVERITY_OPTIONS.map((option) => {
            const isSelected = value.includes(option.value);
            return (
              <div
                key={option.value}
                className={cn(
                  'flex items-center space-x-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent',
                  isSelected && 'bg-accent/50',
                )}
                onClick={() => toggleSeverity(option.value)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSeverity(option.value);
                  }
                }}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSeverity(option.value)}
                  className="border-muted-foreground"
                />
                <div className="flex items-center gap-2 flex-1">
                  <span
                    className={cn('w-2 h-2 rounded-full', option.bgColor)}
                    aria-hidden="true"
                  />
                  <span className={cn('text-sm', option.color)}>
                    {option.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {hasSelection && (
          <div className="mt-2 pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onValueChange([])}
            >
              Clear filters
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
