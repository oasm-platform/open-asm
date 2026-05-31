import { http, HttpResponse } from 'msw';
import {
  mockUser,
  mockTargets,
  mockAssets,
  mockVulns,
  mockDashboardStats,
  mockWorkspaces,
} from './data';

export const handlers = [
  // Auth
  http.post('/api/auth/sign-in/email', () => {
    return HttpResponse.json({ user: mockUser, token: 'mock-token' });
  }),
  http.post('/api/auth/sign-out', () => {
    return HttpResponse.json({ success: true });
  }),
  http.get('/api/auth/session', () => {
    return HttpResponse.json({ user: mockUser });
  }),

  // Targets
  http.get('/api/targets', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') || '1');
    const limit = Number(url.searchParams.get('limit') || '10');
    return HttpResponse.json({
      data: mockTargets,
      total: mockTargets.length,
      page,
      totalPages: Math.ceil(mockTargets.length / limit),
    });
  }),
  http.get('/api/targets/:id', ({ params }) => {
    const target = mockTargets.find((t) => t.id === params.id);
    if (!target) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(target);
  }),
  http.post('/api/targets', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 'new-target', ...body });
  }),
  http.post('/api/targets/bulk', async ({ request }) => {
    const body = (await request.json()) as { targets: string[] };
    return HttpResponse.json({
      created: body.targets.map((v) => ({ id: `target-${v}`, value: v })),
      skipped: [],
      totalRequested: body.targets.length,
      totalCreated: body.targets.length,
      totalSkipped: 0,
    });
  }),
  http.delete('/api/targets/:id', () => {
    return HttpResponse.json({ success: true });
  }),

  // Assets
  http.get('/api/assets', () => {
    return HttpResponse.json({
      data: mockAssets,
      total: mockAssets.length,
    });
  }),
  http.get('/api/assets/:id', ({ params }) => {
    const asset = mockAssets.find((a) => a.id === params.id);
    if (!asset) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(asset);
  }),

  // Vulnerabilities
  http.get('/api/vulnerabilities', () => {
    return HttpResponse.json({
      data: mockVulns,
      total: mockVulns.length,
    });
  }),
  http.get('/api/vulnerabilities/:id', ({ params }) => {
    const vuln = mockVulns.find((v) => v.id === params.id);
    if (!vuln) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(vuln);
  }),

  // Dashboard
  http.get('/api/dashboard/stats', () => {
    return HttpResponse.json(mockDashboardStats);
  }),

  // Statistics
  http.get('/api/statistic', () => {
    return HttpResponse.json({
      targets: 10,
      assets: 50,
      services: 30,
      techs: 20,
      vuls: 25,
      criticalVuls: 5,
      highVuls: 8,
      mediumVuls: 7,
      lowVuls: 3,
      infoVuls: 2,
      ports: 80,
      score: 7.5,
    });
  }),
  http.get('/api/statistic/timeline', () => {
    return HttpResponse.json({
      data: [
        {
          id: 'timeline-1',
          targets: 8,
          assets: 40,
          services: 25,
          techs: 15,
          vuls: 20,
          criticalVuls: 4,
          highVuls: 6,
          mediumVuls: 5,
          lowVuls: 3,
          infoVuls: 2,
          ports: 60,
          score: 6.5,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'timeline-2',
          targets: 10,
          assets: 50,
          services: 30,
          techs: 20,
          vuls: 25,
          criticalVuls: 5,
          highVuls: 8,
          mediumVuls: 7,
          lowVuls: 3,
          infoVuls: 2,
          ports: 80,
          score: 7.5,
          createdAt: '2026-01-02T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        },
      ],
      total: 2,
    });
  }),
  http.get('/api/statistic/issues-timeline', () => {
    return HttpResponse.json({
      data: [
        {
          id: 'issue-timeline-1',
          vuls: 20,
          criticalVuls: 4,
          highVuls: 6,
          mediumVuls: 5,
          lowVuls: 3,
          infoVuls: 2,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'issue-timeline-2',
          vuls: 25,
          criticalVuls: 5,
          highVuls: 8,
          mediumVuls: 7,
          lowVuls: 3,
          infoVuls: 2,
          createdAt: '2026-01-02T00:00:00Z',
        },
      ],
      total: 2,
    });
  }),
  http.get('/api/statistic/top-assets-vulnerabilities', () => {
    return HttpResponse.json([
      {
        id: 'asset-vuln-1',
        value: 'example.com',
        critical: 2,
        high: 3,
        medium: 4,
        low: 1,
        info: 0,
        total: 10,
      },
    ]);
  }),
  http.get('/api/statistic/top-tags-assets', () => {
    return HttpResponse.json([
      { tag: 'production', count: 15 },
      { tag: 'web', count: 10 },
    ]);
  }),
  http.get('/api/statistic/asset-locations', () => {
    return HttpResponse.json([]);
  }),

  // TLS Assets
  http.get('/api/assets/tls', () => {
    return HttpResponse.json({
      data: [],
      total: 0,
    });
  }),

  // Workspaces
  http.get('/api/workspaces', () => {
    return HttpResponse.json({ data: mockWorkspaces });
  }),
  http.post('/api/workspaces', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 'new-workspace', ...body });
  }),

  // Metadata
  http.get('/api/metadata', () => {
    return HttpResponse.json({ name: 'OpenASM Test' });
  }),
];
