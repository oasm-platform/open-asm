import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IssuesControllerGetManyStatusItem,
  type IssuesControllerGetManyStatusItem as IssueStatus,
} from '@/services/apis/gen/queries';

const STATUS_OPTIONS = [
  {
    value: IssuesControllerGetManyStatusItem.open,
    label: 'Open',
  },
  {
    value: IssuesControllerGetManyStatusItem.closed,
    label: 'Closed',
  },
  {
    value: 'all' as const,
    label: 'All',
  },
] as const;

interface StatusFilterProps {
  value: IssueStatus | 'all';
  onValueChange: (value: IssueStatus | 'all') => void;
}

export function StatusFilter({ value, onValueChange }: StatusFilterProps) {
  return (
    <Select
      value={value}
      onValueChange={(val) =>
        onValueChange(val as IssueStatus | 'all')
      }
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
