import { Logger } from '@nestjs/common';
import { logBetterAuth } from './auth-logger';

const BASE_URL_WARNING =
  '[better-auth] Base URL is not set. Set the baseURL option or BETTER_AUTH_URL env, or use a dynamic baseURL with allowedHosts for multi-host setups.';

describe('logBetterAuth', () => {
  const nodeEnv = process.env.NODE_ENV;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    jest.restoreAllMocks();
  });

  it.each([['production'], [undefined]])(
    'asks for BASE_URL, not BETTER_AUTH_URL, when deployed (NODE_ENV=%s)',
    (nodeEnv) => {
      if (nodeEnv) process.env.NODE_ENV = nodeEnv;
      else delete process.env.NODE_ENV;

      logBetterAuth('warn', BASE_URL_WARNING);

      expect(warn).toHaveBeenCalledTimes(1);
      const [message] = warn.mock.calls[0] as [string];
      expect(message).toContain('BASE_URL is not set');
      expect(message).not.toContain('BETTER_AUTH_URL');
    },
  );

  it.each(['development', 'test'])(
    'stays quiet about the base URL locally (NODE_ENV=%s)',
    (nodeEnv) => {
      process.env.NODE_ENV = nodeEnv;

      logBetterAuth('warn', BASE_URL_WARNING);

      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('passes other messages through at their level', () => {
    const cause = new Error('boom');

    logBetterAuth('warn', 'Rate limit storage is memory');
    logBetterAuth('error', 'Failed to create user', cause);

    expect(warn).toHaveBeenCalledWith('Rate limit storage is memory');
    expect(error).toHaveBeenCalledWith('Failed to create user', cause);
  });
});
