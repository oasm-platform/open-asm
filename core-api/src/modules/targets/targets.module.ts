import { Module } from '@nestjs/common';
import { TargetsService } from './targets.service';
import { TargetsController } from './targets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Target } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Target, WorkspaceTarget]),
    WorkspacesModule,
  ],
  controllers: [TargetsController],
  providers: [TargetsService],
})
export class TargetsModule {}
