import { Global, Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DataAdapterService } from './data-adapter.service';

@Global()
@Module({
  imports: [WorkspacesModule],
  providers: [DataAdapterService],
  exports: [DataAdapterService],
})
export class DataAdapterModule {}
