import { renderWithProviders, screen } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsManager } from './agents-manager';

const create = vi.fn();

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: () => ({ connectedProviders: [] }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentsControllerGetAgentDefinitions: () => ({
    data: [
      {
        id: 'builtin-pentest',
        name: 'pentest',
        title: 'Penetration testing',
        description: 'Independent pentest agent',
        mode: 'all',
        scope: 'builtin',
        isBuiltin: true,
        canEdit: false,
        systemPrompt: '# Pentest',
        metadata: { tools: ['a', 'b'], skills: ['s'] },
        createdBy: null,
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useAgentsControllerCreateAgentDefinition: () => ({
    mutate: create,
    isPending: false,
  }),
  useAgentsControllerUpdateAgentDefinition: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useAgentsControllerDeleteAgentDefinition: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe('AgentsManager', () => {
  beforeEach(() => create.mockClear());

  it('lists built-in agents with their capability counts', async () => {
    renderWithProviders(<AgentsManager />);

    expect(await screen.findByText('Penetration testing')).toBeInTheDocument();
    expect(screen.getByText('@pentest')).toBeInTheDocument();
    expect(screen.getByText('Built in')).toBeInTheDocument();
    expect(screen.getByText('Tool 2')).toBeInTheDocument();
    expect(screen.getByText('Skill 1')).toBeInTheDocument();
  });

  it('opens a built-in agent read only', async () => {
    const { user } = renderWithProviders(<AgentsManager />);

    await user.click(await screen.findByText('Penetration testing'));

    expect(
      await screen.findByText('Built-in agent (read only)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'System prompt' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();
  });

  it('creates a personal agent with only the set parameters', async () => {
    const { user } = renderWithProviders(<AgentsManager />);

    await user.click(await screen.findByRole('button', { name: /New Agent/ }));
    const name = await screen.findByRole('textbox', { name: 'Agent name' });
    await user.clear(name);
    await user.type(name, 'Finding Retest');
    await user.click(screen.getByRole('radio', { name: 'subagent' }));
    await user.click(screen.getByRole('button', { name: 'Increase Max steps' }));
    await user.click(screen.getByRole('button', { name: 'Create Agent' }));

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'finding-retest',
        scope: 'user',
        mode: 'subagent',
        metadata: { maxSteps: 2 },
      }),
    });
  });

  it('blocks a name that is not a slug', async () => {
    const { user } = renderWithProviders(<AgentsManager />);

    await user.click(await screen.findByRole('button', { name: /New Agent/ }));
    const name = await screen.findByRole('textbox', { name: 'Agent name' });
    await user.clear(name);
    await user.type(name, 'bad--name');

    expect(
      screen.getByText('Lowercase letters, numbers and single dashes only'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Agent' })).toBeDisabled();
  });
});
