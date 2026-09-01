'use client';

import { useEffect } from 'react';
import { trackAffiliateClick } from '@/lib/affiliates';

/**
 * Affiliate referral capture.
 *
 * When a visitor lands on a `?ref=CODE` link, this component (mounted once
 * in AppShell, so every page carries it) asks the API to validate the code,
 * record a click and set the 30-day `aff_ref` attribution cookie. It fires
 * ONCE per code per browser (localStorage marker) — the cookie refresh is
 * pointless afterwards, and the click counter stays honest.
 *
 * Deliberately avoids useSearchParams (no Suspense boundary needed): the
 * query string is read straight from window.location in an effect, after
 * hydration, so this never blocks or re-renders the page.
 */
export default function AffiliateRefCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (!ref) return;
      const marker = `aff_tracked_${ref}`;
      if (localStorage.getItem(marker)) return;
      // Fire-and-forget; never breaks the page load.
      trackAffiliateClick(ref).then((res) => {
        if (res.valid) {
          try {
            localStorage.setItem(marker, '1');
          } catch {}
        }
      });
    } catch {}
  }, []);

  return null;
}
