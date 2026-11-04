import {
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Range bounds for each of the 5 standard cron fields
 * (minute, hour, day-of-month, month, day-of-week).
 * Day-of-week allows 0-7 where both 0 and 7 are Sunday.
 */
const FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week
];

/**
 * Validates a single cron field: a star, a step variant (star or range
 * followed by "/n"), a plain value, a range "a-b", or a comma-separated
 * list of those. Mirrors the acceptance rules of cron-parser (the parser
 * BullMQ uses for repeat patterns), so values that pass here are also
 * accepted by the queue instead of failing at job-add time with a 500.
 */
function isCronField(field: string, min: number, max: number): boolean {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const base = stepMatch ? stepMatch[1] : part;
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    if (!Number.isInteger(step) || step < 1) return false;

    if (base === '*') continue;

    const rangeMatch = base.match(/^(\d+)(?:-(\d+))?$/);
    if (!rangeMatch) return false;
    const from = Number(rangeMatch[1]);
    const to = rangeMatch[2] ? Number(rangeMatch[2]) : from;
    if (from < min || from > max || to < min || to > max || to < from) {
      return false;
    }
    // Step on a single value ("1/5") is rejected by cron-parser.
    if (stepMatch && !rangeMatch[2]) return false;
  }
  return true;
}

/** Accepts a 5-field cron expression or the literal "disabled". */
export function isValidCronSchedule(value: string): boolean {
  if (value === 'disabled') return true;
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => {
    const [min, max] = FIELD_RANGES[index];
    return isCronField(field, min, max);
  });
}

@ValidatorConstraint({ name: 'isCronSchedule', async: false })
export class IsCronScheduleConstraint
  implements ValidatorConstraintInterface
{
  validate(value: string): boolean {
    return typeof value === 'string' && isValidCronSchedule(value);
  }

  defaultMessage(): string {
    return 'schedule must be a valid 5-field cron expression or "disabled"';
  }
}

/** Class-validator decorator for 5-field cron expressions ("disabled" allowed). */
export function IsCronSchedule(): PropertyDecorator {
  return Validate(IsCronScheduleConstraint);
}
