/**
 * TargetTypeFilter Component
 *
 * A dropdown select component for filtering targets by type (DOMAIN/CIDR/IP/All).
 * Used in the targets list page toolbar.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TargetType } from '@/services/apis/gen/queries';

/** All option value for filtering */
const ALL_VALUE = 'ALL';

/** Type filter options with display labels and colors */
const TYPE_OPTIONS = [
  { value: ALL_VALUE, label: 'All types', color: 'bg-muted-foreground' },
  { value: TargetType.DOMAIN, label: 'DOMAIN', color: 'bg-blue-500' },
  { value: TargetType.CIDR, label: 'CIDR', color: 'bg-green-500' },
  { value: TargetType.IP, label: 'IP', color: 'bg-orange-500' },
] as const;

interface TargetTypeFilterProps {
  /** Current selected type value */
  value: TargetType | undefined;
  /** Callback when type selection changes */
  onValueChange: (value: TargetType | undefined) => void;
}

/**
 * Renders a select dropdown for filtering targets by type.
 */
export function TargetTypeFilter({ value, onValueChange }: TargetTypeFilterProps) {
  const currentValue = value ?? ALL_VALUE;

  const handleChange = (val: string) => {
    onValueChange(val === ALL_VALUE ? undefined : (val as TargetType));
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className="border-dashed text-xs py-0 focus:ring-0 focus:ring-offset-0 focus:outline-none">
        <SelectValue placeholder="Type" />
      </SelectTrigger>
      <SelectContent>
        {TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${option.color}`} />
              {option.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
