import { Module } from '@nestjs/common';
import { SystemConfigsModule } from '../admin/system-configs/system-configs.module';
import { UsersModule } from '../users/users.module';
import { RootController } from './root.controller';
import { RootService } from './root.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [UsersModule, SystemConfigsModule, StorageModule],
  controllers: [RootController],
  providers: [RootService],
})
export class RootModule {}
