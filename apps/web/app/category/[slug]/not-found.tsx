import Link from 'next/link';

export default function CategoryNotFound() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '96px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: '52px' }}>🔍</div>
      <h1 style={{ fontSize: '28px', fontWeight: 800, marginTop: '16px' }}>Category not found</h1>
      <p style={{ color: 'var(--muted, #666)', marginTop: '10px', lineHeight: 1.6 }}>
        We couldn&apos;t find that category. It may have been renamed or removed.
      </p>
      <div style={{ marginTop: '28px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/products" style={{ padding: '12px 24px', backgroundColor: 'var(--brand, #111)', color: 'var(--brand-text, #fff)', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 }}>
          Browse all products
        </Link>
        <Link href="/" style={{ padding: '12px 24px', border: '1px solid #e0e0e0', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, color: '#111' }}>
          Go home
        </Link>
      </div>
    </div>
  );
}
