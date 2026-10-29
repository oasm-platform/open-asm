import type { ValueTransformer } from 'typeorm';

/** pg returns bigint as a string; byte counts stay far below 2^53. */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : Number(value),
};
