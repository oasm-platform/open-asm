import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { describe, expect, it, vi } from 'vitest';
import { AgentSettingsDialog } from './agent-settings-dialog';
import {
  useAgentSettingsDialog,
  type AgentSettingsTab,
} from '@/hooks/useAgentSettingsDialog';

vi.mock('@/pages/agents/components/llm-connect', () => ({
  default: () => <div>providers content</div>,
}));
vi.mock('@/components/models-manager', () => ({
  ModelsManager: () => <div>models content</div>,
}));
vi.mock('@/components/agents-manager', () => ({
  AgentsManager: () => <div>agents content</div>,
}));
vi.mock('@/components/skills-manager', () => ({
  SkillsManager: () => <div>skills content</div>,
}));
vi.mock('@/components/memory-manager', () => ({
  MemoryManager: () => <div>memory content</div>,
}));
vi.mock('@/components/connectors-manager', () => ({
  ConnectorsManager: () => <div>connectors content</div>,
}));

function Opener({ tab }: { tab?: AgentSettingsTab }) {
  const { open } = useAgentSettingsDialog();
  return (
    <button type="button" onClick={() => open(tab)}>
      Open settings
    </button>
  );
}

function setup(tab?: AgentSettingsTab) {
  return renderWithProviders(
    <>
      <Opener tab={tab} />
      <AgentSettingsDialog />
    </>,
  );
}

describe('AgentSettingsDialog', () => {
  it('opens on the providers tab by default', async () => {
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Open settings' }));

    expect(
      await screen.findByRole('heading', { name: 'Providers' }),
    ).toBeInTheDocument();
    expect(screen.getByText('providers content')).toBeInTheDocument();
  });

  it('opens on the requested tab', async () => {
    const { user } = setup('models');

    await user.click(await screen.findByRole('button', { name: 'Open settings' }));

    expect(
      await screen.findByRole('heading', { name: 'Models' }),
    ).toBeInTheDocument();
    expect(screen.getByText('models content')).toBeInTheDocument();
  });

  it('opens straight on the connectors tab', async () => {
    const { user } = setup('connectors');

    await user.click(await screen.findByRole('button', { name: 'Open settings' }));

    expect(
      await screen.findByRole('heading', { name: 'Connectors' }),
    ).toBeInTheDocument();
    expect(screen.getByText('connectors content')).toBeInTheDocument();
  });

  it('switches sections from the side nav', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Open settings' }));

    await user.click(await screen.findByRole('tab', { name: 'Memory' }));

    expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument();
    expect(screen.getByText('memory content')).toBeInTheDocument();
  });

  it('closes from the header close button', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Open settings' }));

    await user.click(await screen.findByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
