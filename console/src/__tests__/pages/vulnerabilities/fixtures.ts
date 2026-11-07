import type {
  GetVulnerabilitiesStatisticsResponseDto,
  VulnerabilityDetailDto,
  VulnerabilityListItemDto,
  VulnerabilitySettingsDto,
  VulnerabilityTimelineEventDto,
} from '@/services/apis/gen/queries';
import { addDays, subDays } from 'date-fns';

const now = new Date();
const iso = (d: Date) => d.toISOString();

const base = {
  createdAt: iso(subDays(now, 41)),
  updatedAt: iso(now),
  description: 'Argument injection',
  synopsis: '',
  tags: [],
  references: [],
  authors: [],
  affectedUrl: 'https://billing.example.com/',
  ipAddress: '10.0.0.5',
  host: 'billing.example.com',
  ports: ['443'],
  cvssMetric: '',
  cvssScore: 9.8,
  epssScore: 0,
  vprScore: 0,
  cveId: ['CVE-2024-4577'],
  bidId: [],
  cweId: [],
  ceaId: [],
  iava: [],
  cveUrl: '',
  cweUrl: '',
  solution: '',
  extractorName: '',
  extractedResults: [],
  publicationDate: '',
  modificationDate: '',
  firstDetectedDate: iso(subDays(now, 41)),
  lastSeenDate: iso(subDays(now, 1)),
  tool: { id: 'tool-1', name: 'nuclei' },
  asset: { id: 'asset-1', value: 'billing.example.com:443', targetId: 'target-1' },
  timesDetected: 6,
  resurfacedCount: 1,
  reviewStatus: 'approved',
  discoveredBy: 'tool',
  vulnerabilityDismissal: null,
  analyzeStatus: 'not_analyzed',
  analyzeResult: '',
  dismissal: null,
  openIssue: null,
};

export function listItem(
  overrides: Partial<VulnerabilityListItemDto> = {},
): VulnerabilityListItemDto {
  return {
    ...base,
    id: 'vuln-1',
    name: 'PHP-CGI argument injection',
    severity: 'critical',
    detectionStatus: 'resurfaced',
    dueAt: iso(addDays(now, 2)),
    sources: [{ kind: 'tool', toolName: 'nuclei' }],
    ...overrides,
  } as unknown as VulnerabilityListItemDto;
}

export function detail(overrides: Partial<VulnerabilityDetailDto> = {}): VulnerabilityDetailDto {
  return {
    ...base,
    id: 'vuln-1',
    name: 'PHP-CGI argument injection',
    severity: 'critical',
    detectionStatus: 'resurfaced',
    dueAt: iso(addDays(now, 2)),
    lastSeenJobHistoryId: 'run-last-0000',
    fixedAt: iso(subDays(now, 30)),
    fixedByJobHistoryId: 'run-fixed-000',
    sources: [
      {
        id: 'src-1',
        kind: 'tool',
        tool: { id: 'tool-1', name: 'nuclei' },
        jobHistoryId: 'run-first-000',
        createdBy: null,
        createdAt: iso(subDays(now, 41)),
      },
    ],
    reviewedByUser: null,
    fixClaimedByUser: null,
    ...overrides,
  } as unknown as VulnerabilityDetailDto;
}

export function proposal(overrides: Partial<VulnerabilityDetailDto> = {}): VulnerabilityDetailDto {
  return detail({
    id: 'prop-1',
    name: 'SQL injection (time-based) in id',
    severity: 'high',
    detectionStatus: 'new',
    reviewStatus: 'pending_review',
    discoveredBy: 'ai_tool',
    timesDetected: 0,
    resurfacedCount: 0,
    dueAt: null,
    fixedAt: null,
    fixedByJobHistoryId: null,
    cweId: ['CWE-89'],
    affectedUrl: 'https://api.example.com/api/v1/orders?id=',
    sources: [
      {
        id: 'src-ai',
        kind: 'ai_agent',
        tool: null,
        agentName: 'pentest',
        agentConversationId: 'conv-1',
        toolCallIds: ['call-sqlmap-1'],
        evidence: {
          requests: ['GET /api/v1/orders?id=1042', "GET /api/v1/orders?id=1042' AND SLEEP(5)-- -"],
          responses: ['200 in 0.08 s', '200 in 5.02 s'],
          baseline: "GET /api/v1/orders?id=1042' AND SLEEP(0)-- - → 0.09 s",
          notes: 'Delay scales with the SLEEP argument.',
        },
        createdBy: { id: 'user-1', name: 'Le Quang', image: null },
        createdAt: iso(subDays(now, 1)),
      },
      {
        id: 'src-tool',
        kind: 'tool',
        tool: { id: 'tool-2', name: 'sqlmap' },
        agentConversationId: 'conv-1',
        createdBy: null,
        createdAt: iso(subDays(now, 1)),
      },
    ],
    ...overrides,
  } as Partial<VulnerabilityDetailDto>);
}

export const stats: GetVulnerabilitiesStatisticsResponseDto = {
  data: [
    { severity: 'critical', count: 9 },
    { severity: 'high', count: 31 },
    { severity: 'medium', count: 100 },
    { severity: 'low', count: 8 },
    { severity: 'info', count: 0 },
  ],
  byDetectionStatus: { new: 12, active: 132, resurfaced: 4, fixed: 412 },
  newLast7Days: 12,
  resurfacedLast30Days: 4,
  fixedLast30Days: 37,
  overdue: 9,
  pendingReview: 3,
  mttr: [{ severity: 'high', days: 18, count: 5 }],
};

export const settings: VulnerabilitySettingsDto = {
  slaDays: { critical: 7, high: 30, medium: 90, low: 120, info: null },
  slaRestartOnResurface: true,
  autoCloseEnabled: true,
  autoCloseMissedScans: 1,
  riskAcceptMaxDays: 180,
};

export function timeline(): VulnerabilityTimelineEventDto[] {
  return [
    {
      id: 'e3',
      type: 'status_changed',
      fromStatus: 'fixed',
      toStatus: 'resurfaced',
      jobHistoryId: 'run-resurf-00',
      actor: null,
      data: { reason: 'detected_by_scan' },
      occurredAt: iso(subDays(now, 5)),
    },
    {
      id: 'e2',
      type: 'fix_claimed',
      actor: { id: 'user-1', name: 'Le Quang', image: null },
      data: { note: 'Upgraded PHP to 8.3.8' },
      occurredAt: iso(subDays(now, 32)),
    },
    {
      id: 'e1',
      type: 'detected',
      toStatus: 'new',
      jobHistoryId: 'run-first-000',
      actor: null,
      data: {},
      occurredAt: iso(subDays(now, 41)),
    },
  ] as VulnerabilityTimelineEventDto[];
}
