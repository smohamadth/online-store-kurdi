'use client';

/**
 * Admin → Pages.
 *
 * Create and edit custom storefront pages served at /p/<slug>. Before this,
 * pages like /privacy and /terms were hardcoded .tsx files, so changing a
 * sentence meant editing source and redeploying.
 *
 * Drafts are invisible to the public (the API 404s them exactly like a missing
 * page), so an admin can write in stages and publish when ready.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authHttp, http, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';
import { ButtonSpinner, LoadingState } from '@/components/Spinner';
import RichTextEditor from '@/components/RichTextEditor';
import { slugify, slugifyWithFallback } from '@/lib/slug';

interface Page {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  status: 'draft' | 'published';
  metaTitle: string | null;
  metaDescription: string | null;
  showInFooter: boolean;
  sortOrder: number;
  updatedAt: string;
}

const BLANK = {
  slug: '',
  title: '',
  content: '',
  excerpt: '',
  // Published by default.
  //
  // This defaulted to 'draft', so the ordinary flow - New page, type a title,
  // Create - produced a page that 404s when you visit it. Nothing was broken;
  // the page simply was not live, and there was no obvious sign of that. An
  // admin who wants to work in private can untick the box, which is the rarer
  // case and now the deliberate one.
  status: 'published' as 'draft' | 'published',
  metaTitle: '',
  metaDescription: '',
  showInFooter: false,
  sortOrder: 0,
};

/** Starter templates so a new shop is not staring at an empty box. */
const TEMPLATES: { name: string; title: string; slug: string; content: string }[] = [
  {
    name: 'About us',
    title: 'About Us',
    slug: 'about-us',
    content:
      '<h2>Who we are</h2><p>Tell customers who runs the shop and why it exists.</p>' +
      '<h2>What we sell</h2><p>Describe your range and what makes it worth buying.</p>' +
      '<h2>Where to find us</h2><p>Address, opening hours, and how to get in touch.</p>',
  },
  {
    name: 'Shipping policy',
    title: 'Shipping Policy',
    slug: 'shipping-policy',
    content:
      '<h2>Delivery times</h2><p>How long orders take, by area.</p>' +
      '<h2>Delivery charges</h2><p>What shipping costs and when it is free.</p>' +
      '<h2>Tracking</h2><p>How customers follow their order.</p>',
  },
  {
    name: 'Refund policy',
    title: 'Refund Policy',
    slug: 'refund-policy',
    content:
      '<h2>Returns window</h2><p>How many days a customer has to return an item.</p>' +
      '<h2>Condition</h2><p>What state goods must be in to qualify.</p>' +
      '<h2>How to start a return</h2><p>The steps a customer should follow.</p>',
  },
  {
    name: 'Blank page',
    title: '',
    slug: '',
    content: '<p></p>',
  },
];

