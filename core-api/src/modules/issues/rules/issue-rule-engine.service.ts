import { BOT_ID } from '@/common/constants/app.constants';
import {
  IssueLinkResourceType,
  IssueStatus,
  IssueType,
} from '@/common/enums/enum';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import { openVulnerabilityCondition } from '@/modules/vulnerabilities/open-vulnerability';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { IssueRuleEvent } from '../dto/issue-rule.dto';
import { IssueRule } from '../entities/issue-rule.entity';
import { Issue } from '../entities/issue.entity';
import {
  ACTIVE_ISSUE_STATUSES,
  insertLinks,
  IssueEventsPublisher,
  isUniqueViolation,
  nextIssueNo,
} from '../issue-activity';
import {
  derivePriority,
  earliestDueAt,
  groupKeyFor,
  higherPriority,
  issueTitleFor,
  matchesConditions,
  type RuleFinding,
  severityRank,
} from './issue-rule-matching';

/** What one rule did with one group of findings. */
interface GroupOutcome {
  issue: Issue;
  created: boolean;
  linked: number;
}

/**
 * Turns finding events into issues.
 *
 * For each enabled rule of the workspace listening to the event, the findings
 * that meet its conditions are grouped by its `groupBy` into a group key, and
 * each group joins the open issue with the same (workspace, type, key) — or
 * opens one. The open-groupKey unique index settles a race between two
 * deliveries: the loser re-reads and joins the winner's issue.
 *
 * Only open, approved findings count (AI proposals under review, rejected,
 * fixed and dismissed ones are skipped), and a finding already linked to an
 * open or in-progress issue is never linked again — also not by a second rule
 * matching the same event.
 */
@Injectable()
export class IssueRuleEngine {
  private readonly logger = new Logger(IssueRuleEngine.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: IssueEventsPublisher,
  ) {}

  async onFindings(
    event: IssueRuleEvent,
    workspaceId: string,
    vulnerabilityIds: string[],
  ): Promise<void> {
    if (vulnerabilityIds.length === 0) return;
    const rules = await this.dataSource.getRepository(IssueRule).find({
      where: { workspaceId, event, enabled: true },
      order: { createdAt: 'ASC' },
    });
    // Rules open remediation issues only; other types have no rule support.
    const applicable = rules.filter(
      (rule) => rule.issueType === IssueType.VULNERABILITY_REMEDIATION,
    );
    if (applicable.length === 0) return;

    const findings = await this.loadFindings(workspaceId, vulnerabilityIds);
    if (findings.length === 0) return;
    const linked = await this.linkedToActiveIssue(
      workspaceId,
      findings.map((f) => f.id),
    );

    for (const rule of applicable) {
      const groups = new Map<string, RuleFinding[]>();
      for (const finding of findings) {
        if (linked.has(finding.id)) continue;
        if (!matchesConditions(rule.conditions, finding)) continue;
        const key = groupKeyFor(rule.groupBy, finding);
        groups.set(key, [...(groups.get(key) ?? []), finding]);
      }
      for (const [groupKey, group] of groups) {
        const outcome = await this.attachOrCreate(rule, groupKey, group);
        for (const finding of group) linked.add(finding.id);
        await this.publish(outcome, rule);
      }
    }
  }

  /** Open, approved findings of the workspace among `ids`. */
  async loadFindings(
    workspaceId: string,
    ids: string[],
  ): Promise<RuleFinding[]> {
    const rows: (Omit<RuleFinding, 'epssScore'> & {
      epssScore: number | string | null;
    })[] = await this.dataSource.query(
      `SELECT v."id", v."name", v."severity", v."epssScore", v."dueAt",
              a."id" AS "assetId", a."value" AS "assetValue",
              t."id" AS "targetId", t."value" AS "targetValue"
         FROM "vulnerabilities" v
         JOIN "assets" a ON a."id" = v."assetId"
         JOIN "targets" t ON t."id" = a."targetId"
        WHERE v."id" = ANY($1::uuid[])
          AND t."workspaceId" = $2
          AND ${openVulnerabilityCondition('v')}`,
      [[...new Set(ids)], workspaceId],
    );
    return rows.map((row) => ({
      ...row,
      epssScore: row.epssScore === null ? null : Number(row.epssScore),
    }));
  }

