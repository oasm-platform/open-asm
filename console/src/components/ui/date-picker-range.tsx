'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field } from '@/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { addDays, format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';

interface DatePickerWithRangeProps {
  value?: DateRange;
  onChange?: (date: DateRange | undefined) => void;
  className?: string;
}

const PRESET_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
];

export function DatePickerWithRange({
  value,
  onChange,
  className,
}: DatePickerWithRangeProps) {
  const internalDate = value ?? {
    from: new Date(new Date().getFullYear(), 0, 20),
    to: addDays(new Date(new Date().getFullYear(), 0, 20), 20),
  };

  const handleSelect = (date: DateRange | undefined) => {
    onChange?.(date);
  };

  const handlePresetClick = (days: number) => {
    const to = new Date();
    const from = addDays(to, -days);
    onChange?.({ from, to });
  };

  const handleClear = () => {
    onChange?.(undefined);
  };

  const hasValue = value?.from !== undefined;

  return (
    <Field className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="date-picker-range"
            className="justify-start px-2.5 font-normal gap-2"
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
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* Quick select options on the left */}
            <div className="flex flex-col gap-1 p-2 border-r border-border bg-muted/20">
              <span className="text-xs font-medium text-muted-foreground mb-1 px-2">
                Quick select
              </span>
              {PRESET_OPTIONS.map((option) => (
                <Button
                  key={option.days}
                  variant="ghost"
                  size="sm"
                  className="justify-start h-7 text-xs font-normal"
                  onClick={() => handlePresetClick(option.days)}
                >
                  {option.label}
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
                numberOfMonths={2}
              />
              {hasValue && (
                <div className="mt-2 pt-2 border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleClear}
                  >
                    Clear filters
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
