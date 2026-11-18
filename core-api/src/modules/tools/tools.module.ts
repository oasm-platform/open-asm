import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../connectors/connectors.module';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace-tools.entity';
import { ToolConfigProfilesController } from './tool-config-profiles.controller';
import { ToolConfigProfilesService } from './tool-config-profiles.service';
import { ToolSyncService } from './tool-sync.service';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tool, WorkspaceTool, ToolConfigProfile, WorkerInstance]),
    ConnectorsModule,
    StorageModule,
  ],
  controllers: [ToolsController, ToolConfigProfilesController],
  providers: [ToolsService, ToolConfigProfilesService, ToolSyncService],
  exports: [ToolsService, ToolConfigProfilesService],
})
export class ToolsModule {}
