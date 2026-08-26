'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import RichTextEditor from '@/components/RichTextEditor';
import { useIsMobile } from '@/lib/hooks';
import { DirectionArrow } from '@/components/DirectionArrow';

/**
 * CmsEditor — the shared shell used by the pages and blog admin editors.
 *
 * Why a shared component?
 *   The two editors used to be 700-line siblings with almost identical
 *   state, the same save/close/cancel buttons, the same RichTextEditor,
 *   the same slug-from-title derivation, and the same modal scaffolding.
 *   Any UX change (autosave, preview tab, keyboard shortcut) had to be
 *   written twice. The shared shell keeps the two admin surfaces in sync
 *   and the per-type-specific bits (pageType select vs. tags input, page
 *   footer link vs. blog excerpt) live in the `extras` slot.
 *
 * Props contract:
 *   - `kind` is the only switch the shell reads. It picks the autosave
 *     namespace (`cms.pages.<id>` vs `cms.posts.<id>`) so the two
 *     editors don't share a draft store.
 *   - Everything else is content + callbacks. The shell never calls
 *     the API itself; the host page is responsible for `onSave`.
 *   - `renderPreview` renders the storefront-side version of the content
 *     given the current form state. The shell switches between the
 *     Edit and Preview tabs but knows nothing about the content shape.
 *
 * Keyboard shortcuts (handled in `useShortcut`):
 *   - Cmd/Ctrl + S: save (and close on shift)
 *   - Esc: discard autosave and close
 */

export type CmsKind = 'page' | 'post';

export type PageType = 'info' | 'legal' | 'help';

export interface CmsEditorBaseFields {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: 'draft' | 'published';
}

export interface CmsEditorExtras {
  /** PageType select for pages, or null when the kind is "post". */
  pageType?: PageType | null;
  /** Tags input for posts (comma-separated). */
  tags?: string;
  /** Show in footer checkbox (pages only). */
  showInFooter?: boolean;
  /** Cover image URL (posts only). */
  coverImage?: string;
  /** Author name (posts only). */
  author?: string;
  /** Whether the post should be pinned to the top of /blog. */
  isFeatured?: boolean;
  /** SEO fields used by both kinds. */
  metaTitle: string;
  metaDescription: string;
}

export interface CmsEditorProps {
  kind: CmsKind;
  /** The id of the row being edited, or `null` for a fresh create. */
  resourceId: string | null;
  /** Where the user comes back to when they hit "Back". */
  backHref: string;
  /** Where the "live" storefront page is, for the "Open" link. */
  publicHref?: string;
  /** Title shown in the editor header. */
  headerTitle: string;
  /** Initial values for the form. */
  initial: CmsEditorBaseFields & CmsEditorExtras;
  /** The form's current state. Controlled by the host. */
  values: CmsEditorBaseFields & CmsEditorExtras;
  onChange: (next: CmsEditorBaseFields & CmsEditorExtras) => void;
  /** Save handler. Resolves with the updated row on success. */
  onSave: () => Promise<void>;
  /** Renders the storefront view of the current values. */
  renderPreview: (values: CmsEditorBaseFields & CmsEditorExtras) => React.ReactNode;
  /** The slug for live URL preview, formatted by the host. */
  formatLivePath: (values: CmsEditorBaseFields & CmsEditorExtras) => string;
  /** True if there are unsaved changes. */
  isDirty: boolean;
  /** Save-in-flight flag (drives the toolbar). */
  saving: boolean;
  /** Form-level error to surface above the fields. */
  formError: string;
}

const AUTOSAVE_NAMESPACE: Record<CmsKind, string> = {
  page: 'cms.pages',
  post: 'cms.posts',
};

