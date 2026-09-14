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

describe('SchemaForm preset hints', () => {
  it('shows placeholder, Suggestion and Apply for an empty array field with examples', () => {
    render(<SchemaForm schema={tagsSchema} enablePresets />);

    expect(screen.getByPlaceholderText('e.g. cve, rce')).toBeTruthy();
    expect(screen.getByText(/Suggestion: cve, rce/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
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
    expect(screen.getByText(/Suggestion: cve, rce/)).toBeTruthy();
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

  it('Apply fills an empty array field with the example values', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={tagsSchema} enablePresets />);

    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const inputs = screen.getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('cve');
    expect((inputs[1] as HTMLInputElement).value).toBe('rce');
  });

  it('applyAllPresets fills empty fields but never sensitive ones', () => {
    const schema = {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          title: 'Scan domain',
          examples: ['example.com'],
        },
        apiKey: {
          type: 'string',
          format: 'password',
          title: 'API key',
          examples: ['sk-secret'],
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

    act(() => {
      ref.current?.applyAllPresets();
    });

    const inputs = screen.getAllByRole('textbox');
    const named = Object.fromEntries(
      inputs.map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]),
    );
    expect(named.domain).toBe('example.com');
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
    expect(named['tags[0]']).toBe('cve');
    expect(named['tags[1]']).toBe('rce');
  });

  it('keeps hints visible in JSON-tab mode (ToolConfigForm config)', () => {
    render(<SchemaForm schema={tagsSchema} enablePresets enableJsonTab />);

    expect(screen.getByText(/Suggestion: cve, rce/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });
});