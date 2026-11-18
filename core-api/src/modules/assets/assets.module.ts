import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConfig } from '../agents/entities/agent-config.entity';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';
import { Target } from '../targets/entities/target.entity';
import { TechnologyModule } from '../technology/technology.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AssetsController } from './assets.controller';
import { AssetGraphService } from './asset-graph.service';
import { AssetQueryService } from './asset-query.service';
import { AssetsService } from './assets.service';
import { RepositoryAssetsService } from './repository-assets.service';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';
import { DiscoveredUrl } from './entities/discovered-url.entity';
import { DnsRecord } from './entities/dns-record.entity';
import { HttpResponse } from './entities/http-response.entity';
import { HttpResponseTechnology } from './entities/http-response-technology.entity';
import { HttpStatusCode } from './entities/http-status-code.entity';
import { IpObservation } from './entities/ip-observation.entity';
import { TlsCertificate } from './entities/tls-certificate.entity';
import { UrlDiscoveryService } from './url-discovery.service';
import { StorageModule } from '../storage/storage.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { JobsRegistryModule } from '../jobs-registry/jobs-registry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Asset,
      Target,
      HttpResponse,
      DiscoveredUrl,
      AssetService,
      TlsCertificate,
      HttpResponseTechnology,
      IpObservation,
      HttpStatusCode,
      DnsRecord,
      AgentLLMConfig,
      AgentConfig,
    ]),
    TechnologyModule,
    WorkspacesModule,
    StorageModule,
    WorkflowsModule,
    JobsRegistryModule,
  ],
  controllers: [AssetsController],
  providers: [
    AssetsService,
    AssetGraphService,
    AssetQueryService,
    UrlDiscoveryService,
    RepositoryAssetsService,
  ],
  exports: [AssetsService, RepositoryAssetsService],
})
export class AssetsModule {}
