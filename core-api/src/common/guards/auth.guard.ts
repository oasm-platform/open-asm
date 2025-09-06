import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { getSession } from 'better-auth/api';
import { APIError } from 'better-auth/api';
import type { Auth } from 'better-auth/auth';
import { fromNodeHeaders } from 'better-auth/node';
import {
  AUTH_INSTANCE_KEY,
  ROLE_METADATA_KEY,
} from '../constants/app.constants';
import { Role } from '../enums/enum';

/**
 * Type representing a valid user session after authentication
 * Excludes null and undefined values from the session return type
 */
export type UserSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getSession>>>
>;

/**
 * NestJS guard that handles authentication for protected routes
 * Can be configured with @Public() or @Optional() decorators to modify authentication behavior
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AUTH_INSTANCE_KEY)
    private readonly auth: Auth,
  ) {}

  /**
   * Validates if the current request is authenticated
   * Attaches session and user information to the request object
   * @param context - The execution context of the current request
   * @returns True if the request is authorized to proceed, throws an error otherwise
   */
  /**
   * Validates if the current request is authenticated
   * Attaches session and user information to the request object
   * @param context - The execution context of the current request
   * @returns True if the request is authorized to proceed, throws an error otherwise
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = context.switchToHttp().getRequest();
    const session = await this.auth.api.getSession({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      headers: fromNodeHeaders(request.headers),
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    request.session = session;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    request.user = session?.user ?? null; // useful for observability tools like Sentry

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const isPublic = this.reflector.get('PUBLIC', context.getHandler());
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const isOptional = this.reflector.get('OPTIONAL', context.getHandler());

    if (isPublic || (isOptional && !session)) return true;

    if (!session) {
      throw new APIError(401, {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

    const rolesAccepted = this.reflector.get<Role[]>(
      ROLE_METADATA_KEY,
      context.getHandler(),
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const userRole = request.user?.role;
    this.validateUserRole(rolesAccepted, userRole);
    return true;
  }

  private validateUserRole(
    rolesAccepted: Role[] | undefined,
    userRole: string,
  ) {
    if (
      rolesAccepted?.length &&
      !(rolesAccepted as string[]).includes(userRole)
    ) {
      throw new ForbiddenException(`Role ${userRole} cannot access`);
    }
  }
}
