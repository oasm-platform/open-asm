import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/lib/i18n-dictionary';
import { UpdateTargetDtoScanSchedule } from '@/services/apis/gen/queries';
import { Clock, X } from 'lucide-react';

interface ScanScheduleSelectProps {
  value?: UpdateTargetDtoScanSchedule;
  onChange: (value: UpdateTargetDtoScanSchedule) => void;
  disabled?: boolean;
}

const scheduleOptions = [
  {
    value: UpdateTargetDtoScanSchedule['disabled'],
    labelKey: 'projects.scanSchedule.disabled',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*_*_*'],
    labelKey: 'projects.scanSchedule.daily',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*/3_*_*'],
    labelKey: 'projects.scanSchedule.every3Days',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*_*_0'],
    labelKey: 'projects.scanSchedule.weekly',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_*/14_*_*'],
    labelKey: 'projects.scanSchedule.every2Weeks',
  },
  {
    value: UpdateTargetDtoScanSchedule['0_0_1_*_*'],
    labelKey: 'projects.scanSchedule.monthly',
  },
];

export const ScanScheduleSelect = ({
  value = UpdateTargetDtoScanSchedule.disabled,
  onChange,
  disabled,
}: ScanScheduleSelectProps) => {
  const t = useT();
  return (
    <Select disabled={disabled} value={value} onValueChange={onChange}>
      <SelectTrigger id="scan-frequency" className="w-[160px] h-9 text-sm">
        <SelectValue placeholder={t('projects.scanSchedule.placeholder')} />
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
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
