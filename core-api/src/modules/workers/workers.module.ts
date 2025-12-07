import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { Asset } from '../assets/entities/assets.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { WorkspaceTool } from '../tools/entities/workspace_tools.entity';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkerInstance, Job, Asset, WorkspaceTool]),
    ApiKeysModule,
  ],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule { }
