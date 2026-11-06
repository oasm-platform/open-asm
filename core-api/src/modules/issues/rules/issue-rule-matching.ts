import {
  IssuePriority,
  IssueRuleGroupBy,
  Severity,
} from '@/common/enums/enum';
import type { IssueRuleConditions } from '../entities/issue-rule.entity';

/** A finding as the rule engine evaluates it. */
export interface RuleFinding {
  id: string;
  name: string;
  severity: Severity;
  epssScore?: number | null;
  dueAt?: Date | null;
  assetId: string;
  assetValue: string;
  targetId: string;
  targetValue: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  [Severity.INFO]: 0,
  [Severity.LOW]: 1,
  [Severity.MEDIUM]: 2,
  [Severity.HIGH]: 3,
  [Severity.CRITICAL]: 4,
};

export const severityRank = (severity: Severity | undefined | null): number =>
  severity ? (SEVERITY_RANK[severity] ?? 0) : 0;

/** Priority a rule without a fixed one gives: critical p1 … medium p3, else p4. */
export function derivePriority(severity: Severity): IssuePriority {
  switch (severity) {
    case Severity.CRITICAL:
      return IssuePriority.P1;
    case Severity.HIGH:
      return IssuePriority.P2;
    case Severity.MEDIUM:
      return IssuePriority.P3;
    default:
      return IssuePriority.P4;
  }
}

/** The more urgent of two priorities (p1 beats p2). */
export const higherPriority = (
  a: IssuePriority,
  b: IssuePriority,
): IssuePriority => (a <= b ? a : b);

/** Does the finding meet every condition the rule sets? */
export function matchesConditions(
  conditions: IssueRuleConditions | null | undefined,
  finding: RuleFinding,
): boolean {
  const { minSeverity, minEpss, targetIds } = conditions ?? {};
  if (minSeverity && severityRank(finding.severity) < severityRank(minSeverity)) {
    return false;
  }
  if (typeof minEpss === 'number') {
    if (typeof finding.epssScore !== 'number' || finding.epssScore < minEpss) {
      return false;
    }
  }
  if (targetIds && targetIds.length > 0 && !targetIds.includes(finding.targetId)) {
    return false;
  }
  return true;
}

/** Names that differ only in case or spacing group together. */
export const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Key of the open issue a finding joins under `groupBy`. `none` gives every
 * finding its own issue.
 */
export function groupKeyFor(
  groupBy: IssueRuleGroupBy,
  finding: RuleFinding,
): string {
  switch (groupBy) {
    case IssueRuleGroupBy.VULNERABILITY_NAME:
      return `vuln:${normalizeName(finding.name)}`;
    case IssueRuleGroupBy.ASSET:
      return `asset:${finding.assetId}`;
    case IssueRuleGroupBy.TARGET:
      return `target:${finding.targetId}`;
    default:
      return `finding:${finding.id}`;
  }
}

/** Title of a new issue opened for `finding` under `groupBy`. */
export function issueTitleFor(
  groupBy: IssueRuleGroupBy,
  finding: RuleFinding,
): string {
  switch (groupBy) {
    case IssueRuleGroupBy.VULNERABILITY_NAME:
      return finding.name;
    case IssueRuleGroupBy.ASSET:
      return `Findings on ${finding.assetValue}`;
    case IssueRuleGroupBy.TARGET:
      return `Findings on target ${finding.targetValue}`;
    default:
      return `${finding.name} on ${finding.assetValue}`;
  }
}

/** Earliest due date among the findings (null when none has one). */
export function earliestDueAt(
  dates: (Date | null | undefined)[],
): Date | null {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date) continue;
    const value = new Date(date);
    if (!earliest || value < earliest) earliest = value;
  }
  return earliest;
}
