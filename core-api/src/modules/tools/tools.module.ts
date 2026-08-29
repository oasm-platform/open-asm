import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkersModule } from '../workers/workers.module';
import { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
import { ToolConfigProfilesController } from './tool-config-profiles.controller';
import { ToolConfigProfilesService } from './tool-config-profiles.service';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Tool, WorkspaceTool, Asset, Vulnerability, ToolConfigProfile]),
    forwardRef(() => WorkersModule),
    ConnectorsModule,
  ],
  controllers: [ToolsController, ToolConfigProfilesController],
  providers: [ToolsService, ToolConfigProfilesService],
  exports: [ToolsService, ToolConfigProfilesService],
})
export class ToolsModule {}
