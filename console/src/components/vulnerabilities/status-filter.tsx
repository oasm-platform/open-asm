/**
 * StatusFilter Component
 *
 * A dropdown select component for filtering vulnerabilities by status (Open/Dismissed/All).
 * Used in the vulnerabilities list page toolbar.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VulnerabilityStatus } from '@/services/apis/gen/queries';

/** Status filter options with display labels */
const STATUS_OPTIONS = [
  {
    value: VulnerabilityStatus.open,
    label: 'Open',
  },
  {
    value: VulnerabilityStatus.dismissed,
    label: 'Dismissed',
  },
  {
    value: VulnerabilityStatus.all,
    label: 'All',
  },
] as const;

interface StatusFilterProps {
  /** Current selected status value */
  value: VulnerabilityStatus;
  /** Callback when status selection changes */
  onValueChange: (value: VulnerabilityStatus) => void;
}

/**
 * Renders a select dropdown for filtering vulnerabilities by status.
 * Defaults to 'Open' status to show only active vulnerabilities.
 */
export function StatusFilter({ value, onValueChange }: StatusFilterProps) {
  return (
    <Select
      value={value}
      onValueChange={(val) => onValueChange(val as VulnerabilityStatus)}
    >
      <SelectTrigger className="border-dashed text-xs py-0">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
