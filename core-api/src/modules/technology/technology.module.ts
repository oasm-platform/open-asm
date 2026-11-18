import { Global, Module } from '@nestjs/common';
import { TechnologyForwarderService } from './technology-forwarder.service';

@Global()
@Module({
  providers: [TechnologyForwarderService],
  exports: [TechnologyForwarderService],
})
export class TechnologyModule {}
