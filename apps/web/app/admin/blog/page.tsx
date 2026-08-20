'use client';

/**
 * Admin → Blog.
 *
 * Write, edit and publish posts shown at /blog. Mirrors Admin → Pages
 * deliberately: same modal shape, same draft/publish model, same "the server's
 * error stays on screen" behaviour, so an admin who has used one already knows
 * how to use the other.
 */

import { useEffect, useState } from 'react';
import { authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';
import { ButtonSpinner, LoadingState } from '@/components/Spinner';
import RichTextEditor from '@/components/RichTextEditor';
import ImageUpload from '@/components/ImageUpload';
import { slugify } from '@/lib/slug';

interface Post {
  id: string;
  slug: string;
  title: string;
  content?: string;
  excerpt: string | null;
  coverImage: string | null;
  author: string | null;
  tags: string[];
  status: 'draft' | 'published';
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  viewCount: number;
  readingMinutes: number;
  updatedAt: string;
  publishedAt: string | null;
}

const BLANK = {
  slug: '',
  title: '',
  content: '',
  excerpt: '',
  coverImage: '',
  author: '',
  tags: '',
  // Published by default - see the note in admin/pages. A new post that
  // silently 404s is the same trap.
  status: 'published' as 'draft' | 'published',
  isFeatured: false,
  metaTitle: '',
  metaDescription: '',
};

/** Starter outlines — a blank editor is the main reason shops never post. */
const TEMPLATES: { name: string; title: string; tags: string; content: string }[] = [
  {
    name: 'Product guide',
    title: 'How to choose the right ',
    tags: 'guides',
    content:
      '<h2>What to look for</h2><p>The two or three things that actually matter.</p>' +
      '<h2>Common mistakes</h2><p>What buyers usually get wrong.</p>' +
      '<h2>Our recommendation</h2><p>Point at a product you stock and say why.</p>',
  },
  {
    name: 'Shop news',
    title: 'What’s new at the shop',
    tags: 'news',
    content:
      '<h2>What changed</h2><p>New stock, new hours, a new service.</p>' +
      '<h2>Why it matters to you</h2><p>Say what the customer gets out of it.</p>',
  },
  {
    name: 'Customer story',
    title: 'How a customer used ',
    tags: 'stories',
    content:
      '<h2>The problem</h2><p>What they needed.</p>' +
      '<h2>What they chose</h2><p>Which product, and why.</p>' +
      '<h2>The result</h2><p>How it worked out.</p>',
  },
  { name: 'Blank post', title: '', tags: '', content: '<p></p>' },
];

export default function AdminBlogPage() {
  const isMobile = useIsMobile();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editing, setEditing] = useState<Post | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = creating || editing !== null;

  const notify = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    if (type === 'success') setTimeout(() => setMsg(null), 4000);
  };

  const load = async () => {
    try {
      const res = await authHttp.get<Post[]>('/blog/all');
      setPosts(res.data || []);
      setLoadError('');
    } catch (err) {
      // Never show an empty table as "no posts" when the request failed.
      setLoadError(errorMessage(err, 'Could not load posts.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startCreate = (tpl?: (typeof TEMPLATES)[number]) => {
    setCreating(true);
    setEditing(null);
    setSlugTouched(false);
    setForm({
      ...BLANK,
      title: tpl?.title || '',
      slug: tpl?.title ? slugify(tpl.title) : '',
      tags: tpl?.tags || '',
      content: tpl?.content || '',
    });
    setFormError('');
  };

  const startEdit = async (p: Post) => {
    setEditing(p);
    setCreating(false);
    setSlugTouched(true);
    setFormError('');
    // The list omits post bodies (they can be tens of KB), so fetch the full
    // record before opening the editor.
    try {
      const res = await authHttp.get<Post>(`/blog/${p.id}`);
      const full = res.data;
      setForm({
        slug: full.slug,
        title: full.title,
        content: full.content || '',
        excerpt: full.excerpt || '',
        coverImage: full.coverImage || '',
        author: full.author || '',
        tags: (full.tags || []).join(', '),
        status: full.status,
        isFeatured: full.isFeatured,
        metaTitle: full.metaTitle || '',
        metaDescription: full.metaDescription || '',
      });
    } catch (err) {
      setFormError(errorMessage(err, 'Could not load this post.'));
    }
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setFormError('');
  };

  const setTitle = (title: string) => {
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const body = {
      slug: form.slug,
      title: form.title,
      content: form.content,
      excerpt: form.excerpt || null,
      coverImage: form.coverImage || null,
      author: form.author || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      status: form.status,
      isFeatured: form.isFeatured,
      metaTitle: form.metaTitle || null,
      metaDescription: form.metaDescription || null,
    };

    try {
      if (editing) {
        const res = await authHttp.put<Post>(`/blog/${editing.id}`, body);
        setPosts((list) => list.map((p) => (p.id === res.data.id ? res.data : p)));
        notify('success', `“${res.data.title}” saved.`);
      } else {
        const res = await authHttp.post<Post>('/blog', body);
        setPosts((list) => [res.data, ...list]);
        notify(
          'success',
          res.data.status === 'published'
            ? `“${res.data.title}” is live at /blog/${res.data.slug}`
            : `“${res.data.title}” saved as a DRAFT — not visible to readers yet.`
        );
      }
      close();
    } catch (err) {
      // Keep the form open with the real reason — closing it would imply the
      // post was stored.
      setFormError(errorMessage(err, 'Save failed. Nothing was stored.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (p: Post) => {
    const next = p.status === 'published' ? 'draft' : 'published';
    setBusyId(p.id);
    try {
      const res = await authHttp.put<Post>(`/blog/${p.id}`, { status: next });
      setPosts((list) => list.map((x) => (x.id === res.data.id ? res.data : x)));
      notify('success', `“${res.data.title}” is now ${next}.`);
    } catch (err) {
      notify('error', errorMessage(err, 'Could not change status.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (p: Post) => {
    if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
    setBusyId(p.id);
    try {
      await authHttp.delete(`/blog/${p.id}`);
      setPosts((list) => list.filter((x) => x.id !== p.id));
      notify('success', 'Post deleted.');
    } catch (err) {
      notify('error', errorMessage(err, 'Could not delete the post.'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingState message="Loading posts…" minHeight={400} />;

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
  };
  const input: React.CSSProperties = {
    width: '100%',
    padding: '9px 11px',
    border: '1px solid #d4d4d4',
    borderRadius: '6px',
    fontSize: '14px',
  };
  const th: React.CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: '#666',
  };

  return (
    <div>
      {loadError && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            marginBottom: '24px',
          }}
        >
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ Could not load posts</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>{loadError}</p>
        </div>
      )}

      {msg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            backgroundColor: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Blog</h2>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '2px' }}>
            {posts.length} post{posts.length === 1 ? '' : 's'} · published posts are live at{' '}
            <code>/blog</code>
          </p>
        </div>
        <button
          onClick={() => startCreate()}
          style={{
            padding: '10px 18px',
            backgroundColor: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + New post
        </button>
      </div>

      <div
        style={{
          border: '1px solid #e5e5e5',
          borderRadius: '10px',
          padding: '16px 20px',
          backgroundColor: '#fff',
          marginBottom: '20px',
        }}
      >
        <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
          Start from an outline
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => startCreate(t)}
              style={{
                padding: '8px 14px',
                border: '1px dashed #bbb',
                borderRadius: '999px',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

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
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={th}>Title</th>
              <th style={th}>Address</th>
              <th style={{ ...th, textAlign: 'center' }}>Status</th>
              <th style={{ ...th, textAlign: 'center' }}>Views</th>
              <th style={th}>Updated</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id} data-post-row={p.slug} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ fontWeight: 500 }}>{p.title}</span>
                  {p.isFeatured && (
                    <span
                      style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#b45309',
                      }}
                    >
                      ★ Featured
                    </span>
                  )}
                </td>
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
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px' }}>
                  {p.viewCount}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: '#666' }}>
                  {new Date(p.updatedAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    onClick={() => startEdit(p)}
                    style={{
                      padding: '7px 14px',
                      border: '1px solid #d4d4d4',
                      borderRadius: '6px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      marginRight: '8px',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => togglePublish(p)}
                    disabled={busyId === p.id}
                    style={{
                      padding: '7px 14px',
                      border: '1px solid #d4d4d4',
                      borderRadius: '6px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      marginRight: '8px',
                    }}
                  >
                    {p.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    onClick={() => remove(p)}
                    disabled={busyId === p.id}
                    style={{
                      padding: '7px 14px',
                      border: '1px solid #fca5a5',
                      color: '#b91c1c',
                      borderRadius: '6px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {posts.length === 0 && !loadError && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <p style={{ fontWeight: 600, color: '#111' }}>No posts yet</p>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>
              A blog earns search traffic slowly. Two posts a month beats ten and then silence.
            </p>
          </div>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '24px',
            overflowY: 'auto',
            zIndex: 1000,
          }}
          onClick={() => !saving && close()}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '860px',
            }}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>
              {editing ? 'Edit post' : 'New post'}
            </h2>

            {formError && (
              <div
                style={{
                  padding: '11px 14px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                }}
              >
                {formError}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '14px',
              }}
            >
              <div>
                <label style={label} htmlFor="bp-title">
                  Title
                </label>
                <input
                  id="bp-title"
                  style={input}
                  value={form.title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={label} htmlFor="bp-slug">
                  Address (slug)
                </label>
                <input
                  id="bp-slug"
                  style={{ ...input, fontFamily: 'monospace' }}
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm({ ...form, slug: e.target.value });
                  }}
                  required
                />
                <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                  Lives at <code>/blog/{form.slug || '…'}</code>
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '14px',
                marginTop: '14px',
              }}
            >
              <div>
                <label style={label} htmlFor="bp-author">
                  Author
                </label>
                <input
                  id="bp-author"
                  style={input}
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  placeholder="Shop name or staff member"
                />
              </div>
              <div>
                <label style={label} htmlFor="bp-tags">
                  Tags
                </label>
                <input
                  id="bp-tags"
                  style={input}
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="guides, shipping"
                />
                <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                  Comma separated. Readers can filter by tag.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={label} htmlFor="bp-excerpt">
                Summary
              </label>
              <input
                id="bp-excerpt"
                style={input}
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                placeholder="One or two lines shown in the list and in search results"
              />
            </div>

            <div style={{ marginTop: '16px' }}>
              <ImageUpload
                label="Cover image"
                folder="blog"
                currentImage={form.coverImage || undefined}
                onUpload={(url) => setForm({ ...form, coverImage: url })}
              />
            </div>

            <div style={{ marginTop: '16px' }}>
              <label style={label}>Content</label>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setForm({ ...form, content: html })}
                placeholder="Write the post…"
                minHeight={280}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '14px',
                marginTop: '16px',
              }}
            >
              <div>
                <label style={label} htmlFor="bp-metatitle">
                  SEO title (optional)
                </label>
                <input
                  id="bp-metatitle"
                  style={input}
                  value={form.metaTitle}
                  onChange={(e) => setForm({ ...form, metaTitle: e.target.value })}
                  placeholder="Defaults to the post title"
                />
              </div>
              <div>
                <label style={label} htmlFor="bp-metadesc">
                  SEO description (optional)
                </label>
                <input
                  id="bp-metadesc"
                  style={input}
                  value={form.metaDescription}
                  onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                  placeholder="Defaults to the summary"
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '20px',
                marginTop: '18px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  aria-label="Published"
                  checked={form.status === 'published'}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.checked ? 'published' : 'draft' })
                  }
                />
                <span>
                  <strong>Published</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: '#888' }}>
                    Drafts are not reachable by readers.
                  </span>
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  aria-label="Featured"
                  checked={form.isFeatured}
                  onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                />
                Pin to the top of the blog
              </label>
            </div>

            <div
              style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}
            >
              <button
                type="button"
                onClick={close}
                disabled={saving}
                style={{
                  padding: '10px 18px',
                  border: '1px solid #d4d4d4',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'default' : 'pointer',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {saving ? (
                  <>
                    <ButtonSpinner /> Saving…
                  </>
                ) : editing ? (
                  'Save changes'
                ) : (
                  'Create post'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
