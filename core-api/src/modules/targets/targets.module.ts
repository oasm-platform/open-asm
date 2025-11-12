import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
      name: BullMQName.ASSETS_DISCOVERY_SCHEDULE,
    }),
  ],
  controllers: [TargetsController],
  providers: [TargetsService, TriggerWorkflowService],
  exports: [TargetsService],
})
export class TargetsModule { }
