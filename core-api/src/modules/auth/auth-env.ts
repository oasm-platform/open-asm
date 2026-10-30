import { isLocalEnv } from '@/common/config/runtime-env';

/** better-auth's built-in fallback secret; public, so it may only sign locally */
const PUBLIC_DEFAULT_SECRET = 'better-auth-secret-12345678901234567890';
const MIN_SECRET_LENGTH = 32;

/**
 * The secret that signs session cookies and email verification links.
 * Deployed, it must be set (BETTER_AUTH_SECRET), long and not better-auth's
 * public default, or the API refuses to boot: with a known secret anyone can
 * forge both. Locally, leaving it empty falls back to that default.
 */
export function resolveAuthSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const secret = env.BETTER_AUTH_SECRET || undefined;
  if (isLocalEnv(env)) return secret;
  if (
    !secret ||
    secret === PUBLIC_DEFAULT_SECRET ||
    secret.length < MIN_SECRET_LENGTH
  ) {
    throw new Error(
      `BETTER_AUTH_SECRET must be a random value of at least ${MIN_SECRET_LENGTH} characters (e.g. \`openssl rand -base64 32\`). It signs sessions and email verification links.`,
    );
  }
  return secret;
}
