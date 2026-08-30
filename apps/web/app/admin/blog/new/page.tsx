'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authHttp, errorMessage } from '@/lib/http';
import { slugifyWithFallback } from '@/lib/slug';

/**
 * Admin → Blog → New.
 *
 * Same two-step flow as pages: pick a starting point, then
 * land in the editor. We always create a draft on POST so
 * the admin can write in stages without a half-finished post
 * showing up in /blog.
 */
export default function NewPostPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const start = async (preset: { title: string; content: string }) => {
    setCreating(true);
    setErr('');
    try {
      // The create endpoint requires a title (min 1) and a valid slug.
      // A bare title-derived slug ("new-post") would 409 the second time
      // an admin picks this preset, so every draft gets a unique starting
      // address the admin can rename freely in the editor.
      const slug = `${slugifyWithFallback(preset.title, 'post')}-${Date.now().toString(36)}`;
      const res = await authHttp.post<{ id: string }>('/blog', {
        title: preset.title || 'Untitled post',
        slug,
        content: preset.content,
        status: 'draft',
      });
      router.push(`/admin/blog/${res.data.id}/edit`);
    } catch (e) {
      setErr(errorMessage(e, 'Could not create the post.'));
      setCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 20px 60px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }}>New post</h1>
      <p style={{ color: '#666', fontSize: '14px', margin: '0 0 24px' }}>
        Start with a quick prompt or a blank draft. You can change the title
        and slug freely in the editor.
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
        <button
          type="button"
          onClick={() =>
            start({
              title: '',
              content: '<p></p>',
            })
          }
          disabled={creating}
          data-testid="new-post-blank"
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
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Blank draft</div>
          <div style={{ fontSize: '12px', color: '#666' }}>Start from scratch</div>
        </button>
        <button
          type="button"
          onClick={() =>
            start({
              title: 'New post',
              content:
                '<h2>Hook</h2><p>Open with the one thing the reader needs.</p>' +
                '<h2>What changed</h2><p>The detail they came for.</p>' +
                '<h2>What to do next</h2><p>A clear next step.</p>',
            })
          }
          disabled={creating}
          data-testid="new-post-skeleton"
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
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Hook + detail + CTA</div>
          <div style={{ fontSize: '12px', color: '#666' }}>A reusable skeleton</div>
        </button>
      </div>
    </div>
  );
}
