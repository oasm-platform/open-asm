import type {
  IssueDetailDto,
  IssueListItemDto,
  IssueRuleDto,
  WorkspaceMembers,
} from '@/services/apis/gen/queries';
import { http, HttpResponse } from 'msw';

export const members: WorkspaceMembers[] = [
  {
    id: 'm-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: { id: 'u-1', name: 'Tran Ha', image: null },
  },
  {
    id: 'm-2',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: { id: 'u-2', name: 'Le Quang', image: null },
  },
];

const DAY = 24 * 60 * 60 * 1000;

export function listItem(extra: Partial<IssueListItemDto> = {}): IssueListItemDto {
  return {
    id: 'iss-1',
    no: 12,
    title: 'HTTP/2 Rapid Reset',
    type: 'vulnerability_remediation',
    status: 'in_progress',
    priority: 'p1',
    resolution: null,
    dueAt: new Date(Date.now() - 5 * DAY).toISOString(),
    resolvedAt: null,
    tags: [],
    ruleId: 'rule-1',
    assignee: { id: 'u-1', name: 'Tran Ha', image: null },
    createdBy: null,
    linkCount: 3,
    progress: { done: 1, total: 3 },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...extra,
  };
}

export function detail(extra: Partial<IssueDetailDto> = {}): IssueDetailDto {
  return {
    ...listItem(),
    description: 'Upgrade the edge proxies',
    groupKey: 'vulnerability_name:CVE-2023-44487',
    links: [
      {
        id: 'link-1',
        resourceType: 'vulnerability',
        resourceId: 'vuln-1',
        addedById: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        resource: {
          name: 'HTTP/2 Rapid Reset',
          severity: 'high',
          detectionStatus: 'fixed',
          assetValue: 'gw.example.com:443',
          dueAt: null,
          dismissed: false,
        },
      },
      {
        id: 'link-2',
        resourceType: 'vulnerability',
        resourceId: 'vuln-2',
        addedById: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        resource: {
          name: 'HTTP/2 Rapid Reset',
          severity: 'high',
          detectionStatus: 'active',
          assetValue: 'api.example.com:443',
          dueAt: null,
          dismissed: true,
        },
      },
      {
        id: 'link-3',
        resourceType: 'target',
        resourceId: 'target-1',
        addedById: 'u-1',
        createdAt: '2026-10-01T00:00:00.000Z',
        resource: { missing: true },
      },
    ],
    ...extra,
  };
}

export function rule(extra: Partial<IssueRuleDto> = {}): IssueRuleDto {
  return {
    id: 'rule-1',
    name: 'Critical & high',
    enabled: true,
    event: 'vulnerability.detected',
    conditions: { minSeverity: 'high' },
    issueType: 'vulnerability_remediation',
    groupBy: 'vulnerability_name',
    priority: null,
    defaultAssigneeId: 'u-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  };
}

export const paged = <T,>(data: T[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  hasNextPage: false,
  pageCount: 1,
});

/** Handlers every issues page needs (members, empty comments, rules). */
export const baseHandlers = [
  http.get('/api/workspaces/members', () => HttpResponse.json(members)),
  http.get('/api/issues/rules', () => HttpResponse.json([rule()])),
  http.get('/api/issues/:id/comments', () => HttpResponse.json(paged([]))),
];
