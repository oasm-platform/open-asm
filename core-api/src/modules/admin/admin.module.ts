import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SystemConfigsModule } from './system-configs/system-configs.module';

/**
 * System administration: everything served under /admin/*.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), SystemConfigsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
