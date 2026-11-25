import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import Runs from '@/pages/jobs-registry/runs';

const { jobs } = vi.hoisted(() => ({ jobs: { value: [] as Record<string, unknown>[] } }));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, isLoading: false }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useJobsRegistryControllerGetManyJobs: () => ({
      data: { data: jobs.value, total: jobs.value.length, page: 1, limit: 10 },
      isLoading: false,
      queryKey: ['test-jobs'],
    }),
    useJobsRegistryControllerGetJobHistoryDetail: () => ({ data: undefined }),
    useJobsRegistryControllerDeleteJob: () => ({ mutate: vi.fn() }),
    useJobsRegistryControllerCancelJob: () => ({ mutate: vi.fn() }),
    useJobsRegistryControllerCancelJobHistory: () => ({ mutate: vi.fn() }),
    useJobsRegistryControllerRetryJobHistory: () => ({ mutate: vi.fn() }),
    useRootControllerGetMetadata: () => ({ data: undefined }),
  };
});

beforeEach(() => {
  jobs.value = [{
    id: '11111111-1111-4111-8111-111111111111',
    status: 'completed',
    category: 'ports_scanner',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
    asset: { id: '22222222-2222-4222-8222-222222222222', value: 'scan-host.example.com' },
    assetServiceId: null,
    assetService: null,
    tool: null,
    errorLogs: [],
  }];
});

describe('Job run asset links', () => {
  it('opens the host inventory for a host job without a service', async () => {
    const { user, router } = renderWithProviders(<Runs />);
    await user.click(await screen.findByText('scan-host.example.com'));
    const hostLink = await screen.findByRole('link', { name: 'scan-host.example.com' });
    const destination = new URL(hostLink.getAttribute('href')!, 'https://console.example.com');
    expect(destination.pathname.replace(/\/$/, '')).toBe('/assets');
    expect(destination.searchParams.get('tab')).toBe('host');
    expect(destination.searchParams.get('filter')).toBe('scan-host.example.com');

    await user.click(hostLink);
    await waitFor(() => {
      expect(router.state.location.pathname.replace(/\/$/, '')).toBe('/assets');
      expect(router.state.location.search).toMatchObject({ tab: 'host', filter: 'scan-host.example.com' });
    });
  });

  it('keeps service links addressed by the service ID, distinct from the host ID', async () => {
    const serviceId = '33333333-3333-4333-8333-333333333333';
    jobs.value[0].assetServiceId = serviceId;
    jobs.value[0].assetService = { id: serviceId, value: 'https://scan-host.example.com' };
    const { user, router } = renderWithProviders(<Runs />);
    await user.click(await screen.findByText('https://scan-host.example.com'));
    const serviceLink = await screen.findByRole('link', { name: 'https://scan-host.example.com' });
    expect(serviceLink).toHaveAttribute('href', `/assets/services/${serviceId}`);
    await user.click(serviceLink);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/assets/services/${serviceId}`));
  });

  it('does not create asset links when the job has no host or service', async () => {
    jobs.value[0].asset = null;
    const { user } = renderWithProviders(<Runs />);
    await user.click(await screen.findByText(String(jobs.value[0].id)));
    await screen.findByText('Asset');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
