'use client';

import { useT } from '@/lib/i18n-dictionary';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field } from '@/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { addDays, format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';

interface DatePickerWithRangeProps {
  value?: DateRange;
  onChange?: (date: DateRange | undefined) => void;
  className?: string;
  label?: string;
}

const PRESET_DAYS = [0, 7, 30, 60, 90];

export function DatePickerWithRange({
  value,
  onChange,
  className,
  label,
}: DatePickerWithRangeProps) {
  const t = useT();
  const isMobile = useIsMobile();
  const internalDate = value ?? {
    from: new Date(new Date().getFullYear(), 0, 20),
    to: addDays(new Date(new Date().getFullYear(), 0, 20), 20),
  };

  const handleSelect = (date: DateRange | undefined) => {
    onChange?.(date);
  };

  const handlePresetClick = (days: number) => {
    const to = new Date();
    const from = days === 0 ? new Date() : addDays(to, -days);
    onChange?.({ from, to });
  };

  const handleClear = () => {
    onChange?.(undefined);
  };

  const hasValue = value?.from !== undefined || value?.to !== undefined;

  return (
    <Field className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="date-picker-range"
            className="h-9 justify-start px-2.5 font-normal gap-2 border-dashed"
          >
            <CalendarIcon className="h-4 w-4" />
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, 'LLL dd, y')} -{' '}
                  {format(value.to, 'LLL dd, y')}
                </>
              ) : (
                format(value.from, 'LLL dd, y')
              )
            ) : value?.to ? (
              format(value.to, 'LLL dd, y')
            ) : (
              <span>{label ?? t('components.dateRange.placeholder')}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto max-h-(--radix-popover-content-available-height) overflow-y-auto p-0"
          align="start"
        >
          {/* Phones: presets wrap above a single month; md+: presets on the left of two months. */}
          <div className="flex flex-col md:flex-row">
            {/* Quick select options */}
            <div className="flex flex-row flex-wrap gap-1 p-2 border-b border-border bg-muted/20 md:flex-col md:flex-nowrap md:border-b-0 md:border-r">
              <span className="w-full text-xs font-medium text-muted-foreground mb-1 px-2 md:w-auto">
                {t('components.dateRange.quickSelect')}
              </span>
              {PRESET_DAYS.map((days) => (
                <Button
                  key={days}
                  variant="ghost"
                  size="sm"
                  className="justify-start h-7 text-xs font-normal"
                  onClick={() => handlePresetClick(days)}
                >
                  {days === 0
                    ? t('components.dateRange.today')
                    : t('components.dateRange.lastDays', { days })}
                </Button>
              ))}
            </div>
            {/* Calendar on the right */}
            <div>
              <Calendar
                mode="range"
                defaultMonth={internalDate?.from}
                selected={value}
                onSelect={handleSelect}
                numberOfMonths={isMobile ? 1 : 2}
              />
              {hasValue && (
                <div className="mt-2 pt-2 border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleClear}
                  >
                    {t('components.filter.clear')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
