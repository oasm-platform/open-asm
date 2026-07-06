/**
 * ScanStatusFilter Component
 *
 * A dropdown select component for filtering targets by scan status
 * (pending/in_progress/completed/failed/cancelled/All).
 * Used in the targets list page toolbar.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JobStatus } from '@/services/apis/gen/queries';

/** All option value for filtering */
const ALL_VALUE = 'ALL';

/** Status filter options with display labels and colors matching JobStatusBadge */
const STATUS_OPTIONS = [
  { value: ALL_VALUE, label: 'All statuses', color: 'bg-muted-foreground' },
  { value: JobStatus.pending, label: 'Pending', color: 'bg-yellow-500' },
  { value: JobStatus.in_progress, label: 'In Progress', color: 'bg-purple-500' },
  { value: JobStatus.completed, label: 'Completed', color: 'bg-green-500' },
  { value: JobStatus.failed, label: 'Failed', color: 'bg-red-500' },
  { value: JobStatus.cancelled, label: 'Cancelled', color: 'bg-gray-500' },
] as const;

interface ScanStatusFilterProps {
  /** Current selected status value */
  value: JobStatus | undefined;
  /** Callback when status selection changes */
  onValueChange: (value: JobStatus | undefined) => void;
}

/**
 * Renders a select dropdown for filtering targets by scan status.
 */
export function ScanStatusFilter({ value, onValueChange }: ScanStatusFilterProps) {
  const currentValue = value ?? ALL_VALUE;

  const handleChange = (val: string) => {
    onValueChange(val === ALL_VALUE ? undefined : (val as JobStatus));
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className="border-dashed text-xs py-0 focus:ring-0 focus:ring-offset-0 focus:outline-none">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
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
