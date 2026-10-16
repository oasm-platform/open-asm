import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '@/services/apis/gen/queries';
import { ToolInstallConfirmDialog } from './tool-install-confirm-dialog';

const mocks = vi.hoisted(() => ({
  connector: undefined as unknown,
  getConnector: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useToolsControllerGetConnectorBySlug: (...args: unknown[]) => {
      mocks.getConnector(...args);
      return { data: mocks.connector };
    },
  };
});

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceSelector: () => ({
    workspaces: [
      { id: 'ws-1', name: 'Acme Security' },
      { id: 'ws-2', name: 'Other' },
    ],
    selectedWorkspace: 'ws-1',
  }),
}));

const connectorTool = {
  name: 'gitleaks',
  type: 'connector',
} as unknown as Tool;

const repositoryInputs = {
  type: 'object',
  properties: {
    ref: {
      title: 'Ref',
      type: 'string',
      description: 'Branch, tag or commit to scan.',
    },
    repository: {
      title: 'Repository',
      type: 'string',
      format: 'uri',
      description: 'https clone URL of the repository to scan.',
    },
  },
  required: ['repository'],
};

const gitleaks = {
  description: 'Scans a git repository for leaked secrets.',
  categories: [
    {
      name: 'vulnerabilities',
      targetTypes: ['GIT_ORG'],
      inputsSchema: repositoryInputs,
    },
  ],
};

async function openDialog(tool = connectorTool, onConfirm = vi.fn()) {
  const user = userEvent.setup();
  render(
    <ToolInstallConfirmDialog
      tool={tool}
      onConfirm={onConfirm}
      trigger={<button type="button">Open</button>}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return user;
}

describe('ToolInstallConfirmDialog', () => {
  beforeEach(() => {
    mocks.connector = gitleaks;
    mocks.getConnector.mockReset();
  });

  it('shows the tool and OASM logos', async () => {
    await openDialog();

    expect(screen.getByRole('heading', { name: 'Install Gitleaks' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'gitleaks' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'OASM Platform' })).toBeTruthy();
  });

  it('names the selected workspace in its own section', async () => {
    await openDialog();

    const section = screen
      .getByRole('heading', { name: 'Workspace' })
      .closest('section');
    expect(section?.textContent).toContain(
      'Gitleaks will be installed into workspace Acme Security.',
    );
  });

  it('lists every input with its type, description and required flag', async () => {
    await openDialog();

    const items = screen.getAllByRole('listitem');
    // Required inputs come first.
    expect(items[0].textContent).toContain('Repository');
    expect(items[0].textContent).toContain('string (uri)');
    expect(items[0].textContent).toContain('Required');
    expect(items[0].textContent).toContain(
      'https clone URL of the repository to scan.',
    );
    expect(items[1].textContent).toContain('Ref');
    expect(items[1].textContent).not.toContain('Required');
    expect(
      screen.getByText('Scans a git repository for leaked secrets.'),
    ).toBeTruthy();
  });

  it('groups inputs by category when the connector runs in several', async () => {
    mocks.connector = {
      description: 'Port and vulnerability scanner.',
      categories: [
        {
          name: 'ports_scanner',
          targetTypes: ['IP'],
          inputsSchema: {
            type: 'object',
            properties: { target: { title: 'Target host', type: 'string' } },
          },
        },
        {
          name: 'vulnerabilities',
          targetTypes: ['DOMAIN'],
          inputsSchema: repositoryInputs,
        },
      ],
    };
    await openDialog();

    expect(screen.getByText('Ports Scanner')).toBeTruthy();
    expect(screen.getByText('Vulnerabilities')).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Target host');
    expect(items[1]).toContain('Repository');
  });

  it('only fetches connector metadata for connector tools', async () => {
    mocks.connector = undefined;
    await openDialog({ name: 'Subfinder', type: 'built_in' } as unknown as Tool);

    expect(mocks.getConnector).toHaveBeenLastCalledWith(
      'Subfinder',
      expect.objectContaining({
        query: expect.objectContaining({ enabled: false }),
      }),
    );
    expect(screen.queryByText('Data shared with this tool')).toBeNull();
  });

  it('calls onConfirm when Install is clicked', async () => {
    const onConfirm = vi.fn();
    const user = await openDialog(connectorTool, onConfirm);

    await user.click(screen.getByRole('button', { name: 'Install' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
