import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue, useIsMobile } from './hooks';

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

describe('useIsMobile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when the viewport is wider than the breakpoint', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200);
    const { result } = renderHook(() => useIsMobile(768));
    expect(result.current).toBe(false);
  });

  it('returns true when the viewport is narrower than the breakpoint', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    const { result } = renderHook(() => useIsMobile(768));
    expect(result.current).toBe(true);
  });

  it('reacts to resize events across the breakpoint boundary', () => {
    const get = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200);
    const { result } = renderHook(() => useIsMobile(900));
    expect(result.current).toBe(false);

    // Narrow the viewport below the breakpoint -> becomes mobile.
    get.mockReturnValue(600);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);

    // Widen it again -> back to desktop, with the resize listener still active.
    get.mockReturnValue(1200);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(false);
  });

  it('cleans up the resize listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200);
    const { unmount } = renderHook(() => useIsMobile(768));
    expect(removeSpy).not.toHaveBeenCalled();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
