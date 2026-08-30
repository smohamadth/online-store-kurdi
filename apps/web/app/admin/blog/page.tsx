// /admin/blog - the post list (drafts + published, with the featured
// flag) and the create/edit navigation. Editing itself happens in
// /admin/blog/[id]/edit on the shared CmsEditor shell; this page is
// the index + delete + publish-state column.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface Post {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  isFeatured: boolean;
  author: string | null;
  publishedAt: string | null;
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

export default function AdminBlogPage() {
  const isMobile = useIsMobile();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const res = await authHttp.get<Post[]>('/blog/all');
      setPosts(res.data || []);
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load posts.'));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await authHttp.delete(`/blog/${id}`);
      setPosts((list) => list.filter((p) => p.id !== id));
      setMsg({ type: 'success', text: `"${title}" deleted.` });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err, 'Delete failed.') });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = posts.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!p.title.toLowerCase().includes(s) && !p.slug.toLowerCase().includes(s)) return false;
    }
    return true;
  });

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
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Blog</h2>
          <p style={{ color: '#666', fontSize: '14px', margin: '4px 0 0' }}>
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          data-testid="admin-blog-new"
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
          + New post
        </Link>
      </div>

      {msg && (
        <div
          role="status"
          data-testid="admin-blog-flash"
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

      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or slug…"
          data-testid="admin-blog-search"
          style={{
            flex: 1,
            minWidth: '180px',
            padding: '9px 12px',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        {(['all', 'published', 'draft'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            data-testid={`admin-blog-filter-${s}`}
            style={{
              padding: '7px 14px',
              background: statusFilter === s ? '#111' : '#fff',
              color: statusFilter === s ? '#fff' : '#111',
              border: '1px solid var(--border, #d4d4d4)',
              borderRadius: '999px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
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
          <p style={{ fontSize: '16px', marginBottom: '16px' }}>
            {search || statusFilter !== 'all' ? 'No posts match.' : 'No posts yet.'}
          </p>
          <Link
            href="/admin/blog/new"
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
            + Write your first post
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
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                {!isMobile && <th style={{ ...thStyle, textAlign: 'center' }}>Featured</th>}
                <th style={thStyle}>Updated</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  data-post-row={p.slug}
                  style={{ borderBottom: '1px solid #e5e5e5' }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <Link
                      href={`/admin/blog/${p.id}/edit`}
                      style={{ fontWeight: 500, color: '#000', textDecoration: 'none' }}
                    >
                      {p.title}
                    </Link>
                    {p.author && (
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                        by {p.author}
                      </div>
                    )}
                  </td>
                  {!isMobile && (
                    <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                      {p.status === 'published' ? (
                        <a
                          href={`/blog/${p.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#3b82f6', textDecoration: 'none' }}
                        >
                          /blog/{p.slug} ↗
                        </a>
                      ) : (
                        <span style={{ color: '#999' }}>/blog/{p.slug}</span>
                      )}
                    </td>
                  )}
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
                  {!isMobile && (
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {p.isFeatured ? (
                        <span style={{ color: '#f59e0b' }}>★</span>
                      ) : (
                        <span style={{ color: '#ddd' }}>—</span>
                      )}
                    </td>
                  )}
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#666' }}>
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <Link
                        href={`/admin/blog/${p.id}/edit`}
                        data-testid={`post-edit-${p.slug}`}
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
                        data-testid={`post-delete-${p.slug}`}
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
