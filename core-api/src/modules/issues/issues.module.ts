import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../comments/entities/comment.entity';
import { IssuesSink } from './event-lane/issues.sink';
import { IssueLink } from './entities/issue-link.entity';
import { IssueCounter } from './entities/issue-counter.entity';
import { IssueRule } from './entities/issue-rule.entity';
import { Issue } from './entities/issue.entity';
import { IssueTypeHandlerRegistry } from './handlers/issue-type-handler.registry';
import { TaskHandler } from './handlers/manual-issue.handler';
import { VulnerabilityRemediationHandler } from './handlers/vulnerability-remediation.handler';
import { IssueEventsPublisher } from './issue-activity';
import { IssueAutomationService } from './issue-automation.service';
import { IssueLinksService } from './issue-links.service';
import { IssueRulesController, IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { IssueRuleEngine } from './rules/issue-rule-engine.service';
import { IssueRulesService } from './rules/issue-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([
      Issue,
      IssueLink,
      IssueRule,
      IssueCounter,
    ])],
  // Rules first: `/issues/rules` must not be matched as `/issues/:id`.
  controllers: [IssueRulesController, IssuesController],
  providers: [
    IssuesService,
    IssueRulesService,
    IssueRuleEngine,
    IssueLinksService,
    IssueEventsPublisher,
    IssueTypeHandlerRegistry,
    VulnerabilityRemediationHandler,
    TaskHandler,
    IssueAutomationService,
    // The `issues` lane of the event bus (found by EventConsumersService)
    IssuesSink,
  ],
  exports: [IssuesService],
})
export class IssuesModule {}
