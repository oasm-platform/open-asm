import { Module } from '@nestjs/common';
import { ConnectorLogoController } from './connector-logo.controller';
import { ConnectorRegistryService } from './connector-registry.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ConnectorLogoController],
  providers: [ConnectorRegistryService],
  exports: [ConnectorRegistryService],
})
export class ConnectorsModule {}
