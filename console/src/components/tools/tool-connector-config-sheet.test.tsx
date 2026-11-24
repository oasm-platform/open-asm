import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ToolConnectorConfigSheet } from './tool-connector-config-sheet';
import type { Tool } from '@/services/apis/gen/queries';

const h = vi.hoisted(() => ({
  // Faithful slice of core-api/resources/connectors/manifest.json nuclei configSchema.
  nucleiSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      concurrency: {
        default: 25,
        description: 'Maximum templates executed in parallel.',
        title: 'Concurrency',
        type: 'integer',
      },
      rateLimit: {
        default: 150,
        description: 'Maximum HTTP requests per second.',
        title: 'Rate limit',
        type: 'integer',
      },
      severity: {
        default: ['info', 'low', 'medium', 'high', 'critical'],
        description: 'Only report findings at the selected severity levels.',
        items: {
          enum: ['info', 'low', 'medium', 'high', 'critical'],
          type: 'string',
        },
        title: 'Severity levels',
        type: 'array',
      },
      interactsh: {
        default: true,
        description: 'Detect blind/OOB vulnerabilities via a public interactsh server.',
        title: 'Out-of-band detection (Interactsh)',
        type: 'boolean',
      },
      excludeTags: {
        description: 'Skip templates that match these tags.',
        examples: [['dos', 'fuzz']],
        items: { type: 'string' },
        title: 'Excluded tags',
        type: 'array',
        'ui:placeholder': 'e.g. dos, fuzz',
      },
      tags: {
        description: 'Only run templates matching these tags.',
        examples: [['cve', 'rce']],
        items: { type: 'string' },
        title: 'Template tags',
        type: 'array',
        'ui:placeholder': 'e.g. cve, rce',
      },
      templateIds: {
        description: 'Only run these specific template IDs.',
        examples: [['CVE-2024-12345', 'wordpress-rce']],
        items: { type: 'string' },
        title: 'Template IDs',
        type: 'array',
        'ui:placeholder': 'e.g. CVE-2024-12345',
      },
    },
  },
  createProfile: vi.fn(),
}));

vi.mock('@/hooks/use-tool-schema', () => ({
  useToolSchema: () => ({
    data: { schema: h.nucleiSchema, source: 'configSchema' },
    isLoading: false,
  }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useToolConfigProfilesControllerCreate: () => ({
      mutate: h.createProfile,
      isPending: false,
    }),
    useToolConfigProfilesControllerUpdate: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('ToolConnectorConfigSheet preset hints (end-to-end)', () => {
  it('shows examples as placeholders only, with no suggestion to apply them', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ToolConnectorConfigSheet
          open
          onOpenChange={vi.fn()}
          tool={{ id: '1', name: 'nuclei' } as unknown as Tool}
        />
      </QueryClientProvider>,
    );

    // Filter fields show their examples as placeholders. Applying them would
    // make nuclei run only those templates, so they are never suggested.
    expect(screen.getByPlaceholderText('e.g. cve, rce')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. CVE-2024-12345')).toBeTruthy();
    // Defaulted fields start at their default, so nothing is suggested at all.
    expect(screen.queryByText(/Suggestion:/)).toBeNull();
  });

  it('renders the tool logo in the header when logoUrl is present', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ToolConnectorConfigSheet
          open
          onOpenChange={vi.fn()}
          tool={
            {
              id: '1',
              name: 'nuclei',
              logoUrl: '/connectors/nuclei.png',
            } as unknown as Tool
          }
        />
      </QueryClientProvider>,
    );

    // Radix Sheet portals its content to document.body, so query the document.
    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/api/connectors/nuclei.png');
  });

  it('default presets save the nuclei defaults with no template filter', async () => {
    const user = userEvent.setup();
    h.createProfile.mockClear();
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ToolConnectorConfigSheet
          open
          onOpenChange={vi.fn()}
          tool={{ id: '1', name: 'nuclei' } as unknown as Tool}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Use default presets' }));
    await user.type(screen.getByLabelText(/Profile name/), 'default');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(h.createProfile).toHaveBeenCalledTimes(1);
    const { config } = h.createProfile.mock.calls[0][0].data;
    expect(config).toMatchObject({
      severity: ['info', 'low', 'medium', 'high', 'critical'],
      interactsh: true,
      rateLimit: 150,
      concurrency: 25,
    });
    // An empty filter means "run every template", which is what nuclei does
    // with no config. Example values here would select templates that don't exist.
    expect(config.tags ?? []).toEqual([]);
    expect(config.excludeTags ?? []).toEqual([]);
    expect(config.templateIds ?? []).toEqual([]);
  });
});
describe('ToolConnectorConfigSheet dismiss', () => {
  const renderSheet = (props: { onOpenChange: () => void; onDismiss?: () => void }) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToolConnectorConfigSheet
          open
          tool={{ id: '1', name: 'nuclei' } as unknown as Tool}
          {...props}
        />
      </QueryClientProvider>,
    );

  it('routes Cancel and Escape through onDismiss instead of closing', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onDismiss = vi.fn();
    renderSheet({ onOpenChange, onDismiss });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes through onOpenChange when no onDismiss is given', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
