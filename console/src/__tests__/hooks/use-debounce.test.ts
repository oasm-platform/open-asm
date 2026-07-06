import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useDebounce from '@/hooks/use-debounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 500 } },
    );

    rerender({ value: 'world', delay: 500 });
    expect(result.current).toBe('hello');

    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('world');
  });

  it('cancels pending update on unmount', () => {
    const { unmount } = renderHook(() => useDebounce('hello', 500));
    unmount();
  });

  it('only applies the last value when rapid changes occur', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } },
    );

    rerender({ value: 'b', delay: 300 });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 'c', delay: 300 });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 'd', delay: 300 });

    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('d');
  });

  it('respects different delay values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 1000 } },
    );

    rerender({ value: 'updated', delay: 1000 });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('initial');

    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('updated');
  });

  it('works with non-string values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: { id: 1 }, delay: 200 } },
    );

    const newObj = { id: 2 };
    rerender({ value: newObj, delay: 200 });
    expect(result.current).toEqual({ id: 1 });

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toEqual({ id: 2 });
  });
});
