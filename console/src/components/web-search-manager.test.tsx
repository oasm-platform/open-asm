import { renderWithProviders, screen } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSearchManager } from './web-search-manager';

const mutate = vi.fn();

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentsControllerGetAgentConfig: vi.fn(),
  useAgentsControllerUpsertAgentConfig: () => ({ mutate, isPending: false }),
}));

const EXA = { provider: 'exa', apiKeyMasked: '********abcd', isDefault: true };

async function setup(searchProviders: unknown[]) {
  const { useAgentsControllerGetAgentConfig } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useAgentsControllerGetAgentConfig).mockReturnValue({
    data: { searchProviders, instruction: null, modelsConfig: {} },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useAgentsControllerGetAgentConfig>);
  return renderWithProviders(<WebSearchManager />);
}

describe('WebSearchManager', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('is off when no provider is saved', async () => {
    await setup([]);

    expect(await screen.findByRole('radio', { name: /^Off/ })).toBeChecked();
    expect(screen.queryByLabelText(/API Key/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('needs an API key to turn a new provider on', async () => {
    const { user } = await setup([]);

    await user.click(await screen.findByRole('radio', { name: /^Firecrawl/ }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(screen.getByLabelText(/Firecrawl API Key/), 'fc-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      {
        data: {
          searchProviders: [
            { provider: 'firecrawl', apiKey: 'fc-key', isDefault: true },
          ],
        },
      },
      expect.anything(),
    );
  });

  it('keeps the saved key when the key field is left blank', async () => {
    await setup([EXA]);

    expect(await screen.findByRole('radio', { name: /^Exa/ })).toBeChecked();
    expect(screen.getByLabelText(/Exa API Key/)).toHaveAttribute(
      'placeholder',
      '********abcd',
    );
    // Nothing changed yet
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('turns web search off with an empty provider list', async () => {
    const { user } = await setup([EXA]);

    await user.click(await screen.findByRole('radio', { name: /^Off/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      { data: { searchProviders: [] } },
      expect.anything(),
    );
  });
});
