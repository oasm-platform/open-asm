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
import { VulnerabilitiesControllerGetVulnerabilitiesStatus } from '@/services/apis/gen/queries';

/** Status filter options with display labels */
const STATUS_OPTIONS = [
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesStatus.open,
    label: 'Open',
  },
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesStatus.dismissed,
    label: 'Dismissed',
  },
  {
    value: VulnerabilitiesControllerGetVulnerabilitiesStatus.all,
    label: 'All',
  },
] as const;

interface StatusFilterProps {
  /** Current selected status value */
  value: VulnerabilitiesControllerGetVulnerabilitiesStatus;
  /** Callback when status selection changes */
  onValueChange: (
    value: VulnerabilitiesControllerGetVulnerabilitiesStatus,
  ) => void;
}

/**
 * Renders a select dropdown for filtering vulnerabilities by status.
 * Defaults to 'Open' status to show only active vulnerabilities.
 */
export function StatusFilter({ value, onValueChange }: StatusFilterProps) {
  return (
    <Select
      value={value}
      onValueChange={(val) =>
        onValueChange(val as VulnerabilitiesControllerGetVulnerabilitiesStatus)
      }
    >
      <SelectTrigger className="w-[140px] h-8">
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
