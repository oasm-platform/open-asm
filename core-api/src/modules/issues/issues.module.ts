import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
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
  ],
  controllers: [IssuesController],
  providers: [IssuesService, VulnerabilitySourceHandler],
  exports: [IssuesService],
})
export class IssuesModule {}
