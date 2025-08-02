import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Job, JobHistory])],
  controllers: [JobsRegistryController],
  providers: [JobsRegistryService],
  exports: [JobsRegistryService],
})
export class JobsRegistryModule {}