export default function AdminPagesPage() {
  const isMobile = useIsMobile();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editing, setEditing] = useState<Page | null>(null);
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
      const res = await authHttp.get<Page[]>('/pages/all');
      setPages(res.data || []);
      setLoadError('');
    } catch (err) {
      // Never render an empty table as "no pages" when the request failed.
      setLoadError(errorMessage(err, 'Could not load pages.'));
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
    setSlugTouched(Boolean(tpl?.slug));
    setForm({
      ...BLANK,
      title: tpl?.title || '',
      slug: tpl?.slug || '',
      content: tpl?.content || '',
    });
    setFormError('');
  };

  const startEdit = (p: Page) => {
    setEditing(p);
    setCreating(false);
    setSlugTouched(true);
    setForm({
      slug: p.slug,
      title: p.title,
      content: p.content || '',
      excerpt: p.excerpt || '',
      status: p.status,
      metaTitle: p.metaTitle || '',
      metaDescription: p.metaDescription || '',
      showInFooter: p.showInFooter,
      sortOrder: p.sortOrder,
    });
    setFormError('');
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setFormError('');
  };

  const setTitle = (title: string) => {
    // Derive the slug until the admin edits it by hand, then stop.
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    // A title in a non-Latin script used to slugify to '', which saved a page
    // the author could never reach. Guarantee a usable address.
    const finalSlug = form.slug.trim() || slugifyWithFallback(form.title, 'page');

    const body = {
      slug: finalSlug,
      title: form.title,
      content: form.content,
      excerpt: form.excerpt || null,
      status: form.status,
      metaTitle: form.metaTitle || null,
      metaDescription: form.metaDescription || null,
      showInFooter: form.showInFooter,
      sortOrder: Number(form.sortOrder) || 0,
    };

    try {
      if (editing) {
        const res = await authHttp.put<Page>(`/pages/${editing.id}`, body);
        setPages((list) => list.map((p) => (p.id === res.data.id ? res.data : p)));
        notify('success', `“${res.data.title}” saved.`);
      } else {
        const res = await authHttp.post<Page>('/pages', body);
        setPages((list) => [res.data, ...list]);
        // Say where it went. "Created." left the admin guessing whether the
        // page was live and at what address.
        notify(
          'success',
          res.data.status === 'published'
            ? `“${res.data.title}” is live at /p/${res.data.slug}`
            : `“${res.data.title}” saved as a DRAFT — it is not visible to customers yet. Press Publish when ready.`
        );
      }
      close();
    } catch (err) {
      // Keep the form open with the server's real reason - closing it would
      // imply the page was stored.
      setFormError(errorMessage(err, 'Save failed. Nothing was stored.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (p: Page) => {
    const next = p.status === 'published' ? 'draft' : 'published';
    setBusyId(p.id);
    try {
      const res = await authHttp.put<Page>(`/pages/${p.id}`, { status: next });
      setPages((list) => list.map((x) => (x.id === res.data.id ? res.data : x)));
      notify('success', `“${res.data.title}” is now ${next}.`);
    } catch (err) {
      notify('error', errorMessage(err, 'Could not change status.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (p: Page) => {
    if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
    setBusyId(p.id);
    try {
      await authHttp.delete(`/pages/${p.id}`);
      setPages((list) => list.filter((x) => x.id !== p.id));
      notify('success', 'Page deleted.');
    } catch (err) {
      notify('error', errorMessage(err, 'Could not delete the page.'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingState message="Loading pages…" minHeight={400} />;

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
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ Could not load pages</p>
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
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Pages</h2>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '2px' }}>
            {pages.length} page{pages.length === 1 ? '' : 's'} · published pages are live at{' '}
            <code>/p/&lt;slug&gt;</code>
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
          + New page
        </button>
      </div>

      {/* Templates */}
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
          Start from a template
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

      {/* List */}
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
              <th style={{ ...th, textAlign: 'center' }}>In footer</th>
              <th style={th}>Updated</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id} data-page-row={p.slug} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '14px 16px', fontWeight: 500 }}>{p.title}</td>
                <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                  {p.status === 'published' ? (
                    <a
                      href={`/p/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#3b82f6', textDecoration: 'none' }}
                    >
                      /p/{p.slug} ↗
                    </a>
                  ) : (
                    <span style={{ color: '#999' }}>/p/{p.slug}</span>
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
                  {p.showInFooter ? 'Yes' : '—'}
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

        {pages.length === 0 && !loadError && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <p style={{ fontWeight: 600, color: '#111' }}>No pages yet</p>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>
              Create an About, Shipping or Refund page — customers look for these before buying.
            </p>
          </div>
        )}
      </div>

      {/* Editor */}
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
              maxWidth: '820px',
            }}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>
              {editing ? 'Edit page' : 'New page'}
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
                <label style={label} htmlFor="pg-title">
                  Title
                </label>
                <input
                  id="pg-title"
                  style={input}
                  value={form.title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={label} htmlFor="pg-slug">
                  Address (slug)
                </label>
                <input
                  id="pg-slug"
                  style={{ ...input, fontFamily: 'monospace' }}
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm({ ...form, slug: e.target.value });
                  }}
                  required
                />
                <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                  Lives at <code>/p/{form.slug || '…'}</code>
                </p>
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={label} htmlFor="pg-excerpt">
                Short summary (optional)
              </label>
              <input
                id="pg-excerpt"
                style={input}
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                placeholder="One line shown under the heading and used for search results"
              />
            </div>

            <div style={{ marginTop: '16px' }}>
              <label style={label}>Content</label>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setForm({ ...form, content: html })}
                placeholder="Write the page content…"
                minHeight={240}
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
                <label style={label} htmlFor="pg-metatitle">
                  SEO title (optional)
                </label>
                <input
                  id="pg-metatitle"
                  style={input}
                  value={form.metaTitle}
                  onChange={(e) => setForm({ ...form, metaTitle: e.target.value })}
                  placeholder="Defaults to the page title"
                />
              </div>
              <div>
                <label style={label} htmlFor="pg-metadesc">
                  SEO description (optional)
                </label>
                <input
                  id="pg-metadesc"
                  style={input}
                  value={form.metaDescription}
                  onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                  placeholder="Defaults to the short summary"
                />
              </div>
            </div>

            {form.status === 'draft' && (
              <div
                style={{
                  marginTop: '18px',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fcd34d',
                  color: '#92400e',
                }}
              >
                <strong>This page is a draft.</strong> Visiting <code>/p/{form.slug || '…'}</code>{' '}
                will show “Page not found” until you tick Published below.
              </div>
            )}

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
                    Drafts are not reachable by customers.
                  </span>
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  aria-label="Show in footer"
                  checked={form.showInFooter}
                  onChange={(e) => setForm({ ...form, showInFooter: e.target.checked })}
                />
                Show in footer
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
                  'Create page'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
