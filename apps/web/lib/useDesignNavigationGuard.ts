'use client';

import { useEffect } from 'react';

/**
 * Protect design drafts on reload/close and ordinary same-tab link navigation,
 * including the admin sidebar's Next Links (which do not trigger beforeunload).
 * Internal editor tab/theme changes have their own, more specific guards.
 */
export function useDesignNavigationGuard(unsaved: boolean, message: string) {
  useEffect(() => {
    if (!unsaved) return;
    let approved = false;
    let approvalTimer: ReturnType<typeof setTimeout> | undefined;

    const onUnload = (event: BeforeUnloadEvent) => {
      if (approved) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const onLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download') || anchor.getAttribute('aria-disabled') === 'true') return;
      if (anchor.target && anchor.target !== '_self') return;
      const destination = new URL(anchor.href, window.location.href);
      if (!['http:', 'https:'].includes(destination.protocol)) return;
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // A native <a> should not also show the browser's unload prompt after
      // confirmation. Re-arm if an unrelated handler prevents navigation.
      approved = true;
      clearTimeout(approvalTimer);
      approvalTimer = setTimeout(() => { approved = false; }, 1000);
    };

    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onLink, true);
    return () => {
      clearTimeout(approvalTimer);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onLink, true);
    };
  }, [unsaved, message]);
}
