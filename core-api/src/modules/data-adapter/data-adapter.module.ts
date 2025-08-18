import { Global, Module } from '@nestjs/common';
import { DataAdapterController } from './data-adapter.controller';
import { DataAdapterService } from './data-adapter.service';

@Global()
@Module({
  controllers: [DataAdapterController],
  providers: [DataAdapterService],
  exports: [DataAdapterService],
})
export class DataAdapterModule {}
