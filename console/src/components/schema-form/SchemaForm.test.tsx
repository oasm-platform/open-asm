import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, createRef } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { SchemaForm, type SchemaFormHandle } from './SchemaForm';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

/** Array field mirroring manifest.json nuclei `tags`/`templateIds` shape. */
const tagsSchema = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      title: 'Template tags',
      description: 'Only run templates matching these tags.',
      examples: [['cve', 'rce']],
      items: { type: 'string' },
      'ui:placeholder': 'e.g. cve, rce',
    },
  },
};

/** Defaulted string field: the only kind of preset a schema offers. */
const scanNameSchema = {
  type: 'object',
  properties: {
    scanName: { type: 'string', title: 'Scan name', default: 'public' },
  },
};

describe('SchemaForm preset hints', () => {
  it('shows examples only as a placeholder, never as a Suggestion', () => {
    render(<SchemaForm schema={tagsSchema} enablePresets />);

    expect(screen.getByPlaceholderText('e.g. cve, rce')).toBeTruthy();
    expect(screen.queryByText(/Suggestion:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('falls back to examples[0] for the placeholder when ui:placeholder is absent', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          title: 'Template tags',
          examples: [['cve', 'rce']],
          items: { type: 'string' },
        },
      },
    };
    render(<SchemaForm schema={schema} enablePresets />);

    expect(screen.getByPlaceholderText('cve, rce')).toBeTruthy();
    expect(screen.queryByText(/Suggestion:/)).toBeNull();
  });

  it('does not suggest a preset once the field already holds that value', () => {
    const schema = {
      type: 'object',
      properties: {
        scanName: {
          type: 'string',
          title: 'Scan name',
          default: 'public',
          examples: ['public'],
        },
      },
    };
    render(<SchemaForm schema={schema} enablePresets />);

    expect(screen.queryByText(/Suggestion:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('does not suggest a preset for a defaulted scalar field (rateLimit pattern)', () => {
    const schema = {
      type: 'object',
      properties: {
        rateLimit: {
          type: 'integer',
          title: 'Rate limit',
          default: 150,
          examples: [150],
        },
      },
    };
    render(<SchemaForm schema={schema} enablePresets />);

    expect(screen.queryByText(/Suggestion:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('Apply restores the default of a field the user cleared', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={scanNameSchema} enablePresets />);

    await user.clear(screen.getByLabelText('Scan name'));
    expect(screen.getByText(/Suggestion: public/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect((screen.getByLabelText('Scan name') as HTMLInputElement).value).toBe('public');
  });

  it('applyAllPresets fills empty fields from defaults only, never examples or secrets', async () => {
    const user = userEvent.setup();
    const schema = {
      type: 'object',
      properties: {
        scanName: {
          type: 'string',
          title: 'Scan name',
          default: 'public',
        },
        domain: {
          type: 'string',
          title: 'Scan domain',
          examples: ['example.com'],
        },
        apiKey: {
          type: 'string',
          format: 'password',
          title: 'API key',
          default: 'sk-secret',
        },
        tags: {
          type: 'array',
          title: 'Template tags',
          examples: [['cve', 'rce']],
          items: { type: 'string' },
        },
      },
    };
    const ref = createRef<SchemaFormHandle>();
    render(<SchemaForm schema={schema} enablePresets ref={ref} />);
    await user.clear(screen.getByLabelText('Scan name'));

    act(() => {
      ref.current?.applyAllPresets();
    });

    const inputs = screen.getAllByRole('textbox');
    const named = Object.fromEntries(
      inputs.map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]),
    );
    expect(named.scanName).toBe('public');
    expect(named.domain).toBe('');
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
    expect(named['tags[0]']).toBe('');
  });

  it('keeps hints visible in JSON-tab mode (ToolConfigForm config)', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={scanNameSchema} enablePresets enableJsonTab />);

    await user.clear(screen.getByLabelText('Scan name'));

    expect(screen.getByText(/Suggestion: public/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });
});