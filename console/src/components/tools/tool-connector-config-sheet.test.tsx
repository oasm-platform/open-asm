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
        default: ['high', 'critical'],
        description: 'Only report findings at the selected severity levels.',
        items: {
          enum: ['info', 'low', 'medium', 'high', 'critical'],
          type: 'string',
        },
        title: 'Severity levels',
        type: 'array',
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
      mutate: vi.fn(),
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
  it('renders Suggestion/placeholder for empty array fields from the manifest schema', () => {
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

    // Array fields without defaults get placeholder + Suggestion + Apply.
    expect(screen.getByPlaceholderText('e.g. cve, rce')).toBeTruthy();
    expect(screen.getByText(/Suggestion: cve, rce/)).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. CVE-2024-12345')).toBeTruthy();
    expect(
      screen.getByText(/Suggestion: CVE-2024-12345, wordpress-rce/),
    ).toBeTruthy();

    // Defaulted fields (rateLimit/concurrency/severity) show no suggestion.
    expect(screen.queryByText(/Suggestion: 150/)).toBeNull();
    expect(screen.queryByText(/Suggestion: 25/)).toBeNull();
    expect(screen.queryByText(/Suggestion: high, critical/)).toBeNull();
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

  it('Apply all presets fills empty fields, leaves defaults and secrets untouched', async () => {
    const user = userEvent.setup();
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

    const inputs = screen.getAllByRole('textbox');
    const named = Object.fromEntries(
      inputs.map((i) => [
        (i as HTMLInputElement).name,
        (i as HTMLInputElement).value,
      ]),
    );
    expect(named['tags[0]']).toBe('cve');
    expect(named['tags[1]']).toBe('rce');
    expect(named['templateIds[0]']).toBe('CVE-2024-12345');
    expect(named['templateIds[1]']).toBe('wordpress-rce');
  });
});