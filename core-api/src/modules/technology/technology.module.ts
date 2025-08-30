import { Global, Module } from '@nestjs/common';
import { TechnologyForwarderService } from './technology-forwarder.service';
import { TechnologyController } from './technology.controller';

@Global()
@Module({
  controllers: [TechnologyController],
  providers: [TechnologyForwarderService],
  exports: [TechnologyForwarderService],
})
export class TechnologyModule {}