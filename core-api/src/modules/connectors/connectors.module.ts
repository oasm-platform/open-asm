import { Module } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';

@Module({
  providers: [ConnectorRegistryService],
  exports: [ConnectorRegistryService],
})
export class ConnectorsModule {}
