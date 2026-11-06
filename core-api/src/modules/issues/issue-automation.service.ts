import { Injectable } from '@nestjs/common';
import type {
  IssueVulnerabilityEvents,
  IssueVulnerabilityFact,
} from '../event-bridge/sinks/issues/issues.sink';
import { IssueTypeHandlerRegistry } from './handlers/issue-type-handler.registry';
import { IssueRuleEngine } from './rules/issue-rule-engine.service';

/**
 * Entry point of the `issues` event lane: routes a finding event to the
 * issue-type automation and to the rule engine.
 *
 * A resurfaced finding first reopens the issue it was resolved under; the
 * rules run after, so a finding back on an open issue is not linked to a
 * second one.
 */
@Injectable()
export class IssueAutomationService implements IssueVulnerabilityEvents {
  constructor(
    private readonly handlers: IssueTypeHandlerRegistry,
    private readonly rules: IssueRuleEngine,
  ) {}

  async onVulnerabilityEvent(fact: IssueVulnerabilityFact): Promise<void> {
    const { workspaceId, vulnerabilityIds } = fact;
    switch (fact.event) {
      case 'vulnerability.detected':
        await this.rules.onFindings(fact.event, workspaceId, vulnerabilityIds);
        return;
      case 'vulnerability.resurfaced':
        await this.handlers.dispatch({
          name: fact.event,
          workspaceId,
          vulnerabilityIds,
          ...(fact.jobId ? { jobId: fact.jobId } : {}),
        });
        await this.rules.onFindings(fact.event, workspaceId, vulnerabilityIds);
        return;
      case 'vulnerability.fixed':
        await this.handlers.dispatch({
          name: fact.event,
          workspaceId,
          vulnerabilityIds,
          ...(fact.jobHistoryId ? { jobHistoryId: fact.jobHistoryId } : {}),
        });
        return;
    }
  }
}
