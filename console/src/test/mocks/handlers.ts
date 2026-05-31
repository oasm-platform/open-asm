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
