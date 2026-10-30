import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunTemplatesDialog } from './run-templates-dialog';

// jsdom has no ResizeObserver; the tabs and scroll area measure themselves with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mutate = vi.fn();
const page = <T,>(data: T[]) => ({
  data: { data, total: data.length, page: 1, limit: 10 },
  isLoading: false,
});

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useTemplatesControllerGetMany: (params: { scope: string }) =>
    page(
      params.scope === 'mine'
        ? [{ id: 't1', name: 'one.yaml' }, { id: 't2', name: 'two.yaml' }]
        : [{ id: 't3', name: 'shared.yaml' }],
    ),
  useTemplatesControllerRun: () => ({ mutate, isPending: false }),
  useTargetsControllerGetTargetsInWorkspace: () => page([{ id: 'tg1', value: 'example.com', type: 'DOMAIN' }]),
  useAssetsControllerGetAssetsInWorkspace: () => page([{ id: 'as1', value: 'a.example.com' }]),
  useAssetGroupControllerGetAll: () => page([{ id: 'g1', name: 'Prod', totalAssets: 3 }]),
}));

async function openDialog() {
  const user = userEvent.setup();
  renderWithProviders(<RunTemplatesDialog templateId="t1" />);
  await user.click(await screen.findByRole('button', { name: 'Run' }));
  return user;
}

const runButton = () =>
  screen.getAllByRole('button', { name: 'Run' }).find((b) => b.closest('[role="dialog"]'))!;

describe('RunTemplatesDialog', () => {
  beforeEach(() => mutate.mockReset());

  it('preselects the open template and needs a scope before running', async () => {
    await openDialog();

    expect(screen.getByRole('checkbox', { name: /one\.yaml/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /two\.yaml/ })).not.toBeChecked();
    expect(runButton()).toBeDisabled();
  });

  it('runs the chosen templates on the chosen asset groups', async () => {
    const user = await openDialog();

    await user.click(screen.getByRole('checkbox', { name: /shared\.yaml/ }));
    await user.click(screen.getByRole('tab', { name: 'Groups' }));
    await user.click(await screen.findByText('Prod'));
    await user.click(runButton());

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        { data: { templateIds: ['t1', 't3'], assetGroupIds: ['g1'] } },
        expect.anything(),
      ),
    );
  });

  it('sends only the active tab selection', async () => {
    const user = await openDialog();

    await user.click(await screen.findByText('example.com'));
    await user.click(screen.getByRole('tab', { name: 'Assets' }));
    await user.click(await screen.findByText('a.example.com'));
    await user.click(runButton());

    expect(mutate).toHaveBeenCalledWith(
      { data: { templateIds: ['t1'], assetIds: ['as1'] } },
      expect.anything(),
    );
  });
});
