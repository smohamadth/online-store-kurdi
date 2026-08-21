'use client';

/**
 * Error boundary for /blog/<slug> — same rationale as app/p/[slug]/error.tsx:
 * an API failure must render an error, never "Post not found".
 */

export default function PostError({
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
        This article could not be loaded
      </h1>
      <p style={{ marginTop: '12px', fontSize: '16px', color: 'var(--muted, #666)', lineHeight: 1.6 }}>
        The store server failed to answer, so the post cannot be shown right now. It may exist —
        please try again.
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
