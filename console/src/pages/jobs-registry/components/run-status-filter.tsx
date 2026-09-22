import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  JobsRegistryControllerGetManyJobHistoriesJobRunType,
  JobsRegistryControllerGetManyJobHistoriesJobStatus,
} from '@/services/apis/gen/queries';

/** `all` is a UI convention: the API treats it as "no filter". Its label has to
 * name the dimension, or both dropdowns would read a bare "All". */
const toOptions = (values: readonly string[], allLabel: string) =>
  values.map((value) => ({
    value,
    label:
      value === 'all'
        ? allLabel
        : value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
  }));

const STATUS_OPTIONS = toOptions(
  Object.values(JobsRegistryControllerGetManyJobHistoriesJobStatus),
  'All statuses',
);
const RUN_TYPE_OPTIONS = toOptions(
  Object.values(JobsRegistryControllerGetManyJobHistoriesJobRunType),
  'All types',
);

interface RunFilterSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}

function RunFilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
}: RunFilterSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger size="sm" className="border-dashed py-0 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Status dropdown. Options come from the generated API enum, so the UI can
 * never send a status the API rejects. */
export function RunStatusFilter(props: Omit<RunFilterSelectProps, 'options' | 'placeholder'>) {
  return (
    <RunFilterSelect {...props} placeholder="Status" options={STATUS_OPTIONS} />
  );
}

/** Run type dropdown: manual vs scheduled. */
export function RunTypeFilter(props: Omit<RunFilterSelectProps, 'options' | 'placeholder'>) {
  return (
    <RunFilterSelect
      {...props}
      placeholder="Run type"
      options={RUN_TYPE_OPTIONS}
    />
  );
}
