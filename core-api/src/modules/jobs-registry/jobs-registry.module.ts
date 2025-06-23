import { Global, Module } from '@nestjs/common';
import { JobsRegistryService } from './jobs-registry.service';
import { JobsRegistryController } from './jobs-registry.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './entities/job.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Job])],
  controllers: [JobsRegistryController],
  providers: [JobsRegistryService],
  exports: [JobsRegistryService],
})
export class JobsRegistryModule {}
