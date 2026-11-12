import { renderWithProviders, screen } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAccessSettings from './admin-access-settings';

const mutate = vi.fn();

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useSystemConfigsControllerGetSettings: vi.fn(),
  useSystemConfigsControllerUpdateSettings: () => ({
    mutate,
    isPending: false,
  }),
}));

async function setup(allowedIps: string[]) {
  const { useSystemConfigsControllerGetSettings } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useSystemConfigsControllerGetSettings).mockReturnValue({
    data: { adminAccess: { allowedIps } },
    isLoading: false,
  } as unknown as ReturnType<typeof useSystemConfigsControllerGetSettings>);
  return renderWithProviders(<AdminAccessSettings />);
}

describe('AdminAccessSettings', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('shows the saved list, one entry per line', async () => {
    await setup(['203.0.113.7', '10.0.0.0/8']);

    expect(
      await screen.findByLabelText('Allowed IP addresses'),
    ).toHaveValue('203.0.113.7\n10.0.0.0/8');
  });

  it('saves the edited list without blank lines', async () => {
    await setup([]);
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText('Allowed IP addresses'),
      ' 203.0.113.7 {enter}{enter}10.0.0.0/8',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      { data: { adminAccess: { allowedIps: ['203.0.113.7', '10.0.0.0/8'] } } },
      expect.anything(),
    );
  });

  it('saves an emptied list to allow every IP', async () => {
    await setup(['203.0.113.7']);
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText('Allowed IP addresses'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      { data: { adminAccess: { allowedIps: [] } } },
      expect.anything(),
    );
  });
});
