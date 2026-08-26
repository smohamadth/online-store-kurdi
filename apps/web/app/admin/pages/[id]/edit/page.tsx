'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { authHttp, errorMessage } from '@/lib/http';
import { CmsEditor, type CmsEditorBaseFields, type CmsEditorExtras, type PageType } from '../../../_components/CmsEditor';

/**
 * Admin → Pages → Edit.
 *
 * The page loads the row by id, then hands control to the
 * shared CmsEditor. We keep the form state and the save
 * handler here (the shell is presentational); the host
 * decides which fields the form has, how to map them to the
 * API body, and how to render the storefront preview.
 */

interface PageRow extends CmsEditorBaseFields, CmsEditorExtras {
  id: string;
  updatedAt: string;
  pageType: PageType;
}

const BLANK: CmsEditorBaseFields & CmsEditorExtras = {
  title: '',
  slug: '',
  content: '<p></p>',
  excerpt: '',
  status: 'draft',
  pageType: 'info',
  showInFooter: false,
  metaTitle: '',
  metaDescription: '',
};

export default function EditPagePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [initial, setInitial] = useState<(CmsEditorBaseFields & CmsEditorExtras) | null>(null);
  const [values, setValues] = useState<CmsEditorBaseFields & CmsEditorExtras>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');

  // Restore the autosaved draft if it's newer than the server.
  // The key combines the id and the kind so a stale draft from
  // another kind (e.g. a blog post named with the same id) can't
  // bleed in.
  const draftKey = id ? `cms.pages.${id}` : null;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const res = await authHttp.get<PageRow>(`/pages/${id}`);
        if (!alive) return;
        const row = res.data;
        const next: CmsEditorBaseFields & CmsEditorExtras = {
          title: row.title || '',
          slug: row.slug || '',
          content: row.content || '',
          excerpt: row.excerpt || '',
          status: row.status,
          pageType: row.pageType,
          showInFooter: !!row.showInFooter,
          metaTitle: row.metaTitle || '',
          metaDescription: row.metaDescription || '',
        };
        setInitial(next);
        // Restore a newer autosaved draft if one exists. We
        // trust the local copy when it's been touched more
        // recently than the server's `updatedAt`; the value
        // is purely defensive — a user with a working network
        // will normally not hit this branch.
        if (draftKey) {
          try {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              const ts = Number(parsed?.savedAt) || 0;
              const srvTs = new Date(row.updatedAt).getTime();
              if (ts > srvTs) {
                setValues(parsed.values);
              } else {
                setValues(next);
              }
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
        if (alive) setLoadError(errorMessage(err, 'Could not load this page.'));
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
          href="/admin/pages"
          style={{ color: '#3b82f6', textDecoration: 'underline', fontSize: '14px' }}
        >
          <DirectionArrow kind="back" /> Back to pages
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
      const body = {
        title: values.title,
        slug: values.slug,
        content: values.content,
        excerpt: values.excerpt || null,
        status: values.status,
        pageType: values.pageType,
        showInFooter: !!values.showInFooter,
        metaTitle: values.metaTitle || null,
        metaDescription: values.metaDescription || null,
      };
      await authHttp.put<PageRow>(`/pages/${id}`, body);
      // After a successful save, the values become the new
      // "initial", so isDirty flips back to false and the
      // save-state indicator clears.
      setInitial({ ...values });
    } catch (err) {
      setFormError(errorMessage(err, 'Save failed. Nothing was stored.'));
      throw err; // shell will leave the error visible
    } finally {
      setSaving(false);
    }
  };

  return (
    <CmsEditor
      kind="page"
      resourceId={id ?? null}
      backHref="/admin/pages"
      publicHref={
        values.status === 'published'
          ? `/${values.pageType}/${values.slug}`
          : undefined
      }
      headerTitle={values.title || 'Untitled page'}
      initial={initial}
      values={values}
      onChange={setValues}
      onSave={save}
      isDirty={isDirty}
      saving={saving}
      formError={formError}
      formatLivePath={(v) => `/${v.pageType ?? 'info'}/${v.slug || '…'}`}
      renderPreview={(v) => (
        <article style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 12px',
              lineHeight: 1.15,
            }}
          >
            {v.title || 'Untitled page'}
          </h1>
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
            // The content is sanitised on the server; the
            // editor and the preview both render the same
            // safe HTML. The admin's preview and the live page
            // are pixel-identical for any content the API
            // accepts.
            dangerouslySetInnerHTML={{ __html: v.content || '' }}
          />
        </article>
      )}
    />
  );
}
