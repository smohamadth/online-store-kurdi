'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PAGE_TEMPLATES } from '../_templates';
import { slugify } from '@/lib/slug';
import { authHttp, errorMessage } from '@/lib/http';

/**
 * Admin → Pages → New.
 *
 * The "new" flow is just a template picker. Once the admin picks
 * one (or starts blank), we POST a draft page to the API and
 * redirect to the editor at /admin/pages/<id>/edit. The
 * editor itself is the shared CmsEditor shell.
 *
 * Why not skip the POST and start the editor with a virtual
 * "new" id? The editor needs an id so its autosave namespace
 * stays stable, and the API needs a real row before it will
 * accept updates. A two-step flow keeps both happy.
 */
export default function NewPagePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const start = async (template: (typeof PAGE_TEMPLATES)[number]) => {
    setCreating(true);
    setErr('');
    try {
      const body: Record<string, unknown> = {
        title: template.title,
        slug: template.slug,
        content: template.content,
        pageType: template.pageType,
        // New pages start as drafts. The admin publishes from
        // the editor; a "save creates a live page" flow used
        // to make it impossible to write a long page in stages
        // without it appearing in production halfway through.
        status: 'draft',
      };
      const res = await authHttp.post<{ id: string }>('/pages', body);
      router.push(`/admin/pages/${res.data.id}/edit`);
    } catch (e) {
      setErr(errorMessage(e, 'Could not create the page.'));
      setCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 20px 60px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }}>New page</h1>
      <p style={{ color: '#666', fontSize: '14px', margin: '0 0 24px' }}>
        Start from a template or with a blank page. You can change the title,
        slug and type freely in the editor.
      </p>

      {err && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          {err}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
        }}
      >
        {PAGE_TEMPLATES.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => start(t)}
            disabled={creating}
            data-testid={`new-page-template-${t.slug || 'blank'}`}
            style={{
              padding: '16px 18px',
              border: '1px solid var(--border, #d4d4d4)',
              borderRadius: '8px',
              background: 'var(--card-bg, #fff)',
              textAlign: 'left',
              cursor: creating ? 'default' : 'pointer',
              fontSize: '14px',
              opacity: creating ? 0.6 : 1,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
              {t.name}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              /{t.pageType || 'info'}/{t.slug || '(new)'}
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            start({
              name: 'Blank',
              // The create endpoint requires a title and a valid slug, so
              // start from a placeholder the admin renames in the editor.
              // (An empty title/slug 400s on write, which made this button
              // look broken.)
              title: 'Untitled page',
              slug: `untitled-${Date.now().toString(36)}`,
              pageType: 'info',
              content: '<p></p>',
            })
          }
          disabled={creating}
          data-testid="new-page-template-blank"
          style={{
            padding: '16px 18px',
            border: '1px dashed #bbb',
            borderRadius: '8px',
            background: 'var(--card-bg, #fff)',
            textAlign: 'left',
            cursor: creating ? 'default' : 'pointer',
            fontSize: '14px',
            opacity: creating ? 0.6 : 1,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Blank page</div>
          <div style={{ fontSize: '12px', color: '#666' }}>Start from scratch</div>
        </button>
      </div>
    </div>
  );
}
