import { isIpOrCidr } from '@/common/utils/ip-range.util';
import { z } from 'zod';
import { parseTrustedProxies } from './trusted-proxies';

/** An empty value means unset, as `example.env` leaves optional variables. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const port = z
  .string()
  .regex(/^\d+$/, 'must be a whole number')
  .refine((value) => Number(value) >= 1 && Number(value) <= 65535, {
    message: 'must be a port between 1 and 65535',
  });

const url = (protocols: string[], label: string) =>
  z.string().refine(
    (value) =>
      URL.canParse(value) && protocols.includes(new URL(value).protocol),
    { message: `must be ${label}` },
  );

const boolean = z.enum(['true', 'false'], {
  errorMap: () => ({ message: 'must be true or false' }),
});

const ipList = z.string().superRefine((value, ctx) => {
  const invalid = parseTrustedProxies(value).filter((entry) => !isIpOrCidr(entry));
  if (invalid.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `must list IPs or CIDR ranges, not ${invalid.join(', ')}`,
    });
  }
});

/**
 * Format checks for the variables whose code would otherwise misread a bad
 * value without saying so: a port parsed to NaN, a Redis or console URL that
 * is not one, `POSTGRES_SSL=TRUE` meaning "off", a TRUSTED_PROXIES entry that
 * is silently skipped. Nothing here makes a variable required; the variables
 * with their own boot checks (ENCRYPTION_KEYS, BETTER_AUTH_SECRET,
 * TRUSTED_ORIGINS, the storage settings) keep them.
 */
const envSchema = z
  .object({
    PORT: optional(port),
    GRPC_PORT: optional(port),
    POSTGRES_PORT: optional(port),
    POSTGRES_SSL: optional(boolean),
    REDIS_URL: optional(url(['redis:', 'rediss:'], 'a redis:// or rediss:// URL')),
    BASE_URL: optional(url(['http:', 'https:'], 'an http(s) URL')),
    TRUSTED_PROXIES: optional(ipList),
    AUTH_RATE_LIMIT_DISABLED: optional(boolean),
  })
  .passthrough();

/**
 * `ConfigModule` validator: refuses to boot on a malformed value, naming every
 * one, and hands the environment back unchanged so `ConfigService` keeps
 * returning the raw strings it always has.
 */
export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return env;
}
