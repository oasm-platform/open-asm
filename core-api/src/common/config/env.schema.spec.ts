import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('accepts an environment that sets none of the checked variables', () => {
    expect(() => validateEnv({})).not.toThrow();
  });

  it('accepts well-formed values', () => {
    expect(() =>
      validateEnv({
        PORT: '6276',
        GRPC_PORT: '16276',
        POSTGRES_PORT: '5432',
        POSTGRES_SSL: 'false',
        REDIS_URL: 'redis://:password@localhost:6379/0',
        BASE_URL: 'https://app.example.com',
        TRUSTED_PROXIES: '172.16.0.0/12, 10.0.0.5, ::1',
        AUTH_RATE_LIMIT_DISABLED: 'true',
      }),
    ).not.toThrow();
  });

  it('treats an empty value as unset, like example.env leaves them', () => {
    expect(() =>
      validateEnv({ PORT: '', BASE_URL: '', TRUSTED_PROXIES: '', POSTGRES_SSL: '' }),
    ).not.toThrow();
  });

  it('hands the environment back unchanged', () => {
    const env = { PORT: '6276', OTHER: 'kept', NUMBER_LIKE: '007' };

    expect(validateEnv(env)).toEqual(env);
  });

  it('names every malformed variable in one error', () => {
    const run = () =>
      validateEnv({
        PORT: 'abc',
        GRPC_PORT: '70000',
        REDIS_URL: 'localhost:6379',
        BASE_URL: 'app.example.com',
        POSTGRES_SSL: 'TRUE',
        TRUSTED_PROXIES: '10.0.0.0/8, proxy.internal',
      });

    expect(run).toThrow(/PORT/);
    for (const variable of [
      'GRPC_PORT',
      'REDIS_URL',
      'BASE_URL',
      'POSTGRES_SSL',
      'TRUSTED_PROXIES',
    ]) {
      expect(run).toThrow(variable);
    }
    expect(run).toThrow('proxy.internal');
  });
});
