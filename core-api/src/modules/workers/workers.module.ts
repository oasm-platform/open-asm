import { Global, Module } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { WorkersController } from './workers.controller';
import { Worker } from './entities/worker.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../jobs-registry/entities/job.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Worker, Job])],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
