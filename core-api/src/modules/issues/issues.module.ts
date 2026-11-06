import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../comments/entities/comment.entity';
import { ISSUE_VULNERABILITY_EVENTS } from '../event-bridge/sinks/issues/issues.sink';
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

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([
      Issue,
      IssueLink,
      IssueRule,
      IssueCounter,
      Comment,
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
    // The event bridge's issues lane hands finding events here.
    { provide: ISSUE_VULNERABILITY_EVENTS, useExisting: IssueAutomationService },
  ],
  exports: [IssuesService, ISSUE_VULNERABILITY_EVENTS],
})
export class IssuesModule {}
