import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './hooks';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('shirt', 300));
    expect(result.current).toBe('shirt');
  });

  it('only updates after the delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'shirt' },
    });
    expect(result.current).toBe('shirt');

    // Fast successive updates within the delay window must not surface yet.
    rerender({ v: 'shir' });
    rerender({ v: 'shi' });
    expect(result.current).toBe('shirt');

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('shirt');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('shi');
  });

  it('debounces to the last value after a pause (coalesces burst input)', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 350), {
      initialProps: { v: '' },
    });
    rerender({ v: 's' });
    rerender({ v: 'sh' });
    rerender({ v: 'sho' });
    rerender({ v: 'sho' });

    act(() => {
      vi.advanceTimersByTime(350);
    });
    // The burst collapses to a single settled value.
    expect(result.current).toBe('sho');
  });

  it('cancels the pending timer on unmount (no setState after teardown)', () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    unmount(); // must not throw / leak a timer
    expect(result.current).toBe('a');
  });
});
