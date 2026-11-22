import type {
  DismissReason,
  VulnerabilityDismissalInfoDto,
  VulnerabilitySourceSummaryDto,
} from '@/services/apis/gen/queries';
import { t } from '@/lib/i18n-dictionary';
import { differenceInCalendarDays, formatDistanceToNowStrict } from 'date-fns';

/** Detection states that count as open (when not dismissed). */
export const OPEN_DETECTION_STATUSES = ['new', 'active', 'resurfaced'] as const;

export const isOpenDetection = (status?: string | null) =>
  !!status && (OPEN_DETECTION_STATUSES as readonly string[]).includes(status);

/** The label maps hold i18n keys; read them through `labelOf`. */
export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  false_positive: 'vulnerabilities.dismissReason.falsePositive',
  used_in_test: 'vulnerabilities.dismissReason.usedInTest',
  wont_fix: 'vulnerabilities.dismissReason.wontFix',
  risk_accepted: 'vulnerabilities.dismissReason.riskAccepted',
};

export const DETECTION_STATUS_LABELS: Record<string, string> = {
  new: 'vulnerabilities.detection.new',
  active: 'vulnerabilities.detection.active',
  fixed: 'vulnerabilities.detection.fixed',
  resurfaced: 'vulnerabilities.detection.resurfaced',
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending_review: 'vulnerabilities.review.pendingReview',
  approved: 'vulnerabilities.review.approved',
  rejected: 'vulnerabilities.review.rejected',
};

export const DISCOVERED_BY_LABELS: Record<string, string> = {
  tool: 'vulnerabilities.discoveredBy.tool',
  ai: 'vulnerabilities.discoveredBy.ai',
  ai_tool: 'vulnerabilities.discoveredBy.aiTool',
  manual: 'vulnerabilities.discoveredBy.manual',
};

/** Translated label of `value` in one of the maps above; unknown values show as-is. */
export function labelOf(map: Record<string, string>, value: string): string {
  const key = map[value];
  return key ? t(key) : value;
}

/** A risk acceptance still in force pauses the SLA. */
export function isRiskAccepted(
  dismissal?: Pick<VulnerabilityDismissalInfoDto, 'reason' | 'expiresAt'> | null,
  now: Date = new Date(),
): boolean {
  if (!dismissal || dismissal.reason !== 'risk_accepted') return false;
  return !dismissal.expiresAt || new Date(dismissal.expiresAt) > now;
}

/** Calendar days from today to `date` (negative when past). */
export function daysUntil(date: string | Date, now: Date = new Date()): number {
  return differenceInCalendarDays(new Date(date), now);
}

/** "41 days", "2 hours" — time since the first detection. */
export function ageLabel(since?: string | null): string {
  if (!since) return '—';
  return formatDistanceToNowStrict(new Date(since));
}

const unique = (values: (string | null | undefined)[]) => [
  ...new Set(values.filter((v): v is string => !!v)),
];

/**
 * One line naming how the finding was found:
 * "nuclei", "AI · pentest + sqlmap", "nuclei · AI verified", "Manual".
 */
export function sourceSummaryLabel({
  sources,
  discoveredBy,
  reviewStatus,
  fallbackToolName,
}: {
  sources?: Pick<VulnerabilitySourceSummaryDto, 'kind' | 'toolName' | 'agentName'>[] | null;
  discoveredBy?: string | null;
  reviewStatus?: string | null;
  fallbackToolName?: string | null;
}): string {
  const list = sources ?? [];
  const tools = unique(list.filter((s) => s.kind === 'tool').map((s) => s.toolName));
  const agents = unique(list.filter((s) => s.kind === 'ai_agent').map((s) => s.agentName));
  const hasAgent = list.some((s) => s.kind === 'ai_agent');
  const toolText = (tools.length ? tools : unique([fallbackToolName])).join(', ');

  if (discoveredBy === 'ai' || discoveredBy === 'ai_tool') {
    const agent = agents.length ? ` · ${agents.join(', ')}` : '';
    const withTools = tools.length ? ` + ${tools.join(', ')}` : '';
    const approved =
      reviewStatus === 'approved' ? ` · ${t('vulnerabilities.source.approved')}` : '';
    return `AI${agent}${withTools}${approved}`;
  }
  if (discoveredBy === 'manual')
    return toolText
      ? t('vulnerabilities.source.manualWith', { tools: toolText })
      : t('vulnerabilities.source.manual');
  if (hasAgent)
    return toolText
      ? t('vulnerabilities.source.aiVerifiedWith', { tools: toolText })
      : t('vulnerabilities.source.aiVerified');
  return toolText || '—';
}
