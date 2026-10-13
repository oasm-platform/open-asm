import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBuilder } from './filter-builder';
import type { FilterFieldConfig } from './filter-model';

const noSuggest = () => ({ options: [], isFetching: false });
const fields: FilterFieldConfig[] = [
  { key: 'host', label: 'Host', operators: ['eq', 'contains'], useSuggestions: noSuggest },
  { key: 'port', label: 'Port', operators: ['eq', 'in'], useSuggestions: noSuggest },
];

describe('FilterBuilder', () => {
  it('builds host = a AND (… OR …) and applies it', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterBuilder fields={fields} value={undefined} onApply={onApply} onCancel={() => {}} />);

    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled(); // blank first row

    await user.type(screen.getAllByLabelText('Value')[0], 'a{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await user.type(screen.getAllByLabelText('Value')[1], 'b{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await user.type(screen.getAllByLabelText('Value')[2], 'c{Enter}');
    await user.click(screen.getAllByRole('button', { name: 'Group with row above' })[2]); // groups rows 2 and 3

    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith({
      logic: 'and',
      items: [
        { field: 'host', op: 'eq', value: 'a' },
        { logic: 'or', conditions: [{ field: 'host', op: 'eq', value: 'b' }, { field: 'host', op: 'eq', value: 'c' }] },
      ],
    });
  });

  it('Clear all applies undefined, Cancel applies nothing', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(<FilterBuilder fields={fields} value={{ logic: 'and', items: [{ field: 'host', op: 'eq', value: 'a' }] }} onApply={onApply} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it('keeps value text in sync after removing a row', async () => {
    const user = userEvent.setup();
    const value = { logic: 'and' as const, items: [{ field: 'host', op: 'eq' as const, value: 'a' }, { field: 'host', op: 'eq' as const, value: 'b' }] };
    render(<FilterBuilder fields={fields} value={value} onApply={() => {}} onCancel={() => {}} />);
    await user.click(screen.getAllByRole('button', { name: 'Remove filter' })[0]);
    expect(screen.getAllByLabelText('Value')).toHaveLength(1);
    expect(screen.getByLabelText('Value')).toHaveValue('b');
  });

  it('Enter applies a valid draft', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterBuilder fields={fields} value={undefined} onApply={onApply} onCancel={() => {}} />);
    await user.type(screen.getByLabelText('Value'), 'a{Enter}');
    expect(onApply).toHaveBeenCalledWith({ logic: 'and', items: [{ field: 'host', op: 'eq', value: 'a' }] });
  });

  it('trims scalar values on Apply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterBuilder fields={fields} value={undefined} onApply={onApply} onCancel={() => {}} />);
    await user.type(screen.getByLabelText('Value'), '  a  ');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ logic: 'and', items: [{ field: 'host', op: 'eq', value: 'a' }] });
  });

  it('keeps unconfirmed list text typed before Apply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const value = { logic: 'and' as const, items: [{ field: 'port', op: 'in' as const, value: ['443'] }] };
    render(<FilterBuilder fields={fields} value={value} onApply={onApply} onCancel={() => {}} />);
    await user.type(screen.getByLabelText('Value'), '80');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ logic: 'and', items: [{ field: 'port', op: 'in', value: ['443', '80'] }] });
  });
});
