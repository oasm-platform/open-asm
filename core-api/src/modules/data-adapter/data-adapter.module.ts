import { Global, Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DataAdapterController } from './data-adapter.controller';
import { DataAdapterService } from './data-adapter.service';

@Global()
@Module({
  imports: [WorkspacesModule],
  controllers: [DataAdapterController],
  providers: [DataAdapterService],
  exports: [DataAdapterService],
})
export class DataAdapterModule {}
