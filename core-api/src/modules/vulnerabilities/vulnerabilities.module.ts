import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../agents/agents.module';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { Vulnerability } from './entities/vulnerability.entity';
import { Asset } from '../assets/entities/assets.entity';
import { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';
import { VulnerabilityAnalysisProcessor } from './processors/vulnerability-analysis.processor';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Vulnerability, Asset, VulnerabilityDismissal]),
    forwardRef(() => AgentsModule),
    BullModule.registerQueue({
      name: BullMQName.VULNERABILITY_ANALYSIS,
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 60 * 60,
        },
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
  ],
  controllers: [VulnerabilitiesController],
  providers: [VulnerabilitiesService, VulnerabilityAnalysisProcessor],
  exports: [VulnerabilitiesService],
})
export class VulnerabilitiesModule {}