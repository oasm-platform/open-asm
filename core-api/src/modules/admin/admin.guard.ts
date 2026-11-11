import { requestClientIp } from '@/common/config/trusted-proxies';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { SystemConfigsService } from './system-configs/system-configs.service';

/**
 * Admin-only checks that need more than the user's role, applied with
 * `@Admin()`. It runs after the global AuthGuard, which has already
 * authenticated the request and enforced `Role.ADMIN`.
 *
 * Checks, in order:
 * 1. The client IP is in `settings.adminAccess.allowedIps` (empty allows all).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly systemConfigsService: SystemConfigsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IncomingMessage>();

    await this.assertIpAllowed(request);

    return true;
  }

  private async assertIpAllowed(request: IncomingMessage): Promise<void> {
    const clientIp = requestClientIp(request);
    if (await this.systemConfigsService.isAdminIpAllowed(clientIp)) return;

    throw new ForbiddenException(
      'Admin access is not allowed from this IP address',
    );
  }
}
