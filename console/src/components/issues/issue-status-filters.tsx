import { Checkbox } from '@/components/ui/checkbox';
import React, { useState } from 'react';

interface StatusFiltersProps {
  onStatusChange: (status: ('open' | 'closed')[]) => void;
  defaultStatus?: 'open' | 'closed';
}

export function IssueStatusFilters({
  onStatusChange,
  defaultStatus = 'open',
}: StatusFiltersProps) {
  const [selectedStatuses, setSelectedStatuses] = useState<
    ('open' | 'closed')[]
  >([defaultStatus]);

  const handleStatusChange = (status: 'open' | 'closed') => {
    setSelectedStatuses((prev) => {
      if (prev.includes(status)) {
        // Remove status if already selected
        const newStatuses = prev.filter((s) => s !== status);
        // If no statuses selected, return empty array to indicate no filter
        return newStatuses.length > 0 ? newStatuses : [];
      } else {
        // Add status if not selected
        return [...prev, status];
      }
    });
  };

  // Call parent function with the current status array when it changes
  React.useEffect(() => {
    onStatusChange(selectedStatuses);
  }, [selectedStatuses, onStatusChange]);

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id="open"
          checked={selectedStatuses.includes('open')}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') {
              handleStatusChange('open');
            }
          }}
        />
        <label htmlFor="open" className="text-sm font-medium text-foreground">
          Open
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="closed"
          checked={selectedStatuses.includes('closed')}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') {
              handleStatusChange('closed');
            }
          }}
        />
        <label htmlFor="closed" className="text-sm font-medium text-foreground">
          Closed
        </label>
      </div>
    </div>
  );
}
