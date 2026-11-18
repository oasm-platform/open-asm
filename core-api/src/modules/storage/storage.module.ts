import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { RustFsClient } from './rustfs.client';

@Module({
  controllers: [StorageController],
  providers: [RustFsClient, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
