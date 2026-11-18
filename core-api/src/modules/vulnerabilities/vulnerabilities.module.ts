import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Target } from '../targets/entities/target.entity';
import { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';
import { VulnerabilityEvent } from './entities/vulnerability-event.entity';
import { VulnerabilitySource } from './entities/vulnerability-source.entity';
import { Vulnerability } from './entities/vulnerability.entity';
import { VulnerabilityAnalysisProcessor } from './processors/vulnerability-analysis.processor';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityLifecycleService } from './vulnerability-lifecycle.service';
import { VulnerabilityReviewService } from './vulnerability-review.service';
import { VulnerabilityRiskExpiryCron } from './vulnerability-risk-expiry.cron';
import { VulnerabilityAnalyzerRegistry } from './vulnerability-analyzer';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vulnerability,
      Asset,
      VulnerabilityDismissal,
      VulnerabilityEvent,
      VulnerabilitySource,
      Target,
    ]),
    NotificationsModule,
    BullModule.registerQueue({
      name: BullMQName.VULNERABILITY_ANALYSIS,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  controllers: [VulnerabilitiesController],
  providers: [
    VulnerabilitiesService,
    VulnerabilityAnalysisProcessor,
    VulnerabilityLifecycleService,
    VulnerabilityReviewService,
    VulnerabilityRiskExpiryCron,
    VulnerabilityAnalyzerRegistry,
  ],
  exports: [
    VulnerabilitiesService,
    VulnerabilityAnalyzerRegistry,
    VulnerabilityLifecycleService,
    VulnerabilityReviewService,
  ],
})
export class VulnerabilitiesModule {}
