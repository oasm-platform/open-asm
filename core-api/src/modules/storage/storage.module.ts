import { Global, Module } from '@nestjs/common';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [SystemConfigsModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
