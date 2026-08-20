'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Search box for the blog index.
 *
 * Navigates rather than fetching, so the result is a real URL the reader can
 * bookmark or share and a crawler can follow — the index itself stays a server
 * component.
 */
export default function BlogSearch({
  initialValue,
  tag,
}: {
  initialValue: string;
  tag: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (tag) qs.set('tag', tag);
    if (value.trim()) qs.set('search', value.trim());
    const s = qs.toString();
    router.push(s ? `/blog?${s}` : '/blog');
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: '10px', maxWidth: '520px' }}>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search posts…"
        aria-label="Search posts"
        style={{
          flex: 1,
          padding: '10px 14px',
          borderRadius: 'var(--btn-radius, 8px)',
          border: '1px solid var(--border, #d4d4d4)',
          backgroundColor: 'var(--card-bg, #fff)',
          color: 'var(--body-text, #111)',
          fontSize: '15px',
        }}
      />
      <button
        type="submit"
        style={{
          padding: '10px 20px',
          borderRadius: 'var(--btn-radius, 8px)',
          border: 'none',
          backgroundColor: 'var(--brand, #111)',
          color: 'var(--brand-text, #fff)',
          fontWeight: 700,
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        Search
      </button>
    </form>
  );
}
