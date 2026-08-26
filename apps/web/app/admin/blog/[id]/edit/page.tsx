'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { authHttp, errorMessage } from '@/lib/http';
import {
  CmsEditor,
  type CmsEditorBaseFields,
  type CmsEditorExtras,
} from '../../../_components/CmsEditor';

interface PostRow extends CmsEditorBaseFields, CmsEditorExtras {
  id: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Tags come from the API as a string array, but the editor
   *  works with a comma-separated string. We split on read and
   *  join on save, so the form sees a single text field. */
  tagsList?: string[];
}

const BLANK: CmsEditorBaseFields & CmsEditorExtras = {
  title: '',
  slug: '',
  content: '<p></p>',
  excerpt: '',
  status: 'draft',
  tags: '',
  coverImage: '',
  author: '',
  isFeatured: false,
  metaTitle: '',
  metaDescription: '',
};

export default function EditPostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [initial, setInitial] = useState<(CmsEditorBaseFields & CmsEditorExtras) | null>(null);
  const [values, setValues] = useState<CmsEditorBaseFields & CmsEditorExtras>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');

  const draftKey = id ? `cms.posts.${id}` : null;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const res = await authHttp.get<PostRow>(`/blog/${id}`);
        if (!alive) return;
        const row = res.data;
        const next: CmsEditorBaseFields & CmsEditorExtras = {
          title: row.title || '',
          slug: row.slug || '',
          content: row.content || '',
          excerpt: row.excerpt || '',
          status: row.status,
          tags: (row.tagsList || []).join(', '),
          coverImage: row.coverImage || '',
          author: row.author || '',
          isFeatured: !!row.isFeatured,
          metaTitle: row.metaTitle || '',
          metaDescription: row.metaDescription || '',
        };
        setInitial(next);
        if (draftKey) {
          try {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              const ts = Number(parsed?.savedAt) || 0;
              const srvTs = new Date(row.updatedAt).getTime();
              setValues(ts > srvTs ? parsed.values : next);
            } else {
              setValues(next);
            }
          } catch {
            setValues(next);
          }
        } else {
          setValues(next);
        }
      } catch (err) {
        if (alive) setLoadError(errorMessage(err, 'Could not load this post.'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [draftKey, id]);

  if (loadError) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px' }}>
        <p style={{ color: '#b91c1c', marginBottom: '16px' }}>{loadError}</p>
        <Link
          href="/admin/blog"
          style={{ color: '#3b82f6', textDecoration: 'underline', fontSize: '14px' }}
        >
          <DirectionArrow kind="back" /> Back to blog
        </Link>
      </div>
    );
  }

  if (!initial) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
        Loading…
      </div>
    );
  }

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      // Tags: split, lowercase, trim, dedupe. The API also
      // normalises but doing it here keeps the autosave
      // payload stable (no harmless diff churn).
      const tagsList = (values.tags ?? '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const deduped = Array.from(new Set(tagsList));

      const body = {
        title: values.title,
        slug: values.slug,
        content: values.content,
        excerpt: values.excerpt || null,
        coverImage: values.coverImage || null,
        author: values.author || null,
        tags: deduped,
        status: values.status,
        isFeatured: !!values.isFeatured,
        metaTitle: values.metaTitle || null,
        metaDescription: values.metaDescription || null,
      };
      await authHttp.put<PostRow>(`/blog/${id}`, body);
      setInitial({ ...values });
    } catch (err) {
      setFormError(errorMessage(err, 'Save failed. Nothing was stored.'));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return (
    <CmsEditor
      kind="post"
      resourceId={id ?? null}
      backHref="/admin/blog"
      publicHref={
        values.status === 'published' ? `/blog/${values.slug}` : undefined
      }
      headerTitle={values.title || 'Untitled post'}
      initial={initial}
      values={values}
      onChange={setValues}
      onSave={save}
      isDirty={isDirty}
      saving={saving}
      formError={formError}
      formatLivePath={(v) => `/blog/${v.slug || '…'}`}
      renderPreview={(v) => (
        <article style={{ maxWidth: '720px', margin: '0 auto' }}>
          {v.coverImage && (
            <img
              src={v.coverImage}
              alt=""
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '8px',
                marginBottom: '20px',
              }}
            />
          )}
          <h1
            style={{
              fontSize: '34px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 12px',
              lineHeight: 1.15,
            }}
          >
            {v.title || 'Untitled post'}
          </h1>
          {v.author && (
            <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px' }}>
              by {v.author}
            </p>
          )}
          {v.excerpt && (
            <p
              style={{
                fontSize: '17px',
                color: '#666',
                margin: '0 0 24px',
                lineHeight: 1.6,
              }}
            >
              {v.excerpt}
            </p>
          )}
          <div
            style={{ fontSize: '16px', lineHeight: 1.75 }}
            dangerouslySetInnerHTML={{ __html: v.content || '' }}
          />
        </article>
      )}
    />
  );
}
