// better-auth ships ESM that the SWC jest transform does not process; the hook
// only needs APIError and isAPIError, so stub them.
jest.mock('better-auth/api', () => {
  class APIError extends Error {
    constructor(
      readonly status: string,
      readonly body?: { message?: string; code?: string },
    ) {
      super(body?.message);
    }
  }
  return {
    APIError,
    isAPIError: (value: unknown) => value instanceof APIError,
  };
});

import { PENDING_APPROVAL_REASON } from '@/common/constants/app.constants';
import type { User } from '@/modules/auth/entities/user.entity';
import { APIError } from 'better-auth/api';
import type { Repository } from 'typeorm';
import type { SystemConfigsService } from '../system-configs/system-configs.service';
import { PendingApprovalHook } from './pending-approval.hook';

const pendingUser = (overrides: Partial<User> = {}) =>
  ({
    id: 'user-1',
    email: 'ada@example.com',
    banned: true,
    banReason: PENDING_APPROVAL_REASON,
    emailVerified: false,
    ...overrides,
  }) as User;

describe('PendingApprovalHook', () => {
  let findOneBy: jest.Mock;
  let getMailServer: jest.Mock;
  let hook: PendingApprovalHook;

  beforeEach(() => {
    findOneBy = jest.fn().mockResolvedValue(pendingUser());
    getMailServer = jest.fn().mockResolvedValue({ enabled: true });
    hook = new PendingApprovalHook(
      { findOneBy } as unknown as Repository<User>,
      { getMailServer } as unknown as SystemConfigsService,
    );
  });

  describe('approving (unbanning)', () => {
    it('waits for a sign-up to confirm its email', async () => {
      await expect(
        hook.requireVerifiedEmail({ body: { userId: 'user-1' } }),
      ).rejects.toMatchObject({
        status: 'FORBIDDEN',
        body: { code: 'EMAIL_NOT_VERIFIED' },
      });
      expect(findOneBy).toHaveBeenCalledWith({ id: 'user-1' });
    });

    it('lets a confirmed sign-up through', async () => {
      findOneBy.mockResolvedValue(pendingUser({ emailVerified: true }));

      await expect(
        hook.requireVerifiedEmail({ body: { userId: 'user-1' } }),
      ).resolves.toBeUndefined();
    });

    it('leaves an ordinary ban alone', async () => {
      findOneBy.mockResolvedValue(pendingUser({ banReason: 'Spam' }));

      await expect(
        hook.requireVerifiedEmail({ body: { userId: 'user-1' } }),
      ).resolves.toBeUndefined();
    });

    it('lets the admin decide while the mail server is off', async () => {
      getMailServer.mockResolvedValue({ enabled: false });

      await expect(
        hook.requireVerifiedEmail({ body: { userId: 'user-1' } }),
      ).resolves.toBeUndefined();
    });
  });

  describe('signing in', () => {
    const banned = () =>
      new APIError('FORBIDDEN', { message: 'not active', code: 'BANNED_USER' });

    it('asks an unconfirmed sign-up to verify its email', async () => {
      await expect(
        hook.explainUnverifiedSignIn({
          body: { email: 'Ada@Example.com' },
          context: { returned: banned() },
        }),
      ).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });
      expect(findOneBy).toHaveBeenCalledWith({ email: 'ada@example.com' });
    });

    it('keeps the ban message for a confirmed sign-up', async () => {
      findOneBy.mockResolvedValue(pendingUser({ emailVerified: true }));

      await expect(
        hook.explainUnverifiedSignIn({
          body: { email: 'ada@example.com' },
          context: { returned: banned() },
        }),
      ).resolves.toBeUndefined();
    });

    it('ignores other outcomes without a lookup', async () => {
      await hook.explainUnverifiedSignIn({
        body: { email: 'ada@example.com' },
        context: {
          returned: new APIError('UNAUTHORIZED', {
            code: 'INVALID_EMAIL_OR_PASSWORD',
          }),
        },
      });
      await hook.explainUnverifiedSignIn({
        body: { email: 'ada@example.com' },
        context: { returned: { token: 't' } },
      });

      expect(findOneBy).not.toHaveBeenCalled();
    });
  });
});
