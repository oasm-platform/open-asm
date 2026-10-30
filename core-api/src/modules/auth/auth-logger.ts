import { Logger } from '@nestjs/common';
import { isLocalEnv } from '@/common/config/runtime-env';

const logger = new Logger('BetterAuth');

/**
 * better-auth warns at boot when it has no base URL and names BETTER_AUTH_URL;
 * here the URL comes from BASE_URL, so that warning is told in its terms.
 * Matched by text: better-auth is pinned to an exact version.
 */
const isBaseUrlMissingWarning = (message: string) =>
  message.startsWith('[better-auth] Base URL is not set');

/** better-auth's `logger.log`: its messages go through Nest's logger */
export function logBetterAuth(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  ...args: unknown[]
): void {
  if (isBaseUrlMissingWarning(message)) {
    // Normal while developing locally, where Telegram polls instead
    if (!isLocalEnv()) {
      logger.warn(
        'BASE_URL is not set: links in auth emails, such as email verification, use the host of the incoming request. Set BASE_URL to the public URL of the console.',
      );
    }
    return;
  }
  if (level === 'error') logger.error(message, ...args);
  else if (level === 'warn') logger.warn(message, ...args);
  else if (level === 'debug') logger.debug(message, ...args);
  else logger.log(message, ...args);
}