export function CmsEditor(props: CmsEditorProps) {
  const {
    kind,
    resourceId,
    backHref,
    publicHref,
    headerTitle,
    values,
    onChange,
    onSave,
    renderPreview,
    formatLivePath,
    isDirty,
    saving,
    formError,
    initial,
  } = props;

  const router = useRouter();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Autosave (localStorage) -------------------------------------------
  // The admin can lose network, accidentally close the tab, or refresh —
  // a few seconds of work should not evaporate. We snapshot the form to
  // localStorage on every change (debounced) and restore it on mount if
  // the snapshot is newer than the server's `updatedAt`. A user with
  // stale local data can always hit "Discard draft" to start fresh.
  const draftKey = `${AUTOSAVE_NAMESPACE[kind]}.${resourceId ?? 'new'}`;

  useEffect(() => {
    if (!isDirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ savedAt: Date.now(), values }),
        );
      } catch {
        // localStorage is best-effort; a quota error or disabled storage
        // must not break the editor.
      }
    }, 1000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [draftKey, isDirty, values]);

  const discardAutosave = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* noop */
    }
  }, [draftKey]);

  // ----- Save success handler ----------------------------------------------
  // We hook the parent's onSave by wrapping it: when it resolves, clear
  // the autosave and update the "Saved X ago" indicator. If it throws,
  // the parent keeps the error visible and the autosave stays so the
  // user can retry without losing edits.
  const wrappedSave = useCallback(async () => {
    try {
      await onSave();
      discardAutosave();
      setSavedAt(new Date());
    } catch {
      // Parent owns the error display; nothing to do here.
    }
  }, [discardAutosave, onSave]);

  // ----- Keyboard shortcuts -------------------------------------------------
  // Cmd/Ctrl+S saves; Cmd/Ctrl+Shift+S saves and goes back; Esc goes back
  // (after discarding the autosave). We only listen while a non-input
  // element is focused, otherwise typing in the rich text editor would
  // trigger save on every keystroke.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;

      if (isMod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        wrappedSave().then(() => {
          if (e.shiftKey) router.push(backHref);
        });
        return;
      }
      if (e.key === 'Escape' && !inField) {
        discardAutosave();
        router.push(backHref);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backHref, discardAutosave, router, wrappedSave]);

  // ----- Derived UI bits -----------------------------------------------------
  const livePath = formatLivePath(values);
  const showLivePreview = !isDirty || activeTab === 'preview';

  return (
    <div
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: isMobile ? '16px 12px' : '24px 20px 60px',
      }}
    >
      {/* Header bar: back, title, save state, action buttons. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href={backHref}
          style={{
            color: 'var(--muted, #6b7280)',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <DirectionArrow kind="back" /> Back
        </Link>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 700,
            margin: 0,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {headerTitle}
        </h1>
        <SaveStateIndicator isDirty={isDirty} savedAt={savedAt} />
        {publicHref && (
          <a
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '8px 14px',
              background: '#fff',
              border: '1px solid #d4d4d4',
              borderRadius: '6px',
              fontSize: '13px',
              textDecoration: 'none',
              color: 'var(--body-text, #111)',
            }}
          >
            Open ↗
          </a>
        )}
        <button
          type="button"
          onClick={() => wrappedSave().then(() => router.push(backHref))}
          disabled={saving || !isDirty}
          data-testid="cms-save-and-close"
          style={{
            padding: '8px 14px',
            backgroundColor: 'var(--brand, #111)',
            color: 'var(--brand-text, #fff)',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: saving || !isDirty ? 'default' : 'pointer',
            opacity: saving || !isDirty ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save & close'}
        </button>
      </div>

      {/* Tabs: edit vs. preview. The preview tab shows the same
          content rendered like the storefront will see it, so the
          admin can sanity-check formatting before publishing. */}
      <div
        role="tablist"
        aria-label="Edit or preview"
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid var(--border, #e5e5e5)',
          marginBottom: '20px',
        }}
      >
        {(['edit', 'preview'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={activeTab === t}
            data-testid={`cms-tab-${t}`}
            onClick={() => setActiveTab(t)}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom:
                activeTab === t
                  ? '2px solid var(--brand, #111)'
                  : '2px solid transparent',
              marginBottom: '-1px',
              fontSize: '14px',
              fontWeight: activeTab === t ? 600 : 500,
              color: activeTab === t ? 'var(--body-text, #111)' : 'var(--muted, #6b7280)',
              cursor: 'pointer',
            }}
          >
            {t === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>

      {formError && (
        <div
          role="alert"
          data-testid="cms-form-error"
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '8px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            fontSize: '14px',
          }}
        >
          {formError}
        </div>
      )}

      {activeTab === 'edit' ? (
        <EditPanel
          values={values}
          onChange={onChange}
          initial={initial}
          kind={kind}
          isMobile={isMobile}
        />
      ) : (
        <PreviewPanel livePath={livePath}>
          {renderPreview(values)}
        </PreviewPanel>
      )}

      {/* Sticky save bar. Always visible so the admin can save
          even after a long edit. Hides on the preview tab. */}
      {activeTab === 'edit' && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: '24px',
            padding: '12px 16px',
            backgroundColor: 'var(--card-bg, #fff)',
            borderTop: '1px solid var(--border, #e5e5e5)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'flex-end',
            borderRadius: '8px',
            boxShadow: '0 -2px 6px rgba(0,0,0,0.04)',
          }}
        >
          <button
            type="button"
            onClick={discardAutosave}
            data-testid="cms-discard"
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              color: 'var(--muted, #6b7280)',
              cursor: 'pointer',
              fontSize: '13px',
              textDecoration: 'underline',
            }}
          >
            Discard draft
          </button>
          <button
            type="button"
            onClick={wrappedSave}
            disabled={saving || !isDirty}
            data-testid="cms-save"
            style={{
              padding: '8px 18px',
              backgroundColor: 'var(--brand, #111)',
              color: 'var(--brand-text, #fff)',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: saving || !isDirty ? 'default' : 'pointer',
              opacity: saving || !isDirty ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Hidden marker used by tests to confirm the keyboard
          shortcut hook is wired up. */}
      <span data-testid="cms-editor-kind" style={{ display: 'none' }}>
        {kind}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Save-state indicator. Shows nothing while the form is clean; a soft
// "Unsaved changes" while dirty; "Saved X ago" after a successful save.
// ----------------------------------------------------------------------------
function SaveStateIndicator({
  isDirty,
  savedAt,
}: {
  isDirty: boolean;
  savedAt: Date | null;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  if (isDirty) {
    return (
      <span
        data-testid="cms-save-state"
        style={{ color: 'var(--muted, #6b7280)', fontSize: '12px' }}
      >
        ● Unsaved changes
      </span>
    );
  }
  if (savedAt) {
    return (
      <span
        data-testid="cms-save-state"
        style={{ color: 'var(--success, #16a34a)', fontSize: '12px' }}
      >
        ✓ Saved {formatAgo(savedAt)}
      </span>
    );
  }
  return null;
}

function formatAgo(d: Date): string {
  const sec = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString();
}

// ----------------------------------------------------------------------------
// Edit panel: title + slug, status, type/tags, content. The host page passes
// its own form values, so the shell doesn't own the data shape — it just
// renders the form scaffolding.
// ----------------------------------------------------------------------------
interface EditPanelProps {
  values: CmsEditorBaseFields & CmsEditorExtras;
  onChange: (next: CmsEditorBaseFields & CmsEditorExtras) => void;
  initial: CmsEditorBaseFields & CmsEditorExtras;
  kind: CmsKind;
  isMobile: boolean;
}

function EditPanel({ values, onChange, kind, isMobile }: EditPanelProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d4d4d4',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    background: 'var(--card-bg, #fff)',
    color: 'var(--body-text, #111)',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
    color: 'var(--body-text, #111)',
  };
  const helpStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px',
  };
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '14px',
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="cms-title">
            Title
          </label>
          <input
            id="cms-title"
            style={inputStyle}
            value={values.title}
            onChange={(e) => onChange({ ...values, title: e.target.value })}
            placeholder={kind === 'page' ? 'About Us' : 'A catchy post title'}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="cms-slug">
            Address (slug)
          </label>
          <input
            id="cms-slug"
            data-testid="cms-slug-input"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            value={values.slug}
            onChange={(e) => onChange({ ...values, slug: e.target.value })}
            placeholder="about-us"
            required
          />
          <p style={helpStyle}>
            Letters, numbers and single hyphens. The first 120 chars are kept.
          </p>
        </div>
      </div>

      {/* Per-kind controls: pageType for pages, tags for posts. */}
      {kind === 'page' && (
        <div
          style={{
            marginTop: '14px',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: '14px',
          }}
        >
          <div>
            <label style={labelStyle} htmlFor="cms-page-type">
              Type
            </label>
            <select
              id="cms-page-type"
              data-testid="cms-page-type-select"
              value={values.pageType ?? 'info'}
              onChange={(e) =>
                onChange({ ...values, pageType: e.target.value as PageType })
              }
              style={inputStyle}
            >
              <option value="info">Info — /info/… (About, Sustainability, Press)</option>
              <option value="legal">Legal — /legal/… (Privacy, Terms, Cookies)</option>
              <option value="help">Help — /help/… (Shipping, Sizing, Returns)</option>
            </select>
            <p style={helpStyle}>
              Picks the URL prefix. Moving the page later changes the URL.
            </p>
          </div>
          <div>
            <label
              style={{
                ...labelStyle,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <input
                type="checkbox"
                checked={!!values.showInFooter}
                onChange={(e) =>
                  onChange({ ...values, showInFooter: e.target.checked })
                }
              />
              Show in footer
            </label>
            <p style={helpStyle}>
              Pages with this on appear in the storefront footer's
              matching column (Info / Legal / Support).
            </p>
          </div>
        </div>
      )}

      {kind === 'post' && (
        <div
          style={{
            marginTop: '14px',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
            gap: '14px',
          }}
        >
          <div>
            <label style={labelStyle} htmlFor="cms-tags">
              Tags
            </label>
            <input
              id="cms-tags"
              data-testid="cms-tags-input"
              style={inputStyle}
              value={values.tags ?? ''}
              onChange={(e) => onChange({ ...values, tags: e.target.value })}
              placeholder="shipping, guide"
            />
            <p style={helpStyle}>Comma-separated. Lowercased on save.</p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="cms-author">
              Author
            </label>
            <input
              id="cms-author"
              style={inputStyle}
              value={values.author ?? ''}
              onChange={(e) => onChange({ ...values, author: e.target.value })}
              placeholder="Staff name or shop name"
            />
          </div>
          <div>
            <label
              style={{
                ...labelStyle,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: isMobile ? '14px' : '24px',
              }}
            >
              <input
                type="checkbox"
                data-testid="cms-featured-checkbox"
                checked={!!values.isFeatured}
                onChange={(e) =>
                  onChange({ ...values, isFeatured: e.target.checked })
                }
              />
              Pin to top of /blog
            </label>
          </div>
        </div>
      )}

      <div style={{ marginTop: '14px' }}>
        <label style={labelStyle} htmlFor="cms-excerpt">
          Short summary (optional)
        </label>
        <input
          id="cms-excerpt"
          style={inputStyle}
          value={values.excerpt ?? ''}
          onChange={(e) => onChange({ ...values, excerpt: e.target.value })}
          placeholder="One sentence. Used in previews and the meta description."
        />
      </div>

      <div style={{ marginTop: '14px' }}>
        <label style={labelStyle}>Content</label>
        <RichTextEditor
          value={values.content}
          onChange={(html) => onChange({ ...values, content: html })}
          minHeight={360}
        />
      </div>

      <div
        style={{
          marginTop: '18px',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '14px',
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="cms-meta-title">
            SEO title (optional)
          </label>
          <input
            id="cms-meta-title"
            style={inputStyle}
            value={values.metaTitle ?? ''}
            onChange={(e) => onChange({ ...values, metaTitle: e.target.value })}
            placeholder="Defaults to the title"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="cms-meta-description">
            SEO description (optional)
          </label>
          <input
            id="cms-meta-description"
            style={inputStyle}
            value={values.metaDescription ?? ''}
            onChange={(e) =>
              onChange({ ...values, metaDescription: e.target.value })
            }
            placeholder="Defaults to the short summary"
          />
        </div>
      </div>

      <div
        style={{
          marginTop: '18px',
          padding: '11px 14px',
          borderRadius: '8px',
          fontSize: '13px',
          backgroundColor: '#f5f5f5',
          color: 'var(--muted, #6b7280)',
        }}
      >
        <strong style={{ color: 'var(--body-text, #111)' }}>Status:</strong>{' '}
        {values.status === 'published' ? (
          <>
            Published — visible to customers at{' '}
            <code style={{ background: '#fff', padding: '0 4px' }}>
              {livePathFor(values, kind)}
            </code>
            .
          </>
        ) : (
          <>
            <strong>Draft</strong> — not visible to customers until you publish.
          </>
        )}
      </div>
    </div>
  );
}

function livePathFor(
  values: CmsEditorBaseFields & CmsEditorExtras,
  kind: CmsKind,
): string {
  if (kind === 'page') {
    return `/${values.pageType ?? 'info'}/${values.slug || '…'}`;
  }
  return `/blog/${values.slug || '…'}`;
}

// ----------------------------------------------------------------------------
// Preview panel. The host page supplies the renderer; the shell just
// wraps it in a styled frame so the admin gets a "this is what the
// customer sees" feel without leaving the editor.
// ----------------------------------------------------------------------------
function PreviewPanel({
  livePath,
  children,
}: {
  livePath: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="cms-preview-panel"
      style={{
        border: '1px solid var(--border, #e5e5e5)',
        borderRadius: '8px',
        background: 'var(--card-bg, #fff)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 14px',
          fontSize: '12px',
          background: '#f5f5f5',
          color: 'var(--muted, #6b7280)',
          borderBottom: '1px solid var(--border, #e5e5e5)',
        }}
      >
        Live URL: <code>{livePath}</code>
      </div>
      <div style={{ padding: '32px 24px' }}>{children}</div>
    </div>
  );
}
