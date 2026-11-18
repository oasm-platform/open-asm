import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from './entities/integration.entity';
import { IntegrationConfigReader } from './integration-config.reader';

/**
 * `IntegrationConfigReader` on its own, for modules that only need an
 * integration's decrypted config (jobs-registry puts a repository token into
 * connector inputs). Importing it pulls in nothing else of integrations, so
 * it never closes an import cycle through `IntegrationsModule`'s own
 * dependencies (targets, data-adapter).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Integration])],
  providers: [IntegrationConfigReader],
  exports: [IntegrationConfigReader],
})
export class IntegrationConfigModule {}
