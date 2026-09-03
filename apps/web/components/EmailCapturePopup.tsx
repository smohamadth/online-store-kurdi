'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { captureEmail } from '@/lib/marketing';

/** localStorage key marking that this browser has finished with the popup. */
export const CAPTURE_DISMISSED_KEY = 'email_capture_done';

export interface EmailCapturePopupProps {
  /** Milliseconds before the timed fallback fires. 0 disables it. */
  delayMs?: number;
  /** Headline copy. */
  heading?: string;
  subheading?: string;
  /** Disable entirely (e.g. when the store has the popup turned off). */
  enabled?: boolean;
}

/**
 * Exit-intent email capture.
 *
 * The newsletter had no acquisition mechanism at all, so the list could only
 * grow from the footer form. This offers the shopper a reason to subscribe at
 * the moment they are about to leave.
 *
 * Shows AT MOST ONCE per browser, ever. A popup that reappears on every page
 * view is the single most effective way to make a store feel spammy, and the
 * marker is written on dismissal as well as on submit - someone who closed it
 * has answered the question.
 *
 * Two triggers:
 *   - exit intent: pointer leaves through the TOP of the viewport, which is
 *     the tab bar / address bar. Leaving via the sides or bottom is ordinary
 *     mouse movement, not an exit.
 *   - a timed fallback, because exit intent never fires on touch devices.
 */
export default function EmailCapturePopup({
  delayMs = 45_000,
  heading = 'Get 10% off your first order',
  subheading = 'Join our newsletter for early access to new arrivals and offers.',
  enabled = true,
}: EmailCapturePopupProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [trigger, setTrigger] = useState<'exit_intent' | 'timed'>('exit_intent');
  // Ref rather than state: the event handlers close over this, and a stale
  // `open` value would let the timer re-open a popup the user just dismissed.
  const settled = useRef(false);
  const pathname = usePathname();

  // Never interrupt admin work or a checkout in progress. A popup over the
  // payment step costs a real order to win a newsletter signup.
  const suppressed =
    !!pathname &&
    (pathname.startsWith('/admin') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/cart'));

  /** Record that this browser is done, so it never shows again. */
  const markDone = useCallback(() => {
    settled.current = true;
    try {
      localStorage.setItem(CAPTURE_DISMISSED_KEY, '1');
    } catch {
      // Private browsing / storage disabled. Nothing to do: the popup simply
      // may reappear next session, which is better than throwing here.
    }
  }, []);

  useEffect(() => {
    if (!enabled || suppressed) return;

    try {
      if (localStorage.getItem(CAPTURE_DISMISSED_KEY)) {
        settled.current = true;
        return;
      }
    } catch {
      // Unreadable storage is not a reason to suppress the popup.
    }

    const show = (why: 'exit_intent' | 'timed') => {
      if (settled.current) return;
      settled.current = true;
      setTrigger(why);
      setOpen(true);
    };

    const onMouseOut = (e: MouseEvent) => {
      // relatedTarget null means the pointer left the document entirely.
      // clientY <= 0 restricts that to the top edge.
      if (e.relatedTarget === null && e.clientY <= 0) show('exit_intent');
    };

    document.addEventListener('mouseout', onMouseOut);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (delayMs > 0) timer = setTimeout(() => show('timed'), delayMs);

    return () => {
      document.removeEventListener('mouseout', onMouseOut);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, delayMs, suppressed]);

  const close = useCallback(() => {
    markDone();
    setOpen(false);
  }, [markDone]);

  // Escape closes, as any modal should.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;

    const value = email.trim();
    // Validate before spending a request. The API validates too; this is for
    // the shopper's benefit, not the server's.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error');
      return;
    }

    setStatus('sending');
    const ok = await captureEmail(value, trigger);
    if (ok) {
      setStatus('done');
      markDone();
      // Leave the confirmation on screen briefly rather than yanking it away.
      setTimeout(() => setOpen(false), 2500);
    } else {
      setStatus('error');
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-capture-heading"
      data-testid="email-capture-popup"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-card, #fff)',
          color: 'var(--color-text, #111)',
          borderRadius: 'var(--radius-card, 8px)',
          maxWidth: 420,
          width: '100%',
          padding: 28,
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          data-testid="email-capture-close"
          style={{
            position: 'absolute',
            top: 8,
            insetInlineEnd: 8,
            background: 'none',
            border: 'none',
            fontSize: 22,
            lineHeight: 1,
            cursor: 'pointer',
            color: 'inherit',
          }}
        >
          &times;
        </button>

        {status === 'done' ? (
          <p data-testid="email-capture-success" style={{ margin: 0, textAlign: 'center' }}>
            Thanks! Check your inbox.
          </p>
        ) : (
          <>
            <h2 id="email-capture-heading" style={{ marginTop: 0, fontSize: 20 }}>
              {heading}
            </h2>
            <p style={{ marginTop: 8, opacity: 0.8 }}>{subheading}</p>

            <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
              <label htmlFor="email-capture-input" style={{ display: 'block', marginBottom: 6 }}>
                Email address
              </label>
              <input
                id="email-capture-input"
                data-testid="email-capture-input"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-input, 6px)',
                  border: '1px solid var(--color-border, #ddd)',
                  background: 'var(--color-bg, #fff)',
                  color: 'inherit',
                }}
              />

              {status === 'error' && (
                <p
                  role="alert"
                  data-testid="email-capture-error"
                  style={{ color: 'var(--color-danger, #c00)', marginTop: 8, fontSize: 14 }}
                >
                  Please enter a valid email address.
                </p>
              )}

              <button
                type="submit"
                data-testid="email-capture-submit"
                disabled={status === 'sending'}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-button, 6px)',
                  border: 'none',
                  background: 'var(--color-primary, #111)',
                  color: 'var(--color-on-primary, #fff)',
                  cursor: status === 'sending' ? 'default' : 'pointer',
                  opacity: status === 'sending' ? 0.7 : 1,
                }}
              >
                {status === 'sending' ? 'Signing up…' : 'Sign up'}
              </button>
            </form>

            <p style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
              You can unsubscribe at any time.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
