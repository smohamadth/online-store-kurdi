'use client';

/**
 * /account/downloads — list the user's digital purchases.
 *
 * The data model:
 *   - A digital product is bought like any other product; the
 *     order create route mints a ProductDownload row (a 32-byte
 *     token, an optional expiry, an optional per-token limit,
 *     a snapshot of the sourceUrl, and a counter).
 *   - GET /api/account/downloads returns the active tokens for
 *     the current user. The page shows the download URL, the
 *     remaining count, the expiry, and a "Redeem" button that
 *     POSTs to the public /api/downloads/:token route to bump
 *     the counter and open the source URL in a new tab.
 *
 * This file is intentionally a client component: it reads
 * `localStorage` for the JWT and renders interactive controls.
 * The server-rendered shell is in `layout.tsx` and applies
 * the noindex metadata; per-page metadata is set by
 * `generateMetadata` (the layout's applies here, we don't
 * override).
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { API_BASE } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';
import { DirectionArrow } from '@/components/DirectionArrow';

interface DownloadItem {
  id: string;
  token: string;
  sourceUrl: string;
  downloadCount: number;
  downloadLimit: number | null;
  /** ISO string or null when the token never expires. */
  expiresAt: string | null;
  /** The order it was minted from. */
  order?: { id: string; orderNumber: string };
  orderItem?: {
    id: string;
    product?: { name: string; slug: string };
  };
  /** Already-expired / limit-exceeded flag (the server pre-fills
   *  this so we don't have to re-derive it on the client). */
  status: 'active' | 'expired' | 'limit_exceeded';
}

function statusBadge(status: DownloadItem['status']) {
  switch (status) {
    case 'active':
      return { label: 'Active', bg: '#ecfdf5', fg: '#047857' };
    case 'expired':
      return { label: 'Expired', bg: '#fef2f2', fg: '#b91c1c' };
    case 'limit_exceeded':
      return { label: 'Limit reached', bg: '#fef3c7', fg: '#92400e' };
    default:
      return { label: status, bg: '#f3f4f6', fg: '#374151' };
  }
}

export default function DownloadsPage() {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-row redemption errors (e.g. "this token expired since
  // you opened the page"). Kept in component state, not a toast,
  // because the user can only have one in flight at a time.
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    fetchDownloads();
  }, []);

  const fetchDownloads = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/account/downloads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data.data || []);
      }
    } catch (err) {
      console.log('Downloads API not available');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Redeem a token: the API bumps the counter and returns
   * `{ url, remaining }`. The browser then opens the URL in a
   * new tab. We refresh the list after so the counter
   * updates immediately.
   */
  const handleRedeem = async (item: DownloadItem) => {
    setRowError(null);
    try {
      const response = await fetch(`${API_BASE}/downloads/${item.token}`);
      const data = await response.json();
      if (!response.ok) {
        setRowError(data?.message || 'Download failed');
        return;
      }
      if (data?.data?.url) {
        window.open(data.data.url, '_blank', 'noopener,noreferrer');
        // Refresh so the on-screen counter reflects the
        // incremented value. The redeem endpoint already
        // incremented the count on the server.
        await fetchDownloads();
      }
    } catch (err: any) {
      setRowError(err?.message || 'Download failed');
    }
  };

  if (loading) {
    return (
      <div
        style={{ textAlign: 'center', padding: '64px', color: 'var(--muted, #666)' }}
        data-testid="downloads-loading"
      >
        Loading downloads…
      </div>
    );
  }

  // Group by order so the customer sees a single "Order #1234
  // - 2 downloads" header followed by the lines. The server
  // already returns sorted by createdAt desc; we trust that
  // ordering and just group adjacent rows.
  const groups: Array<{ order: { id: string; orderNumber: string } | null; items: DownloadItem[] }> = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    const ord = it.order || null;
    if (last && last.order?.id === ord?.id) {
      last.items.push(it);
    } else {
      groups.push({ order: ord, items: [it] });
    }
  }

  return (
    <div>
      <h1
        style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', marginBottom: '8px' }}
        data-testid="downloads-heading"
      >
        My Downloads
      </h1>
      <p
        style={{
          color: 'var(--muted, #666)',
          marginBottom: '24px',
          fontSize: '14px',
        }}
      >
        Download links for every digital product you own. Each link has its own
        expiry and download count.
      </p>

      {rowError && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        >
          {rowError}
        </div>
      )}

      {items.length === 0 ? (
        <div
          data-testid="downloads-empty"
          style={{
            textAlign: 'center',
            padding: '64px',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⬇️</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No downloads yet</h2>
          <p style={{ color: 'var(--muted, #666)', marginBottom: '24px' }}>
            Buy a digital product to see your download links here.
          </p>
          <Link
            href="/products?type=digital"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: 'var(--brand, #000)',
              color: 'var(--brand-text, #fff)',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Browse Digital Products
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} data-testid="downloads-list">
          {groups.map((g, gi) => (
            <div
              key={g.order?.id || `orphan-${gi}`}
              style={{
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: '8px',
                backgroundColor: 'var(--card-bg, white)',
                overflow: 'hidden',
              }}
            >
              {g.order && (
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#f9fafb',
                    borderBottom: '1px solid var(--border, #e5e5e5)',
                    fontSize: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>
                    Order <strong>#{g.order.orderNumber}</strong>
                  </span>
                  <Link
                    href={`/account/orders/${g.order.id}`}
                    style={{
                      color: 'var(--brand, #000)',
                      textDecoration: 'none',
                      fontSize: '13px',
                    }}
                  >
                    <DirectionArrow kind="forward" /> View order
                  </Link>
                </div>
              )}
              {g.items.map((item) => {
                const badge = statusBadge(item.status);
                const remaining =
                  item.downloadLimit == null
                    ? null
                    : Math.max(0, item.downloadLimit - item.downloadCount);
                return (
                  <div
                    key={item.id}
                    data-testid="download-row"
                    style={{
                      padding: '16px',
                      borderBottom: '1px solid var(--border, #e5e5e5)',
                      display: 'flex',
                      gap: '16px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '15px',
                          marginBottom: '4px',
                        }}
                      >
                        {item.orderItem?.product?.name || 'Digital item'}
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--muted, #666)',
                          display: 'flex',
                          gap: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '50px',
                            backgroundColor: badge.bg,
                            color: badge.fg,
                            fontWeight: 600,
                            fontSize: '12px',
                          }}
                          data-testid="download-status"
                        >
                          {badge.label}
                        </span>
                        {item.downloadLimit != null && (
                          <span data-testid="download-remaining">
                            ⬇ {remaining} of {item.downloadLimit} remaining
                          </span>
                        )}
                        {item.downloadLimit == null && (
                          <span>⬇ Unlimited</span>
                        )}
                        {item.expiresAt && (
                          <span>
                            ⏰ Expires{' '}
                            {new Date(item.expiresAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRedeem(item)}
                      disabled={item.status !== 'active'}
                      data-testid="download-button"
                      style={{
                        padding: '10px 18px',
                        backgroundColor:
                          item.status === 'active' ? 'var(--brand, #000)' : '#ccc',
                        color: 'var(--brand-text, #fff)',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: item.status === 'active' ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {item.status === 'active' ? '⬇ Download' : 'Unavailable'}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
