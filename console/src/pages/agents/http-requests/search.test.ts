import { describe, expect, it } from 'vitest';
import { httpRequestsSearchSchema } from './search';

const ID = '0193b8f2-6c1e-7a3b-9d4e-5f6a7b8c9d0e';

describe('httpRequestsSearchSchema', () => {
  it('keeps valid filters', () => {
    expect(
      httpRequestsSearchSchema.parse({
        conversationId: ID,
        host: 'api.acme',
        errorsOnly: true,
      }),
    ).toEqual({ conversationId: ID, host: 'api.acme', errorsOnly: true });
  });

  it('drops malformed filters instead of failing', () => {
    expect(
      httpRequestsSearchSchema.parse({
        conversationId: 'not-a-uuid',
        host: 42,
        errorsOnly: 'yes',
      }),
    ).toEqual({});
  });
});