  /** Findings among `ids` already linked to an open / in-progress issue. */
  async linkedToActiveIssue(
    workspaceId: string,
    ids: string[],
  ): Promise<Set<string>> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT DISTINCT l."resourceId" AS "id"
         FROM "issue_links" l
         JOIN "issues" i ON i."id" = l."issueId"
        WHERE l."resourceType" = $1
          AND l."resourceId" = ANY($2::uuid[])
          AND i."workspaceId" = $3
          AND i."status" = ANY($4::varchar[])`,
      [
        IssueLinkResourceType.VULNERABILITY,
        ids,
        workspaceId,
        [...ACTIVE_ISSUE_STATUSES],
      ],
    );
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Links the group to the open issue with its key, or opens one. On a unique
   * violation (another delivery opened the issue — or took the number —
   * between our read and insert) it retries once, which then finds that issue.
   */
  async attachOrCreate(
    rule: IssueRule,
    groupKey: string,
    findings: RuleFinding[],
    attempt = 0,
  ): Promise<GroupOutcome> {
    const worst = findings.reduce((a, b) =>
      severityRank(b.severity) > severityRank(a.severity) ? b : a,
    );
    const priority = rule.priority ?? derivePriority(worst.severity);
    const dueAt = earliestDueAt(findings.map((f) => f.dueAt));
    const links = findings.map((f) => ({
      resourceType: IssueLinkResourceType.VULNERABILITY,
      resourceId: f.id,
    }));

    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(Issue, {
          where: {
            workspaceId: rule.workspaceId,
            type: rule.issueType,
            groupKey,
            status: In([...ACTIVE_ISSUE_STATUSES]),
          },
        });
        if (existing) {
          const patch: Partial<Pick<Issue, 'dueAt' | 'priority'>> = {};
          if (dueAt && (!existing.dueAt || dueAt < new Date(existing.dueAt))) {
            patch.dueAt = dueAt;
          }
          // A derived priority only ever rises with a worse finding.
          if (!rule.priority) {
            const raised = higherPriority(existing.priority, priority);
            if (raised !== existing.priority) patch.priority = raised;
          }
          if (Object.keys(patch).length > 0) {
            await manager.update(Issue, { id: existing.id }, patch);
            Object.assign(existing, patch);
          }
          const linked = await insertLinks(manager, existing.id, links, null);
          return { issue: existing, created: false, linked };
        }

        const no = await nextIssueNo(manager, rule.workspaceId);
        const issue = await manager.save(
          manager.create(Issue, {
            title: issueTitleFor(rule.groupBy, findings[0]),
            type: rule.issueType,
            status: IssueStatus.OPEN,
            priority,
            dueAt,
            assigneeId: rule.defaultAssigneeId ?? null,
            ruleId: rule.id,
            groupKey,
            workspaceId: rule.workspaceId,
            createdById: BOT_ID,
            no,
          }),
        );
        const linked = await insertLinks(manager, issue.id, links, null);
        return { issue, created: true, linked };
      });
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) {
        this.logger.debug(
          `Issue for group ${groupKey} was opened concurrently; retrying`,
        );
        return this.attachOrCreate(rule, groupKey, findings, 1);
      }
      throw error;
    }
  }

  private async publish(outcome: GroupOutcome, rule: IssueRule): Promise<void> {
    if (outcome.created) {
      await this.events.publish(
        EVENT_CATALOG.issue.created,
        outcome.issue,
        'system',
        {
          ruleId: rule.id,
          linkCount: outcome.linked,
          ...(outcome.issue.assigneeId
            ? { assigneeId: outcome.issue.assigneeId }
            : {}),
        },
      );
    } else if (outcome.linked > 0) {
      await this.events.publish(
        EVENT_CATALOG.issue.link.added,
        outcome.issue,
        'system',
        { ruleId: rule.id, count: outcome.linked, resourceTypes: ['vulnerability'] },
      );
    }
  }
}
