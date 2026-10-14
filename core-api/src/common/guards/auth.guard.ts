import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { getSession } from 'better-auth/api';
import type { Auth } from 'better-auth/auth';
import { fromNodeHeaders } from 'better-auth/node';
import {
  API_GLOBAL_PREFIX,
  AUTH_INSTANCE_KEY,
  MCP_API_KEY_HEADER,
  MCP_AUTH_PATH,
  ROLE_METADATA_KEY,
} from '../constants/app.constants';
import { Role } from '../enums/enum';
import {
  RequestWithMetadata,
  UserContextPayload,
} from '../interfaces/app.interface';

/**
 * Type representing a valid user session after authentication
 * Excludes null and undefined values from the session return type
 */
export type UserSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getSession>>>
>;

/**
 * True when the request targets the MCP controller. Prefix-matched so
 * `/api/mcp/message` is covered alongside `/api/mcp` itself.
 */
function isMcpPath(requestPath: string): boolean {
  const mcpPath = `/${API_GLOBAL_PREFIX}/${MCP_AUTH_PATH}`;
  return requestPath === mcpPath || requestPath.startsWith(`${mcpPath}/`);
}

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
    const request: RequestWithMetadata = context.switchToHttp().getRequest();

    // Check disabled paths FIRST — before any session lookup.
    // Disabled paths (like /api/mcp) rely on their own auth (e.g. McpGuard)
    // and don't need a browser session. Uses prefix match so sub-paths
    // like /api/mcp/message are also excluded.
    const disabledPaths = this.auth.options.disabledPaths
      ?.map((path) => `/${API_GLOBAL_PREFIX}/${path}`) ?? [];
    const isDisabledAuth = disabledPaths.some(
      (p) => request.path === p || request.path.startsWith(p + '/'),
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const isPublic = this.reflector.get('PUBLIC', context.getHandler());
    if (isPublic || isDisabledAuth) return true;

    // MCP requests authenticate with an API key instead of a browser session;
    // McpGuard (method guard on the MCP controller) validates the key and sets
    // workspaceId. Scope the bypass to the MCP path itself — testing the header
    // alone let ANY route be reached unauthenticated by sending a junk value.
    if (
      request.headers[MCP_API_KEY_HEADER] &&
      isMcpPath(request.path)
    ) {
      return true;
    }

    const currentSession = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const isOptional = this.reflector.get('OPTIONAL', context.getHandler());
    if (isOptional && !currentSession) return true;

    if (!currentSession) {
      throw new UnauthorizedException();
    }

    request.session = currentSession.session;
    if (currentSession.user) {
      request.user = currentSession.user as UserContextPayload;
    }

    // getAllAndOverride, not get: class-level `@Roles(...)` lives on the
    // constructor, and Reflect.getMetadata on the handler alone never walks up
    // to it — so a controller annotated with @Roles(Role.ADMIN) at class level
    // silently enforced nothing.
    const rolesAccepted = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
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
