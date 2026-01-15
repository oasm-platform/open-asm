import { BullMQName } from '@/common/enums/enum';
import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { JobsRegistryModule } from '../jobs-registry/jobs-registry.module';
import { IssueComment } from './entities/issue-comment.entity';
import { Issue } from './entities/issue.entity';
import { VulnerabilitySourceHandler } from './handlers/vulnerability-source.handler';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, IssueComment]),
    VulnerabilitiesModule,
    AiAssistantModule,
    JobsRegistryModule,
    BullModule.registerQueue({
      name: BullMQName.ISSUE_CREATION,
    }),
  ],
  controllers: [IssuesController],
  providers: [IssuesService, VulnerabilitySourceHandler],
  exports: [IssuesService],
})
export class IssuesModule {}
