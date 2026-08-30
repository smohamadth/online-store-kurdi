'use client';

/**
 * Floating compare bar - appears along the bottom edge whenever the
 * customer has selected at least one product to compare. The Compare
 * action activates at two or more (a one-product "comparison" is just
 * the product page). Hidden on the /compare page itself and on /admin.
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCompare, MAX_COMPARE_ITEMS } from '@/lib/compare';
import StoreImage from './StoreImage';

export default function CompareBar() {
  const { items, remove, clear } = useCompare();
  const pathname = usePathname() ?? '/';

  if (items.length === 0) return null;
  if (pathname.startsWith('/compare') || pathname.startsWith('/admin')) return null;

  const canCompare = items.length >= 2;

  return (
    <div
      role="region"
      aria-label="Compare bar"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        backgroundColor: 'var(--header-bg, #111111)',
        color: 'var(--header-text, #ffffff)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.18)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--container, 1200px)',
          margin: '0 auto',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Compare ({items.length}/{MAX_COMPARE_ITEMS})
        </span>

        <div style={{ display: 'flex', gap: '8px', flex: 1, overflowX: 'auto' }}>
          {items.map((item) => (
            <span
              key={item.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 6px 4px 4px',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '999px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              {item.image ? (
                <StoreImage
                  src={item.image}
                  alt=""
                  width={22}
                  height={22}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }} />
              )}
              <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.name}
              </span>
              <button
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.name} from comparison`}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '13px',
                  lineHeight: 1,
                  padding: '0 2px',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <button
          onClick={clear}
          style={{
            border: '1px solid rgba(255,255,255,0.35)',
            background: 'none',
            color: 'inherit',
            borderRadius: '999px',
            padding: '6px 12px',
            fontSize: '13px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Clear
        </button>

        <Link
          href="/compare"
          aria-disabled={!canCompare}
          style={{
            display: 'inline-block',
            padding: '8px 18px',
            borderRadius: '999px',
            backgroundColor: canCompare ? 'var(--accent, #2563eb)' : 'rgba(255,255,255,0.15)',
            color: canCompare ? '#ffffff' : 'rgba(255,255,255,0.55)',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {canCompare ? 'Compare' : 'Pick 2+ to compare'}
        </Link>
      </div>
    </div>
  );
}
