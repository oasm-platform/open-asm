import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/lib/i18n-dictionary';
import {
  JobsRegistryControllerGetManyJobHistoriesJobRunType,
  JobsRegistryControllerGetManyJobHistoriesJobStatus,
} from '@/services/apis/gen/queries';

/** `all` is a UI convention: the API treats it as "no filter". Its label has to
 * name the dimension, or both dropdowns would read a bare "All". Labels are
 * dictionary keys (`<prefix>.<value>`), resolved at render. */
const toOptions = (values: readonly string[], prefix: string) =>
  values.map((value) => ({ value, labelKey: `${prefix}.${value}` }));

const STATUS_OPTIONS = toOptions(
  Object.values(JobsRegistryControllerGetManyJobHistoriesJobStatus),
  'jobsRegistry.filter.status',
);
const RUN_TYPE_OPTIONS = toOptions(
  Object.values(JobsRegistryControllerGetManyJobHistoriesJobRunType),
  'jobsRegistry.filter.runType',
);

interface RunFilterSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: { value: string; labelKey: string }[];
}

function RunFilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
}: RunFilterSelectProps) {
  const t = useT();
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger size="sm" className="border-dashed py-0 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Status dropdown. Options come from the generated API enum, so the UI can
 * never send a status the API rejects. */
export function RunStatusFilter(props: Omit<RunFilterSelectProps, 'options' | 'placeholder'>) {
  const t = useT();
  return (
    <RunFilterSelect {...props} placeholder={t('common.status')} options={STATUS_OPTIONS} />
  );
}

/** Run type dropdown: manual vs scheduled. */
export function RunTypeFilter(props: Omit<RunFilterSelectProps, 'options' | 'placeholder'>) {
  const t = useT();
  return (
    <RunFilterSelect
      {...props}
      placeholder={t('jobsRegistry.filter.runTypePlaceholder')}
      options={RUN_TYPE_OPTIONS}
    />
  );
}
