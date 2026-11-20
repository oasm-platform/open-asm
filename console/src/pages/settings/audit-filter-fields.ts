import { isGroup, type Filter, type FilterFieldConfig, type FilterSuggestion } from '@/components/filter-builder/filter-model';
import { t } from '@/lib/i18n-dictionary';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  AuditOutcome, type AuditActionCatalogResponseDto, type AuditEventsControllerGetAuditEventsParams, type WorkspaceMembers,
  useAuditEventsControllerGetAuditActions, useWorkspacesControllerGetWorkspaceMembers,
} from '@/services/apis/gen/queries';

// The audit API takes one equality param per field (GetAuditEventsQueryDto), so every field is `eq`
// and the toolbar runs in flat mode (AND only, each field once). Labels are getters so they
// follow the active language.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = Object.values(AuditOutcome);
const OUTCOME_LABELS = {
  success: () => t('settings.audit.outcome.success'),
  failure: () => t('settings.audit.outcome.failure'),
  denied: () => t('settings.audit.outcome.denied'),
} satisfies Record<AuditOutcome, () => string>;
const outcomeOptions = () => OUTCOMES.map((v) => ({ value: v, label: OUTCOME_LABELS[v]() }));

const none = () => ({ options: [] as FilterSuggestion[], isFetching: false });
const matches = (s: string, ...texts: string[]) => texts.some((t) => t.toLowerCase().includes(s.toLowerCase()));

export const AUDIT_FILTER_FIELDS: FilterFieldConfig[] = [
  { key: 'action', get label() { return t('settings.audit.filter.action'); }, operators: ['eq'],
    useSuggestions: (s, on) => {
      const { state: { selectedWorkspaceId } } = useWorkspaceState();
      const r = useAuditEventsControllerGetAuditActions(selectedWorkspaceId, { query: {
        enabled: on && !!selectedWorkspaceId,
        select: (d: AuditActionCatalogResponseDto) => d.data
          .filter((e) => matches(s, e.action, e.label))
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((e) => ({ value: e.action, label: e.label })),
      } });
      return { options: r.data ?? [], isFetching: r.isFetching };
    } },
  { key: 'outcome', get label() { return t('settings.audit.filter.outcome'); }, operators: ['eq'],
    useSuggestions: (s) => ({ options: outcomeOptions().filter((o) => matches(s, o.value)), isFetching: false }),
    validate: (v) => (OUTCOMES.includes(v as AuditOutcome) ? null : t('settings.audit.filter.outcomeInvalid', { values: OUTCOMES.join(', ') })) },
  { key: 'actorId', get label() { return t('settings.audit.filter.actor'); }, operators: ['eq'],
    validate: (v) => (UUID.test(v) ? null : t('settings.audit.filter.actorInvalid')),
    useSuggestions: (s, on) => {
      const { state: { selectedWorkspaceId } } = useWorkspaceState();
      // Same key as members-settings so the two share one cache entry.
      const r = useWorkspacesControllerGetWorkspaceMembers({ query: {
        queryKey: ['/api/workspaces/members', selectedWorkspaceId],
        enabled: on && !!selectedWorkspaceId,
        select: (d: WorkspaceMembers[]) => d.flatMap((m) =>
          m.user && matches(s, m.user.name, m.user.id) ? [{ value: m.user.id, label: m.user.name }] : []),
      } });
      return { options: r.data ?? [], isFetching: r.isFetching };
    } },
  { key: 'resourceType', get label() { return t('settings.audit.filter.resourceType'); }, operators: ['eq'], useSuggestions: none,
    validate: (v) => (v.length <= 32 ? null : t('settings.audit.filter.resourceTypeInvalid')) },
];

type AuditFilterParams = Pick<AuditEventsControllerGetAuditEventsParams, 'action' | 'outcome' | 'actorId' | 'resourceType'>;

/** Flat filter (one `eq` per field, see AUDIT_FILTER_FIELDS) → audit query params keyed by field. */
export function auditFilterParams(f?: Filter): AuditFilterParams {
  const params: Record<string, string> = {};
  for (const item of f?.items ?? []) {
    if (!isGroup(item) && typeof item.value === 'string') params[item.field] = item.value;
  }
  return params as AuditFilterParams;
}
