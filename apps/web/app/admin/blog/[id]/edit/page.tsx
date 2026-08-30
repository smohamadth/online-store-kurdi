// /admin/blog/[id]/edit - the blog post editor. Runs on the shared
// CmsEditor shell (autosave namespace cms.posts.<id>, Edit/Preview
// tabs, slug-from-title) with the post-specific extras (tags, excerpt,
// featured flag) and the block layout (PageBlocksEditor). Saving goes
// through PUT /api/blog/:id; the content HTML is sanitised again by
// the API on write.
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
import {
  CmsEditor,
  type CmsEditorBaseFields,
  type CmsEditorExtras,
} from '../../../_components/CmsEditor';
import { PageBlocksEditor } from '../../../pages/_components/PageBlocksEditor';

interface PostRow extends CmsEditorBaseFields, CmsEditorExtras {
  id: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Tags come from the API as a string array, but the editor
   *  works with a comma-separated string. We split on read and
   *  join on save, so the form sees a single text field. */
  tagsList?: string[];
  /** Parsed block list from the API (null when the post has none). */
  blocks?: PageBlock[] | null;
}

/** Form state = editor base + extras + the block layout. */
type PostValues = CmsEditorBaseFields & CmsEditorExtras & { blocks: PageBlock[] };

const BLANK: PostValues = {
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
  blocks: [],
};

/**
 * Every value that reaches the form must carry a block array. Posts saved
 * before blocks existed have none - their legacy `content` becomes a
 * single rich-text section so the editor shows exactly what renders.
 * (Also covers autosaved drafts written before this feature shipped.)
 */
function withBlocks(v: CmsEditorBaseFields & CmsEditorExtras & { blocks?: PageBlock[] | null }): PostValues {
  const blocks = Array.isArray(v.blocks) && v.blocks.length > 0 ? v.blocks : blocksFromLegacyContent(v.content);
  return { ...v, blocks };
}

export default function EditPostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [initial, setInitial] = useState<PostValues | null>(null);
  const [values, setValues] = useState<PostValues>(BLANK);
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
        const next = withBlocks({
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
          blocks: row.blocks,
        });
        setInitial(next);
        if (draftKey) {
          try {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              const ts = Number(parsed?.savedAt) || 0;
              const srvTs = new Date(row.updatedAt).getTime();
              setValues(ts > srvTs ? withBlocks(parsed.values) : next);
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

      // For posts the blocks ARE the content: the layout section is the
      // single source of truth. We sync the legacy `content` column from
      // the blocks so a post whose blocks were all deleted never renders
      // stale text, and content-only consumers (excerpt, reading time,
      // search) still see the words.
      const body = {
        title: values.title,
        slug: values.slug,
        content: blocksToLegacyContent(values.blocks),
        blocks: values.blocks,
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
      previewDirToggle
      backHref="/admin/blog"
      publicHref={
        values.status === 'published' ? `/blog/${values.slug}` : undefined
      }
      headerTitle={values.title || 'Untitled post'}
      initial={initial}
      values={values}
      // The shared shell edits the base fields only; the block array
      // lives in this route's state and is preserved on every change.
      onChange={(next) => setValues({ ...withBlocks(next), blocks: values.blocks })}
      onSave={save}
      isDirty={isDirty}
      saving={saving}
      formError={formError}
      formatLivePath={(v) => `/blog/${v.slug || '…'}`}
      contentSection={
        <div style={{ marginTop: '14px' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, color: '#333', display: 'block', marginBottom: '8px' }}>
            Layout
          </label>
          <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#777' }}>
            Compose the post from sections - text, headings, images, two
            columns, callout boxes, quotes, galleries, buttons, dividers and
            spacing. Order matters: sections render top to bottom.
          </p>
          <PageBlocksEditor
            blocks={values.blocks}
            onChange={(blocks) => setValues({ ...values, blocks })}
          />
        </div>
      }
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
          <div style={{ fontSize: '16px' }}>
            {(v as PostValues).blocks && (v as PostValues).blocks.length > 0 ? (
              // Same renderer as the storefront, so the preview is
              // pixel-identical to the live post.
              <PageBlocks blocks={(v as PostValues).blocks} />
            ) : (
              // Legacy single-column post (no blocks).
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
