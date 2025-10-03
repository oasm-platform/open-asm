import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { getSession } from 'better-auth/api';
import type { Auth } from 'better-auth/auth';
import { fromNodeHeaders } from 'better-auth/node';
import {
  API_GLOBAL_PREFIX,
  AUTH_INSTANCE_KEY,
  ROLE_METADATA_KEY,
} from '../constants/app.constants';
import { Role } from '../enums/enum';
import { RequestWithMetadata, UserContextPayload } from '../interfaces/app.interface';

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
  ) { }

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
    const request: RequestWithMetadata = context.switchToHttp().getRequest();
    const currentSession = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    const isDisabledAuth = this.auth.options.disabledPaths?.map(path => `/${API_GLOBAL_PREFIX}/${path}`)?.includes(request.path);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const isPublic = this.reflector.get('PUBLIC', context.getHandler());
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const isOptional = this.reflector.get('OPTIONAL', context.getHandler());
    if (isPublic || isDisabledAuth || (isOptional && !currentSession)) return true;

    if (!currentSession) {
      throw new UnauthorizedException();
    }

    request.session = currentSession.session;
    if (currentSession.user) {
      request.user = currentSession.user as UserContextPayload;
    }

    const rolesAccepted = this.reflector.get<Role[]>(
      ROLE_METADATA_KEY,
      context.getHandler(),
    );

    const userRole = request.user?.role;
    if (userRole) {
      this.validateUserRole(rolesAccepted, userRole);
    }
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
