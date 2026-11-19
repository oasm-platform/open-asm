import { Module } from '@nestjs/common';
import { TechnologyForwarderService } from './technology-forwarder.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [TechnologyForwarderService],
  exports: [TechnologyForwarderService],
})
export class TechnologyModule {}
