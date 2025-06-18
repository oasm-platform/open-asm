import { Module } from '@nestjs/common';
import { JobsRegistryService } from './jobs-registry.service';
import { JobsRegistryController } from './jobs-registry.controller';

@Module({
  controllers: [JobsRegistryController],
  providers: [JobsRegistryService],
})
export class JobsRegistryModule {}
