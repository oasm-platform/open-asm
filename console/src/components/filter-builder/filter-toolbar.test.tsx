import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterToolbar } from './filter-toolbar';
import type { FilterFieldConfig } from './filter-model';

const noSuggest = () => ({ options: [], isFetching: false });
const fields: FilterFieldConfig[] = [{ key: 'host', label: 'Host', operators: ['eq'], useSuggestions: noSuggest }];
const desktopWidth = window.innerWidth;

describe('FilterToolbar', () => {
  afterEach(() => { window.innerWidth = desktopWidth; });

  it('opens the builder in a bottom sheet on mobile and applies from it', async () => {
    window.innerWidth = 375;
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterToolbar fields={fields} value={undefined} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: /Add filter/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(sheet).toBeInTheDocument();

    await user.type(screen.getByLabelText('Value'), 'a{Enter}');
    expect(onApply).toHaveBeenCalledWith({ logic: 'and', items: [{ field: 'host', op: 'eq', value: 'a' }] });
  });

  it('uses the anchored popover on desktop', async () => {
    const user = userEvent.setup();
    render(<FilterToolbar fields={fields} value={undefined} onApply={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Add filter/ }));
    expect(await screen.findByLabelText('Value')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
  });
});
