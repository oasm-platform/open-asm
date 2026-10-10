import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { Target } from '../targets/entities/target.entity';
import { TechnologyModule } from '../technology/technology.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';
import { DiscoveredUrl } from './entities/discovered-url.entity';
import { DnsRecord } from './entities/dns-record.entity';
import { HttpResponse } from './entities/http-response.entity';
import { HttpResponseTechnology } from './entities/http-response-technology.entity';
import { HttpStatusCode } from './entities/http-status-code.entity';
import { IpObservation } from './entities/ip-observation.entity';
import { TlsCertificate } from './entities/tls-certificate.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Asset,
      Job,
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
    ]),
    TechnologyModule,
    WorkspacesModule,
  ],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
