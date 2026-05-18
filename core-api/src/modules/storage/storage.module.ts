import { Global, Module } from '@nestjs/common';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { RustFsClient } from './rustfs.client';

@Global()
@Module({
  imports: [SystemConfigsModule],
  controllers: [StorageController],
  providers: [RustFsClient, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
