'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { PageBlocks } from '@/components/PageBlocks';
import { authHttp, errorMessage } from '@/lib/http';
import {
  type PageBlock,
  blocksFromLegacyContent,
  blocksToLegacyContent,
} from '@/lib/pageBlocks';
import { CmsEditor, type CmsEditorBaseFields, type CmsEditorExtras, type PageType } from '../../../_components/CmsEditor';
import { PageBlocksEditor } from '../../_components/PageBlocksEditor';

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
  /** Parsed block list from the API (null when the page has none). */
  blocks?: PageBlock[] | null;
}

/** Form state = editor base + extras + the block layout. */
type PageValues = CmsEditorBaseFields & CmsEditorExtras & { blocks: PageBlock[] };

const BLANK: PageValues = {
  title: '',
  slug: '',
  content: '<p></p>',
  excerpt: '',
  status: 'draft',
  pageType: 'info',
  showInFooter: false,
  metaTitle: '',
  metaDescription: '',
  blocks: [],
};

/**
 * Every value that reaches the form must carry a block array. Rows saved
 * before blocks existed have none - their legacy `content` becomes a
 * single rich-text block so the editor shows exactly what renders.
 * (Also covers autosaved drafts written before this feature shipped.)
 */
function withBlocks(v: CmsEditorBaseFields & CmsEditorExtras & { blocks?: PageBlock[] | null }): PageValues {
  const blocks = Array.isArray(v.blocks) && v.blocks.length > 0 ? v.blocks : blocksFromLegacyContent(v.content);
  return { ...v, blocks };
}

export default function EditPagePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [initial, setInitial] = useState<PageValues | null>(null);
  const [values, setValues] = useState<PageValues>(BLANK);
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
        const next = withBlocks({
          title: row.title || '',
          slug: row.slug || '',
          content: row.content || '',
          excerpt: row.excerpt || '',
          status: row.status,
          pageType: row.pageType,
          showInFooter: !!row.showInFooter,
          metaTitle: row.metaTitle || '',
          metaDescription: row.metaDescription || '',
          blocks: row.blocks,
        });
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
                setValues(withBlocks(parsed.values));
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
      // For pages the blocks ARE the content: the editor's layout
      // section (not a free-text field) is the single source of truth.
      // We sync the legacy `content` column from the blocks so a page
      // whose blocks were all deleted never renders stale text, and so
      // any consumer that only reads `content` still sees the words.
      const body = {
        title: values.title,
        slug: values.slug,
        content: blocksToLegacyContent(values.blocks),
        blocks: values.blocks,
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
      previewDirToggle
      backHref="/admin/pages"
      publicHref={
        values.status === 'published'
          ? `/${values.pageType}/${values.slug}`
          : undefined
      }
      headerTitle={values.title || 'Untitled page'}
      initial={initial}
      values={values}
      // The shared shell edits the base fields only; the block array
      // lives in this route's state and is preserved on every change.
      onChange={(next) => setValues({ ...withBlocks(next), blocks: values.blocks })}
      onSave={save}
      isDirty={isDirty}
      saving={saving}
      formError={formError}
      formatLivePath={(v) => `/${v.pageType ?? 'info'}/${v.slug || '…'}`}
      contentSection={
        <div style={{ marginTop: '14px' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, color: '#333', display: 'block', marginBottom: '8px' }}>
            Layout
          </label>
          <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#777' }}>
            Compose the page from sections - text, headings, images, two columns,
            callout boxes, buttons, dividers and spacing. Order matters: sections
            render top to bottom.
          </p>
          <PageBlocksEditor
            blocks={values.blocks}
            onChange={(blocks) => setValues({ ...values, blocks })}
          />
        </div>
      }
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
          <div style={{ fontSize: '16px' }}>
            {(v as PageValues).blocks && (v as PageValues).blocks.length > 0 ? (
              // Same renderer as the storefront, so the preview is
              // pixel-identical to the live page.
              <PageBlocks blocks={(v as PageValues).blocks} />
            ) : (
              // Legacy single-column page (no blocks): the content is
              // sanitised on the server, never on read.
              <div
                style={{ lineHeight: 1.75 }}
                dangerouslySetInnerHTML={{ __html: v.content || '' }}
              />
            )}
          </div>
        </article>
      )}
    />
  );
}
