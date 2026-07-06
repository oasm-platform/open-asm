/**
 * ScopeFilter Component
 *
 * A dropdown select component for filtering targets by scope (INTERNAL/EXTERNAL).
 * Used in the targets list page toolbar.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TargetScopeType } from '@/services/apis/gen/queries';

/** All option value for filtering */
const ALL_VALUE = 'ALL';

/** Scope filter options */
const SCOPE_OPTIONS = [
  { value: ALL_VALUE, label: 'All targets' },
  { value: TargetScopeType.INTERNAL, label: 'Internal' },
  { value: TargetScopeType.EXTERNAL, label: 'External' },
] as const;

interface ScopeFilterProps {
  /** Current selected filter value */
  value: TargetScopeType | undefined;
  /** Callback when filter selection changes */
  onValueChange: (value: TargetScopeType | undefined) => void;
}

/**
 * Renders a select dropdown for filtering targets by scope.
 */
export function ScopeFilter({ value, onValueChange }: ScopeFilterProps) {
  const currentValue = value ?? ALL_VALUE;

  const handleChange = (val: string) => {
    onValueChange(val === ALL_VALUE ? undefined : (val as TargetScopeType));
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className="border-dashed text-xs py-0 focus:ring-0 focus:ring-offset-0 focus:outline-none">
        <SelectValue placeholder="Scope" />
      </SelectTrigger>
      <SelectContent>
        {SCOPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}