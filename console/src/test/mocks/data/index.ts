export const mockUser = {
  id: 'user-1',
  email: 'admin@test.com',
  name: 'Test Admin',
  role: 'admin',
  image: null,
};

export const mockTargets = [
  {
    id: 'target-1',
    value: 'example.com',
    type: 'DOMAIN',
    status: 'completed',
    totalAssetServices: 5,
    lastDiscoveredAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    scanSchedule: 'disabled',
  },
  {
    id: 'target-2',
    value: '192.168.1.1',
    type: 'IP',
    status: 'pending',
    totalAssetServices: 0,
    lastDiscoveredAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    scanSchedule: 'disabled',
  },
];

export const mockAssets = [
  {
    id: 'asset-1',
    host: 'example.com',
    ip: '93.184.216.34',
    ports: [80, 443],
    services: ['http', 'https'],
    targetId: 'target-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export const mockVulns = [
  {
    id: 'vuln-1',
    title: 'SQL Injection',
    severity: 'critical',
    status: 'open',
    cvssScore: 9.8,
    assetId: 'asset-1',
    targetId: 'target-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'vuln-2',
    title: 'XSS Vulnerability',
    severity: 'high',
    status: 'open',
    cvssScore: 7.5,
    assetId: 'asset-1',
    targetId: 'target-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export const mockDashboardStats = {
  totalTargets: 10,
  totalAssets: 50,
  totalVulnerabilities: 25,
  totalIssues: 5,
};

export const mockWorkspaces = [
  {
    id: 'workspace-1',
    name: 'Test Workspace',
    slug: 'test-workspace',
    createdAt: '2026-01-01T00:00:00Z',
  },
];
