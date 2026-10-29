import type { ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Auth } from 'better-auth/auth';

// better-auth ships ESM that the SWC jest transform does not process; the guard
// only needs fromNodeHeaders, so stub the module (same approach as
// notifications.controller.spec.ts).
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

import type { UserPresenceService } from '@/modules/auth/user-presence.service';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'better-auth/auth';
import { ROLE_METADATA_KEY } from '../constants/app.constants';
import { Role } from '../enums/enum';
import { AuthGuard } from './auth.guard';

/**
 * Regression coverage for the two control-plane defects fixed in
 * security-patch-2026-10-03:
 *
 *  - the MCP API-key header bypassed the GLOBAL guard on every route
 *  - class-level `@Roles(...)` was read with Reflector.get (handler only) and
 *    therefore enforced nothing
 */
describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let getSession: jest.Mock;
  let presence: { touch: jest.Mock };
  let request: {
    path: string;
    headers: Record<string, string>;
    params?: Record<string, string>;
    session?: unknown;
    user?: { id: string; role: Role };
  };
  let response: { append: jest.Mock };
  let handlerFn: () => void;
  let classRef: new () => unknown;

  const makeContext = () =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => handlerFn,
      getClass: () => classRef,
    }) as unknown as ExecutionContext;

  const signedInAs = (role: Role, headers: Headers | null = null) =>
    getSession.mockResolvedValue({
      headers,
      response: { session: { id: 's1' }, user: { id: 'u1', role } },
    });

  beforeEach(() => {
    // Shape of getSession({ returnHeaders: true }).
    getSession = jest.fn().mockResolvedValue({ headers: null, response: null });
    response = { append: jest.fn() };
    request ={ path: '/api/admin/system-configs', headers: {}, params: {} };
    handlerFn = function handler(): void {};
    classRef = class Controller {};

    presence = { touch: jest.fn() };

    reflector = new Reflector();
    guard = new AuthGuard(
      reflector,
      {
        options: { disabledPaths: ['mcp'] },
        api: { getSession },
      } as unknown as Auth,
      presence as unknown as UserPresenceService,
    );
  });

  describe('MCP API key bypass is scoped to /api/mcp', () => {
    it('rejects a junk x-oasm-api-key header on a non-MCP route', async () => {
      // Regression: this header used to short-circuit the guard globally, so a
      // request carrying any value reached every non-public route unauthenticated.
      request.headers['x-oasm-api-key'] = 'x';

      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    });

    it('still lets an MCP route through so McpGuard can validate the key', async () => {
      request.path = '/api/mcp';
      request.headers['x-oasm-api-key'] = 'x';

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
      expect(getSession).not.toHaveBeenCalled();
    });

    it('covers MCP sub-paths', async () => {
      request.path = '/api/mcp/message';
      request.headers['x-oasm-api-key'] = 'x';

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });
  });

  describe('class-level @Roles is enforced', () => {
    // ROLE_METADATA_KEY is a unique Symbol(), not a global registry symbol, so
    // the metadata must be attached with the very constant the guard reads.
    const applyClassRoles = (...roles: Role[]) =>
      Reflect.defineMetadata(ROLE_METADATA_KEY, roles, classRef);

    it('rejects a non-admin on a class-level @Roles(Role.ADMIN) controller', async () => {
      applyClassRoles(Role.ADMIN);
      signedInAs(Role.USER);

      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('admits an admin on the same controller', async () => {
      applyClassRoles(Role.ADMIN);
      signedInAs(Role.ADMIN);

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });

    it('leaves unguarded controllers open to any authenticated user', async () => {
      signedInAs(Role.USER);

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });
  });

  describe('session refresh cookie', () => {
    it('forwards the cookies getSession re-issued onto the response', async () => {
      const headers = new Headers();
      headers.append('Set-Cookie', 'better-auth.session=tok.sig; Max-Age=604800');
      headers.append('Set-Cookie', 'other=1');
      signedInAs(Role.USER, headers);

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
      expect(response.append).toHaveBeenCalledWith('Set-Cookie', [
        'better-auth.session=tok.sig; Max-Age=604800',
        'other=1',
      ]);
    });

    it('leaves the response alone when no cookie was re-issued', async () => {
      signedInAs(Role.USER, new Headers());

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
      expect(response.append).not.toHaveBeenCalled();
    });

    it('forwards a cleared cookie even when the session is rejected', async () => {
      const headers = new Headers();
      headers.append('Set-Cookie', 'better-auth.session=; Max-Age=0');
      getSession.mockResolvedValue({ headers, response: null });

      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(response.append).toHaveBeenCalledWith('Set-Cookie', [
        'better-auth.session=; Max-Age=0',
      ]);
    });
  });

  describe('presence', () => {
    it('records the signed-in user, even when the role check fails', async () => {
      Reflect.defineMetadata(ROLE_METADATA_KEY, [Role.ADMIN], classRef);
      signedInAs(Role.USER);

      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
      expect(presence.touch).toHaveBeenCalledWith('u1');
    });

    it('does not record an impersonated session', async () => {
      getSession.mockResolvedValue({
        headers: null,
        response: {
          session: { id: 's1', impersonatedBy: 'admin-1' },
          user: { id: 'u1', role: Role.USER },
        },
      });

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
      expect(presence.touch).not.toHaveBeenCalled();
    });

    it('does not record a rejected request', async () => {
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(presence.touch).not.toHaveBeenCalled();
    });
  });

  it('still blocks unauthenticated requests with no header', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });
});