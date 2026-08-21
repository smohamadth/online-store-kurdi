'use client';

/**
 * Error boundary for /p/<slug>.
 *
 * A published page 404ing was reported three times, and at least once the
 * cause was NOT the page at all: the page component used to collapse every
 * API failure (down, 5xx, rate-limited) into notFound(), so a healthy,
 * published page rendered "Page not found" while the real problem was the
 * backend. getPage() now THROWS on those, and this boundary catches the throw
 * and says what actually happened - an error is never a 404.
 */

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '72px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: '44px' }}>⚠️</div>
      <h1
        style={{
          fontSize: '28px',
          fontWeight: 'var(--heading-weight, 800)' as any,
          marginTop: '14px',
          letterSpacing: '-0.02em',
        }}
      >
        This page could not be loaded
      </h1>
      <p style={{ marginTop: '12px', fontSize: '16px', color: 'var(--muted, #666)', lineHeight: 1.6 }}>
        The page may exist — the store server failed to answer. This is a temporary error, not a
        missing page. Please try again.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: '22px',
          padding: '10px 22px',
          backgroundColor: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
      {error.digest && (
        <p style={{ marginTop: '18px', fontSize: '12px', color: '#999' }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
