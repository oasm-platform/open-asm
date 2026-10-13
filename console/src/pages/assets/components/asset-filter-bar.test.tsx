import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssetFilterBar from './asset-filter-bar';

let onSearchChange: (v: string) => void = () => {};
vi.mock('@/components/filter-builder/filter-toolbar', () => ({
  FilterToolbar: (p: { onSearchChange: (v: string) => void }) => {
    onSearchChange = p.onSearchChange;
    return null;
  },
}));
vi.mock('@/components/ui/date-picker-range', () => ({ DatePickerWithRange: () => null }));

let ctx: Record<string, unknown>;
vi.mock('../context/asset-context', () => ({ useAsset: () => ctx }));

const makeCtx = (filter: string, setFilter = vi.fn()) => ({
  tableParams: { filter },
  tableHandlers: { setFilter },
  appliedFilter: undefined,
  setAppliedFilter: vi.fn(),
  dateRange: undefined,
  setDateRange: vi.fn(),
});

describe('AssetFilterBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not write stale search text back after a tree clears the URL filter', () => {
    const first = vi.fn();
    ctx = makeCtx('', first);
    const { rerender } = render(<AssetFilterBar />);
    act(() => onSearchChange('abc'));
    act(() => void vi.advanceTimersByTime(600));
    expect(first).toHaveBeenLastCalledWith('abc');

    // Applying a tree: URL filter becomes '' and setFilter gets a new identity.
    const second = vi.fn();
    ctx = makeCtx('', second);
    rerender(<AssetFilterBar />);
    act(() => void vi.advanceTimersByTime(600));
    expect(second).not.toHaveBeenCalledWith('abc');
  });
});
