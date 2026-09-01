'use client';

/**
 * Admin → Pages (list view).
 *
 * The full editor lives at /admin/pages/[id]/edit (or /new),
 * which uses the shared CmsEditor shell. This file is just the
 * list + the "New page" button, both of which need to be small
 * and quick to scan.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_BASE, authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface Page {
  id: string;
  slug: string;
  pageType: 'info' | 'legal' | 'help';
  title: string;
  status: 'draft' | 'published';
  showInFooter: boolean;
  sortOrder: number;
  updatedAt: string;
}



const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: '#666',
  backgroundColor: '#f9f9f9',
  borderBottom: '1px solid #e5e5e5',
};

export default function AdminPagesPage() {
  const isMobile = useIsMobile();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const res = await authHttp.get<Page[]>('/pages/all');
      setPages(res.data || []);
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load pages.'));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await authHttp.delete(`/pages/${id}`);
      setPages((list) => list.filter((p) => p.id !== id));
      setMsg({ type: 'success', text: `"${title}" deleted.` });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err, 'Delete failed.') });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = pages.filter(
    (p) =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Pages</h2>
          <p style={{ color: '#666', fontSize: '14px', margin: '4px 0 0' }}>
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </p>
        </div>
        <Link
          href="/admin/pages/new"
          data-testid="admin-pages-new"
          style={{
            padding: '10px 18px',
            backgroundColor: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          + New page
        </Link>
      </div>

      {msg && (
        <div
          role="status"
          data-testid="admin-pages-flash"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '14px',
          }}
        >
          {msg.text}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            backgroundColor: '#fef3c7',
            color: '#92400e',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          {loadError}
        </div>
      )}

      {/* Search. Two-line design (input + result count) so a
          long list doesn't have its title pushed off the
          page on mobile. */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or slug…"
          data-testid="admin-pages-search"
          style={{
            flex: 1,
            padding: '9px 12px',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        {search && (
          <span style={{ fontSize: '12px', color: '#666' }}>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '32px' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            border: '1px dashed var(--border, #d4d4d4)',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
          }}
        >
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>
            {search ? `No pages match "${search}".` : 'No pages yet.'}
          </p>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            Pages you create here will live at <code>/info/<em>slug</em></code>,{' '}
            <code>/legal/<em>slug</em></code>, or <code>/help/<em>slug</em></code>.
          </p>
          <Link
            href="/admin/pages/new"
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              backgroundColor: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            + Create your first page
          </Link>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e5e5',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Title</th>
                {!isMobile && <th style={thStyle}>Address</th>}
                <th style={{ ...thStyle, textAlign: 'center' }}>Type</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  data-page-row={p.slug}
                  style={{ borderBottom: '1px solid #e5e5e5' }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <Link
                      href={`/admin/pages/${p.id}/edit`}
                      style={{ fontWeight: 500, color: '#000', textDecoration: 'none' }}
                    >
                      {p.title}
                    </Link>
                    {isMobile && (
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                        /{p.pageType}/{p.slug}
                      </div>
                    )}
                  </td>
                  {!isMobile && (
                    <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                      {p.status === 'published' ? (
                        <a
                          href={`/${p.pageType}/${p.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#3b82f6', textDecoration: 'none' }}
                        >
                          /{p.pageType}/{p.slug} ↗
                        </a>
                      ) : (
                        <span style={{ color: '#999' }}>/{p.pageType}/{p.slug}</span>
                      )}
                    </td>
                  )}
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <span
                      data-testid="page-type-chip"
                      style={{
                        padding: '3px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor:
                          p.pageType === 'info' ? '#dbeafe' :
                          p.pageType === 'legal' ? '#fef3c7' : '#dcfce7',
                        color:
                          p.pageType === 'info' ? '#1e40af' :
                          p.pageType === 'legal' ? '#92400e' : '#166534',
                      }}
                    >
                      {p.pageType}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: p.status === 'published' ? '#dcfce7' : '#f3f4f6',
                        color: p.status === 'published' ? '#166534' : '#6b7280',
                        textTransform: 'capitalize',
                      }}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <Link
                        href={`/admin/pages/${p.id}/edit`}
                        data-testid={`page-edit-${p.slug}`}
                        style={{
                          padding: '6px 12px',
                          background: '#f5f5f5',
                          color: '#111',
                          border: '1px solid #e5e5e5',
                          borderRadius: '4px',
                          fontSize: '12px',
                          textDecoration: 'none',
                        }}
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => remove(p.id, p.title)}
                        disabled={busyId === p.id}
                        data-testid={`page-delete-${p.slug}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#fef2f2',
                          color: '#ef4444',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: busyId === p.id ? 'default' : 'pointer',
                          opacity: busyId === p.id ? 0.6 : 1,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
