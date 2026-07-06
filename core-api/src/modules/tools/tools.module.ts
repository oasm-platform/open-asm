import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { Asset } from '../assets/entities/assets.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkersModule } from '../workers/workers.module';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Tool, WorkspaceTool, Asset, Vulnerability]),
    ApiKeysModule,
    forwardRef(() => WorkersModule),
  ],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
