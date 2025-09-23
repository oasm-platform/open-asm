import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SCAN_SCHEDULE_QUEUE_NAME } from 'src/common/constants/app.constants';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Job, JobHistory]),
    BullModule.registerQueue({
      name: 'jobs',
    }),
    BullModule.registerQueue({
      name: SCAN_SCHEDULE_QUEUE_NAME,
    }),
  ],
  controllers: [JobsRegistryController],
  providers: [JobsRegistryService],
  exports: [JobsRegistryService],
})

export class JobsRegistryModule { }
