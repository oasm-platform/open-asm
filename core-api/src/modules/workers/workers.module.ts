import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../jobs-registry/entities/job.entity';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([WorkerInstance, Job])],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
