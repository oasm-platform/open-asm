import { Module } from '@nestjs/common';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { UsersModule } from '../users/users.module';
import { RootController } from './root.controller';
import { RootService } from './root.service';

@Module({
  imports: [UsersModule, SystemConfigsModule],
  controllers: [RootController],
  providers: [RootService],
})
export class RootModule {}
