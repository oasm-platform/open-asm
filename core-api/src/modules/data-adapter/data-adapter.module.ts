import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DataAdapterService } from './data-adapter.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [WorkspacesModule, StorageModule],
  providers: [DataAdapterService],
  exports: [DataAdapterService],
})
export class DataAdapterModule {}
