// Small shared UI hooks (viewport size). Each starts desktop-default and
// re-checks on mount + resize, so server-rendered markup (desktop) and the
// first client check agree - no layout flash from an initial `false`->
//`true` mismatch on phones.
'use client';

import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint: number = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}

export function useIsTablet(breakpoint: number = 1024) {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isTablet;
}

/**
 * Debounce a fast-changing value (e.g. a search box) so expensive downstream
 * effects (URL push, network refetch) only run once the input has settled.
 *
 * Returns the current value until `value` stops changing for `delay` ms, then
 * returns the latest. The pending timer is cancelled on unmount.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
