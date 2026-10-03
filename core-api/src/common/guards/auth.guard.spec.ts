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
  let request: {
    path: string;
    headers: Record<string, string>;
    params?: Record<string, string>;
    session?: unknown;
    user?: { id: string; role: Role };
  };
  let handlerFn: () => void;
  let classRef: new () => unknown;

  const makeContext = () =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handlerFn,
      getClass: () => classRef,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    getSession = jest.fn().mockResolvedValue(null);
    request = { path: '/api/system-configs', headers: {}, params: {} };
    handlerFn = function handler(): void {};
    classRef = class Controller {};

    reflector = new Reflector();
    guard = new AuthGuard(reflector, {
      options: { disabledPaths: ['mcp'] },
      api: { getSession },
    } as unknown as Auth);
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
      getSession.mockResolvedValue({
        session: { id: 's1' },
        user: { id: 'u1', role: Role.USER },
      });

      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('admits an admin on the same controller', async () => {
      applyClassRoles(Role.ADMIN);
      getSession.mockResolvedValue({
        session: { id: 's1' },
        user: { id: 'u1', role: Role.ADMIN },
      });

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });

    it('leaves unguarded controllers open to any authenticated user', async () => {
      getSession.mockResolvedValue({
        session: { id: 's1' },
        user: { id: 'u1', role: Role.USER },
      });

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });
  });

  it('still blocks unauthenticated requests with no header', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });
});