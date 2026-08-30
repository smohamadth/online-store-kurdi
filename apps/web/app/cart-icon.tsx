// The header cart badge: renders the useCart() item count (hidden
// at 0). Client-only - the count is per-browser cart state.
'use client';

import { useCart } from '@/lib/store';

export default function CartIcon() {
  const { getItemCount } = useCart();
  const count = getItemCount();

  return (
    <a href="/cart" style={{
      position: 'relative',
      textDecoration: 'none',
      color: '#000',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
      {count > 0 && (
        <span style={{
          position: 'absolute',
          right: '-8px',
          top: '-8px',
          height: '20px',
          width: '20px',
          borderRadius: '50%',
          backgroundColor: '#000',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {count}
        </span>
      )}
    </a>
  );
}