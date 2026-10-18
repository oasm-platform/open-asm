import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import type { AuditEventResponseDto } from '@/services/apis/gen/queries';
import AuditLogSettings from './audit-log-settings';

const getEvents = vi.fn();

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, isLoading: false }),
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
  useWorkspaceSelector: () => ({ workspaces: [{ id: 'ws-1', name: 'Main' }] }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  auditEventsControllerGetAuditEvents: (...args: unknown[]) => getEvents(...args),
  useAuditEventsControllerGetAuditActions: () => ({
    data: { data: [{ action: 'workspace.updated', label: 'Workspace updated' }] },
  }),
}));

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const event = (id: string, extra: Partial<AuditEventResponseDto> = {}) =>
  ({
    id,
    occurredAt: new Date().toISOString(),
    actorId: ACTOR_ID,
    actorType: 'user',
    actorName: 'Alice',
    action: 'workspace.updated',
    resourceType: 'workspace',
    resourceId: 'ws-1',
    outcome: 'success',
    sourceIp: '10.0.0.1',
    changes: {},
    metadata: {},
    ...extra,
  }) as AuditEventResponseDto;

describe('AuditLogSettings', () => {
  beforeEach(() => {
    getEvents.mockReset();
  });

  it('renders events as actor – action rows; clicking a row opens the details sheet', async () => {
    const userAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    getEvents.mockResolvedValue({ data: [event('e1', { outcome: 'denied', userAgent })], nextCursor: null });
    const user = userEvent.setup();
    renderWithProviders(<AuditLogSettings />);

    expect(await screen.findByRole('button', { name: 'workspace.updated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();

    await user.click(screen.getByText('Workspace updated'));
    const sheet = await screen.findByRole('dialog', { name: 'Workspace updated' });
    expect(sheet).toHaveTextContent('Correlation ID');
    expect(sheet).toHaveTextContent('Operating systemiOS 17.4.1');
    expect(sheet).toHaveTextContent('DeviceApple iPhone');
  });

  it('pages with Older/Newer through the cursor stack', async () => {
    getEvents.mockImplementation((_ws: string, params: { cursor?: string }) =>
      Promise.resolve(
        params.cursor === 'c2'
          ? { data: [event('e2', { actorName: 'Bob' })], nextCursor: null }
          : { data: [event('e1')], nextCursor: 'c2' },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AuditLogSettings />);

    await user.click(await screen.findByRole('button', { name: 'Older' }));
    expect(await screen.findByRole('button', { name: 'Bob' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Newer' }));
    expect(await screen.findByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled();
  });

  it('clicking an actor filters by actorId without opening the sheet', async () => {
    getEvents.mockResolvedValue({ data: [event('e1')], nextCursor: null });
    const user = userEvent.setup();
    renderWithProviders(<AuditLogSettings />);

    await user.click(await screen.findByRole('button', { name: 'Alice' }));
    await waitFor(() =>
      expect(getEvents).toHaveBeenLastCalledWith(
        'ws-1',
        expect.objectContaining({ actorId: ACTOR_ID }),
        undefined,
        expect.anything(),
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
