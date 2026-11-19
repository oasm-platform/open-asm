import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BullMQName } from '@/common/enums/enum';

import { AsqConnectionsService } from './asq-connections.service';
import { AsqRollupsService } from './asq-rollups.service';
import { AsqSavedQueriesService } from './asq-saved-queries.service';
import { AttackSurfaceQueryController } from './attack-surface-query.controller';
import { AttackSurfaceQueryService } from './attack-surface-query.service';
import { AsqSavedQuery } from './entities/asq-saved-query.entity';
import { AsqSurfaceRollup } from './entities/asq-surface-rollup.entity';
import { AsqReportProcessor } from './processors/asq-report.processor';

/**
 * Attack surface queries: a JSON query language over the attack surface
 * tables (hosts, services, HTTP, TLS, tech, IPs, DNS, URLs, findings),
 * compiled to workspace-scoped read-only SQL. Serves the REST API, the agent
 * and MCP tools (agents module), saved queries and query reports.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AsqSavedQuery, AsqSurfaceRollup]),
    BullModule.registerQueue({
      name: BullMQName.ASQ_REPORT,
      defaultJobOptions: { attempts: 1 },
    }),
  ],
  controllers: [AttackSurfaceQueryController],
  providers: [
    AsqConnectionsService,
    AttackSurfaceQueryService,
    AsqSavedQueriesService,
    AsqRollupsService,
    AsqReportProcessor,
  ],
  exports: [AttackSurfaceQueryService, AsqSavedQueriesService],
})
export class AttackSurfaceQueryModule {}
