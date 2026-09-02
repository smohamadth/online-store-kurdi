import Link from 'next/link';

/**
 * /preview/<key> — 404 page.
 *
 * Shown when the requested theme key isn't in the registry.
 * The page lists the available themes so the user can pick
 * one. Plain HTML; no client-side dependencies.
 */
export default function PreviewNotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        data-testid="preview-not-found"
        style={{
          maxWidth: 480,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
          }}
        >
          Theme not found
        </h1>
        <p style={{ color: '#666', margin: 0 }}>
          The theme you tried to preview isn&apos;t installed. It may have been
          uninstalled in a platform upgrade.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 20px',
            backgroundColor: '#111',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          Back to the store
        </Link>
      </div>
    </div>
  );
}
