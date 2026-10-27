import { User } from '@/modules/auth/entities/user.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/**
 * Admin read access to user accounts, served under /admin/users.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
