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
import { useT } from '@/lib/i18n-dictionary';
import { VulnerabilityStatus } from '@/services/apis/gen/queries';

/** Status filter options with display labels */
const STATUS_OPTIONS = [
  {
    value: VulnerabilityStatus.open,
    labelKey: 'vulnerabilities.status.open',
  },
  {
    value: VulnerabilityStatus.dismissed,
    labelKey: 'vulnerabilities.status.dismissed',
  },
  {
    value: VulnerabilityStatus.all,
    labelKey: 'vulnerabilities.status.all',
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
  const t = useT();
  return (
    <Select
      value={value}
      onValueChange={(val) => onValueChange(val as VulnerabilityStatus)}
    >
      <SelectTrigger className="border-dashed text-xs py-0">
        <SelectValue placeholder={t('vulnerabilities.statusFilter.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
