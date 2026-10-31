// better-auth ships ESM that the SWC jest transform does not process; the hook
// only needs APIError, so stub it with a class that keeps the status and body.
jest.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {
    constructor(
      readonly status: string,
      readonly body?: { message?: string },
    ) {
      super(body?.message);
    }
  },
}));

import { APIError } from 'better-auth/api';
import { SignUpHook } from './sign-up.hook';
import type { SystemConfigsService } from './system-configs.service';

describe('SignUpHook', () => {
  const request = new Request('http://localhost/api/auth/sign-up/email', {
    method: 'POST',
  });
  let isSignUpAllowed: jest.Mock;
  let hook: SignUpHook;

  beforeEach(() => {
    isSignUpAllowed = jest.fn();
    hook = new SignUpHook({
      isSignUpAllowed,
    } as unknown as SystemConfigsService);
  });

  it('refuses an HTTP sign-up while sign-up is closed', async () => {
    isSignUpAllowed.mockResolvedValue(false);

    const result = hook.gateSignUp({ request });

    await expect(result).rejects.toBeInstanceOf(APIError);
    await expect(result).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: { message: 'Sign-up is disabled' },
    });
  });

  it('lets an HTTP sign-up through once sign-up is open', async () => {
    isSignUpAllowed.mockResolvedValue(true);

    await expect(hook.gateSignUp({ request })).resolves.toBeUndefined();
  });

  it('never blocks a server-side sign-up such as the first-admin bootstrap', async () => {
    await expect(hook.gateSignUp({})).resolves.toBeUndefined();
    expect(isSignUpAllowed).not.toHaveBeenCalled();
  });
});
