import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SystemConfigsModule } from './system-configs/system-configs.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminWorkspacesModule } from './workspaces/admin-workspaces.module';

/**
 * System administration: everything served under /admin/*.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    SystemConfigsModule,
    AdminUsersModule,
    AdminWorkspacesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
