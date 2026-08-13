import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { ConnectedCard } from '../components/connected-card';const integration = {
  id: 'int-1',
  name: 'Cloudflare',
  appType: 'cloudflare',
  category: 'CLOUD_PROVIDER',
  config: {},
  workspaceId: 'ws-1',
  createdById: 'u-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  lastRunAt: '2026-08-09T10:00:00.000Z',
} as unknown as GetIntegrationDto;

describe('ConnectedCard', () => {
  it('labels the icon-only kebab menu trigger for assistive tech (U7)', async () => {
    renderWithProviders(
      <ConnectedCard
        integration={integration}
        onDetail={vi.fn()}
        onDisconnect={vi.fn()}
        formatCategory={(category) => category}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Integration actions' }),
    ).toBeInTheDocument();
  });
});
