import { Module } from '@nestjs/common';
import { ConnectorLogoController } from './connector-logo.controller';
import { ConnectorRegistryService } from './connector-registry.service';

@Module({
  controllers: [ConnectorLogoController],
  providers: [ConnectorRegistryService],
  exports: [ConnectorRegistryService],
})
export class ConnectorsModule {}
