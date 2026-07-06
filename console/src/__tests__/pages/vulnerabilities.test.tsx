import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import Vulnerabilities from '@/pages/vulnerabilities/vulnerabilities';

const mockWorkspaces = [{ id: 'ws-1', name: 'Test Workspace' }];
const mockVulns = [
  {
    id: 'vuln-1',
    name: 'SQL Injection',
    description: 'SQL injection vulnerability',
    severity: 'critical',
    status: 'open',
    tags: [],
    references: [],
    authors: [],
    affectedUrl: 'https://example.com/login',
    ipAddress: '93.184.216.34',
    host: 'example.com',
    ports: ['80'],
    cvssMetric: 'HIGH',
    cvssScore: 9.8,
    epssScore: 0.95,
    vprScore: 9.0,
    cveId: ['CVE-2024-1234'],
    bidId: [],
    cweId: [],
    ceaId: [],
    iava: [],
    cveUrl: '',
    cweUrl: '',
    solution: 'Sanitize inputs',
    extractorName: '',
    extractedResults: [],
    publicationDate: '',
    modificationDate: '',
    firstDetectedDate: '2026-01-01T00:00:00Z',
    lastSeenDate: '2026-01-01T00:00:00Z',
    synopsis: '',
    tool: null,
    asset: { id: 'asset-1', value: 'https://example.com/login' },
    vulnerabilityDismissal: null,
    analyzeStatus: null,
    analyzeResult: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'vuln-2',
    name: 'XSS Vulnerability',
    description: 'Cross-site scripting',
    severity: 'high',
    status: 'open',
    tags: [],
    references: [],
    authors: [],
    affectedUrl: 'https://example.com/search',
    ipAddress: '93.184.216.34',
    host: 'example.com',
    ports: ['443'],
    cvssMetric: 'HIGH',
    cvssScore: 7.5,
    epssScore: 0.8,
    vprScore: 7.0,
    cveId: [],
    bidId: [],
    cweId: [],
    ceaId: [],
    iava: [],
    cveUrl: '',
    cweUrl: '',
    solution: 'Escape output',
    extractorName: '',
    extractedResults: [],
    publicationDate: '',
    modificationDate: '',
    firstDetectedDate: '2026-01-01T00:00:00Z',
    lastSeenDate: '2026-01-01T00:00:00Z',
    synopsis: '',
    tool: null,
    asset: { id: 'asset-1', value: 'https://example.com/search' },
    vulnerabilityDismissal: null,
    analyzeStatus: null,
    analyzeResult: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceSelector: () => ({
    workspaces: mockWorkspaces,
    selectedWorkspace: 'ws-1',
    isLoading: false,
  }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useVulnerabilitiesControllerGetVulnerabilities: () => ({
      data: { data: mockVulns, total: mockVulns.length },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useVulnerabilitiesControllerGetVulnerabilitiesStatistics: () => ({
      data: {
        data: [
          { severity: 'critical', count: 1 },
          { severity: 'high', count: 1 },
          { severity: 'medium', count: 0 },
          { severity: 'low', count: 0 },
          { severity: 'info', count: 0 },
        ],
      },
      isLoading: false,
    }),
  };
});

describe('Vulnerabilities Page', () => {
  it('renders vulnerability table', async () => {
    renderWithProviders(<Vulnerabilities />);

    await waitFor(() => {
      expect(screen.getByText('SQL Injection')).toBeInTheDocument();
      expect(screen.getByText('XSS Vulnerability')).toBeInTheDocument();
    });
  });

  it('shows severity badges', async () => {
    renderWithProviders(<Vulnerabilities />);

    await waitFor(() => {
      const severityBadges = screen.getAllByText('Critical');
      expect(severityBadges.length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(2);
    });
  });
});
