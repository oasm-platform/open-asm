import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';

describe('Tabs URL synchronization', () => {
  it('restores the tab from the URL on initial load', async () => {
    const { router } = renderWithProviders(
      <StrictMode>
        <Tabs defaultValue="overview" validValues={['overview', 'monitoring']}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview content</TabsContent>
          <TabsContent value="monitoring">Monitoring content</TabsContent>
        </Tabs>
      </StrictMode>,
      {
        routePath: '/workers/$id',
        initialEntries: ['/workers/worker-1?tab=monitoring'],
      },
    );

    expect(await screen.findByText('Monitoring content')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        (router.state.location.search as { tab?: string }).tab,
      ).toBe('monitoring');
    });
  });

  it('updates the tab query parameter when the active tab changes', async () => {
    const { router, user } = renderWithProviders(
      <Tabs defaultValue="overview" validValues={['overview', 'monitoring']}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="monitoring">Monitoring content</TabsContent>
      </Tabs>,
      { routePath: '/workers/worker-1' },
    );

    await user.click(await screen.findByRole('tab', { name: 'Monitoring' }));

    await waitFor(() => {
      expect(
        (router.state.location.search as { tab?: string }).tab,
      ).toBe('monitoring');
    });
    expect(screen.getByText('Monitoring content')).toBeInTheDocument();
  });
});
