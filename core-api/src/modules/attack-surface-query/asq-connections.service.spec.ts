import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

import { AsqConnectionsService } from './asq-connections.service';

const withConfig = (values: Record<string, string | undefined>) =>
  new AsqConnectionsService(
    {} as DataSource,
    { get: (key: string) => values[key] } as unknown as ConfigService,
  );

describe('AsqConnectionsService cursor key', () => {
  it('boots without BETTER_AUTH_SECRET in a local or test run, like the auth module', () => {
    // Jest runs with NODE_ENV=test; the CI e2e job sets no BETTER_AUTH_SECRET.
    const service = withConfig({});
    const cursor = service.codec.encode('sig', 'w1', ['k']);
    expect(service.codec.decode(cursor, 'sig', 'w1', 1)).toEqual(['k']);
  });

  it('signs with the configured secret', () => {
    const a = withConfig({ BETTER_AUTH_SECRET: 'a'.repeat(40) });
    const b = withConfig({ BETTER_AUTH_SECRET: 'b'.repeat(40) });
    expect(() => b.codec.decode(a.codec.encode('sig', 'w1', ['k']), 'sig', 'w1', 1)).toThrow();
  });
});
