import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UpdateTargetDtoScanSchedule } from '@/services/apis/gen/queries';
import { Clock, X } from 'lucide-react';

interface ScanScheduleSelectProps {
  value: UpdateTargetDtoScanSchedule;
  onChange: (value: UpdateTargetDtoScanSchedule) => void;
  disabled?: boolean;
}

const scheduleOptions = [
  {
    value: UpdateTargetDtoScanSchedule['disabled'],
    label: 'Disabled',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*_*_*'],
    label: 'Daily',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*/3_*_*'],
    label: 'Every 3 days',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*_*_0'],
    label: 'Weekly',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*/14_*_*'],
    label: 'Every 2 weeks',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_1_*_*'],
    label: 'Monthly',
  },
];

export const ScanScheduleSelect = ({
  value,
  onChange,
  disabled,
}: ScanScheduleSelectProps) => {
  return (
    <Select disabled={disabled} value={value} onValueChange={onChange}>
      <SelectTrigger id="scan-frequency" className="w-[160px] h-9 text-sm">
        <SelectValue placeholder="Select frequency" />
      </SelectTrigger>
      <SelectContent>
        {scheduleOptions.map((option) => (
          <SelectItem
            className="cursor-pointer"
            key={option.value}
            value={option.value}
          >
            {option.value === UpdateTargetDtoScanSchedule.disabled ? (
              <X className="inline-block w-4 h-4 mr-2" />
            ) : (
              <Clock className="inline-block w-4 h-4 mr-2" />
            )}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
