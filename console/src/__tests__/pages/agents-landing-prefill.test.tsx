import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/node';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import AgentsLandingPage from '@/pages/agents/agents-landing';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    permissions: ['*'],
    isOwner: true,
    hasPermission: () => true,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearch,
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: vi.fn(() => ({
    state: { selectedWorkspaceId: 'workspace-1' },
  })),
}));

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: vi.fn(() => ({ hasProviderConnected: true })),
}));

vi.mock('@/hooks/useConnectWorkerState', () => ({
  useConnectWorkerState: () => ({ openDialog: vi.fn() }),
}));

vi.mock('@/components/typewriter-text', () => ({ default: () => null }));
vi.mock('@/components/ui/border-beam', () => ({ default: () => null }));
vi.mock('@/pages/agents/components/project-scope-select', () => ({
  ProjectScopeSelect: () => null,
}));
vi.mock('@/pages/agents/components/worker-select', () => ({
  WorkerSelect: () => null,
}));

// A plain controlled textarea plus a send button, like the real input.
vi.mock('@/components/agent-prompt-input', () => ({
  default: ({
    onSubmit,
    value,
    onValueChange,
  }: {
    onSubmit: (content: string) => void;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div>
      <textarea
        aria-label="Message"
        value={value ?? ''}
        onChange={(e) => onValueChange?.(e.currentTarget.value)}
      />
      <button type="button" onClick={() => onSubmit(value ?? '')}>
        Send
      </button>
    </div>
  ),
}));

const PREFILL = 'Write a Nuclei template that ';

const renderLanding = () =>
  renderWithProviders(<AgentsLandingPage initialAgentMode="ask" />, {
    routePath: '/_authed/aistudio',
    initialEntries: ['/_authed/aistudio'],
  });

describe('Agents landing — ?text= prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The page's own queries (agent config); a real request kills the worker
    server.use(http.all('*/api/*', () => HttpResponse.json({})));
  });

  it('fills the input with the caret at the end and does not send with autoSubmit=false', async () => {
    mockSearch = { text: PREFILL, autoSubmit: false };
    window.history.replaceState(
      {},
      '',
      `/aistudio?text=${encodeURIComponent(PREFILL)}&autoSubmit=false&projectId=keep`,
    );
    renderLanding();

    const textarea = await screen.findByRole<HTMLTextAreaElement>('textbox', {
      name: 'Message',
    });
    await waitFor(() => expect(textarea.value).toBe(PREFILL));
    expect(document.activeElement).toBe(textarea);
    await waitFor(() => expect(textarea.selectionStart).toBe(PREFILL.length));
    expect(textarea.selectionEnd).toBe(PREFILL.length);
    expect(mockNavigate).not.toHaveBeenCalled();

    // Dropped from the URL so a reload does not fill it again; others stay
    const params = new URLSearchParams(window.location.search);
    expect(params.has('text')).toBe(false);
    expect(params.has('autoSubmit')).toBe(false);
    expect(params.get('projectId')).toBe('keep');
  });

  it('sends what the user finished typing', async () => {
    mockSearch = { text: PREFILL, autoSubmit: false };
    renderLanding();

    const textarea = await screen.findByRole<HTMLTextAreaElement>('textbox', {
      name: 'Message',
    });
    await waitFor(() => expect(textarea.value).toBe(PREFILL));
    fireEvent.change(textarea, {
      target: { value: `${PREFILL}detects exposed .env files` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockNavigate.mock.calls[0][0].state).toMatchObject({
      pendingMessage: `${PREFILL}detects exposed .env files`.trim(),
      agentMode: 'ask',
    });
  });

  it('still sends ?text= straight away without autoSubmit', async () => {
    mockSearch = { text: 'list my assets' };
    window.history.replaceState({}, '', '/aistudio?text=list%20my%20assets');
    renderLanding();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockNavigate.mock.calls[0][0].state).toMatchObject({
      pendingMessage: 'list my assets',
    });
    expect(new URLSearchParams(window.location.search).has('text')).toBe(false);
  });
});
