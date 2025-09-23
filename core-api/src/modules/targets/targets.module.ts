import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Asset } from '../assets/entities/assets.entity';
import { TriggerWorkflowService } from '../workflows/trigger-workflow.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { Target } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';
import { TargetsController } from './targets.controller';
import { TargetsService } from './targets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Target, WorkspaceTarget, Asset]),
    WorkspacesModule,
    BullModule.registerQueue({
      name: 'scan-schedule',
    }),
  ],
  controllers: [TargetsController],
  providers: [TargetsService, TriggerWorkflowService],
  exports: [TargetsService],
})
export class TargetsModule {}
