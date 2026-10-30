import { User } from '@/modules/auth/entities/user.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { PendingApprovalHook } from './pending-approval.hook';

/**
 * Admin read access to user accounts, served under /admin/users, and the
 * approval rules for accounts made through public sign-up.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), SystemConfigsModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, PendingApprovalHook],
})
export class AdminUsersModule {}
