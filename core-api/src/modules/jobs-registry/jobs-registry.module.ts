import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';
import { ScheduleConsumer } from './processors/scan-schedule.processor';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Job, JobHistory]),
    BullModule.registerQueue({
      name: BullMQName.ASSETS_DISCOVERY_SCHEDULE,
    }),
  ],
  controllers: [JobsRegistryController],
  providers: [JobsRegistryService, ScheduleConsumer],
  exports: [JobsRegistryService],
})

export class JobsRegistryModule { }
