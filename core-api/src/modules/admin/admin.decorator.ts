import { Roles } from '@/common/decorators/app.decorator';
import { Role } from '@/common/enums/enum';
import { applyDecorators, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

/**
 * Restricts a controller or route to platform admins: the global AuthGuard
 * enforces `Role.ADMIN`, then AdminGuard runs the admin-only checks (the
 * admin IP allow-list). Use it on every `/admin/*` controller instead of
 * `@Roles(Role.ADMIN)`. The module of the controller must be able to inject
 * `SystemConfigsService` (import `SystemConfigsModule`).
 */
export const Admin = () =>
  applyDecorators(Roles(Role.ADMIN), UseGuards(AdminGuard));
