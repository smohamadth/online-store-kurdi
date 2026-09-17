'use client';

/**
 * Theme Studio — the visual theme builder.
 *
 * Lets an admin create/edit a theme with:
 *   - design tokens (colours, typography, spacing) edited with controls
 *   - ordered home templates plus per-page grids
 *   - full grid control: each block's column start/span and row start/span
 *   - template previews using the storefront renderers, plus a separate saved-store iframe
 *
 * A theme is persisted as a theme.json file via the theme-studio API (the
 * "files" model). Bundled themes are the read-only base; an admin creates a
 * new theme by duplicating one, then edits + saves it to its own directory.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { API_BASE, errorMessage } from '@/lib/http';
import ReplaceHomepageButton from '@/components/ReplaceHomepageButton';
import { DESIGN_COLOR_FIELDS, ANNOUNCEMENT_COLOR_FIELDS } from '@/lib/designTokens';
import { appearanceHref, hasHomeTemplate } from '@/lib/designWorkflow';
import { homeStackLayout, moveHomeBlock } from '@/lib/layouts/homeStack';
import { PreviewThemeProvider } from '@/lib/previewTheme';
import { getDefaultTheme, type ThemeConfig } from '@/lib/themeRegistry';
import { setRuntimeThemeConfig } from '@/lib/themeRuntime';
import { useIsMobile } from '@/lib/hooks';
import { useDesignNavigationGuard } from '@/lib/useDesignNavigationGuard';
import {
  PageKey,
  PageLayout,
  LayoutBlock,
  BLOCK_TYPES,
  BlockType,
  PAGE_KEYS,
  PAGE_LABELS,
  DEFAULT_COLUMNS,
  paletteForPage,
} from '@/lib/layouts/types';
import { defaultLayoutFor } from '@/lib/layouts/defaults';
import { LayoutRenderer } from '@/lib/layouts/render';
import { addBlock, moveBlock, resizeBlock, removeBlock } from '@/lib/layouts/edit';
import { CONFIG_FIELDS, LIST_BLOCK_TYPES, type ConfigField } from '@/lib/layouts/blockUtils';
import { isPlatformBundledTheme } from '@/lib/themeBundled';
import { studioLayoutData, studioTokenStyle, studioHomeMerch, studioLivePreviewPath } from '@/lib/layouts/studioPreview';
import { FONT_LABELS, FONT_STACKS, useTheme } from '@/lib/theme';
import { mergeStudioLayouts, studioHasUnsavedDrafts } from '@/lib/layouts/studioSave';
import { layoutToHomeSections } from '@/lib/layouts/homeMapping';
import { HomeSectionStack } from '@/components/HomeSectionStack';

interface ThemeStudioTheme {
  key: string;
  name: string;
  description: string;
  version: string;
  author: string;
  preview: string;
  features: { rtl: boolean; darkMode: boolean; paid: boolean };
  tokens: Record<string, string | number | boolean>;
  layouts?: Record<string, unknown>;
  sections?: Record<string, string>;
}

const BLOCK_LABELS: Record<BlockType, string> = {
  hero: 'Hero',
  promo: 'Promo',
  bannerStrip: 'Banner strip',
  trustBar: 'Trust bar',
  features: 'Features',
  categories: 'Categories',
  featured: 'Product grid',
  newArrivals: 'New arrivals',
  trending: 'Trending',
  dealCountdown: 'Countdown',
  testimonials: 'Testimonials',
  stats: 'Stats',
  gallery: 'Gallery',
  richText: 'Rich text',
  custom: 'Custom HTML',
  newsletter: 'Newsletter',
  cta: 'Call to action',
  video: 'Video',
  image: 'Image',
  textImage: 'Text + image',
  divider: 'Divider',
  faq: 'FAQ',
  steps: 'Steps',
  logoStrip: 'Brand logos',
  pricing: 'Pricing',
  quote: 'Quote',
  iconsGrid: 'Icon grid',
  productDetail: 'Product detail',
  productList: 'Product grid',
  categoryGrid: 'Category grid',
  blogList: 'Blog list',
  blogPostBody: 'Blog post',
  pageContent: 'Page content',
};

export default function ThemeStudioPage() {
  const { theme: liveTheme } = useTheme();
  // The Theme Studio is a 3-column desktop layout (theme list | canvas |
  // palette+tokens). On phones that fixed ~580px of columns overflows a
  // ~360px viewport, so stack the three panels vertically below 900px.
  const isMobile = useIsMobile(900);
  const [themes, setThemes] = useState<ThemeStudioTheme[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [currentKey, setCurrentKey] = useState<string>('');
  const [current, setCurrent] = useState<ThemeStudioTheme | null>(null);
  const [page, setPage] = useState<PageKey>('home');
  // Per-page draft layouts. Edits accumulate here so switching pages never
  // discards unsaved work; the derived `layout` below is the draft for the
  // current page, falling back to the theme's saved layout, then the built-in.
  const [drafts, setDrafts] = useState<Partial<Record<PageKey, PageLayout>>>({});
  const pageLayout: PageLayout =
    drafts[page] ??
    (current?.layouts?.[page] as PageLayout | undefined) ??
    (page === 'home' ? { columns: 1, gap: 0, blocks: [] } : defaultLayoutFor(page)) ??
    { columns: DEFAULT_COLUMNS, gap: 24, blocks: [] };
  const layout = page === 'home' ? homeStackLayout(pageLayout) : pageLayout;
  const setLayout = (next: PageLayout) => setDrafts((d) => ({ ...d, [page]: page === 'home' ? homeStackLayout(next) : next }));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // Ref (not state): setting state on dragStart re-renders the palette item
  // and Chrome cancels the HTML5 drag. Drop reads this or dataTransfer.
  const draggingTypeRef = useRef<BlockType | null>(null);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const busy = saving || working || replacing;
  const operation = useRef(false);
  const [msg, setMsg] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [newName, setNewName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  // Preview viewport for checking the builder output at different displays.
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'phone'>('desktop');
  const [livePreviewKey, setLivePreviewKey] = useState(0);
  const [metaDirty, setMetaDirty] = useState(false);
  const PREVIEW_WIDTHS: Record<'desktop' | 'tablet' | 'phone', number> = {
    desktop: 1280,
    tablet: 768,
    phone: 375,
  };

  const token = () => localStorage.getItem('token');
  const notify = (type: string, text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 5000);
  };

  const loadThemes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/theme-studio/themes`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error('Could not load themes. Reload this page to try again.');
      const payload = (await res.json()).data as ThemeStudioTheme[] | string[];
      // Older API versions returned keys; new ones return full configs.
      const list = await Promise.all((payload || []).map(async (entry) => {
        if (typeof entry !== 'string') return entry;
        const r = await fetch(`${API_BASE}/theme-studio/themes/${entry}`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) throw new Error(`Could not load theme “${entry}”.`);
        return (await r.json()).data as ThemeStudioTheme;
      }));
      setThemes(list);
      setCatalogLoaded(true);
    } catch (error) {
      setMsg({ type: 'error', text: errorMessage(error, 'Could not load themes.') });
    }
  }, []);

  useEffect(() => { void loadThemes(); }, [loadThemes]);

  const studioDirty = studioHasUnsavedDrafts(drafts) || metaDirty;
  useDesignNavigationGuard(
    studioDirty || busy,
    busy ? 'A theme update is still in progress. Leave this page?' : 'Discard unsaved theme edits and leave this page?',
  );

  const acceptSavedTheme = (data: ThemeStudioTheme) => {
    setCurrent(data);
    setCurrentKey(data.key);
    setDrafts({});
    setMetaDirty(false);
    setSelectedBlockId(null);
  };

  const selectTheme = async (key: string) => {
    if (busy || operation.current || key === currentKey) return;
    if (studioDirty && !window.confirm('Discard unsaved theme edits and switch themes?')) return;
    operation.current = true;
    setWorking(true);
    try {
      const r = await fetch(`${API_BASE}/theme-studio/themes/${key}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error((await r.json()).message || 'Could not load this theme.');
      acceptSavedTheme((await r.json()).data as ThemeStudioTheme);
      setMsg({ type: '', text: '' });
    } catch (error) {
      notify('error', errorMessage(error, 'Could not load this theme. Your edits were kept.'));
    } finally {
      operation.current = false;
      setWorking(false);
    }
  };

  const switchPage = (p: PageKey) => {
    setPage(p);
    setSelectedBlockId(null);
  };

  const createTheme = async () => {
    if (!catalogLoaded || busy || operation.current) return;
    const key = newName.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!key) return notify('error', 'Enter a name with at least one Latin letter or number.');
    if (themes.some((t) => t.key === key)) return notify('error', 'A theme with this name already exists. Choose a different name.');
    operation.current = true;
    setWorking(true);
    const cfg: ThemeStudioTheme = {
      key, name: newName.trim(), description: current?.description || 'A custom theme created in Theme Studio.',
      version: '1.0.0', author: 'Store Admin', preview: current?.preview || '/themes/default/preview.png',
      features: current?.features ? { ...current.features } : { rtl: true, darkMode: false, paid: false },
      tokens: { ...(current?.tokens ?? getDefaultTheme().tokens) },
      layouts: mergeStudioLayouts(current?.layouts, drafts),
      ...(current?.sections ? { sections: { ...current.sections } } : {}),
    };
    try {
      const res = await fetch(`${API_BASE}/theme-studio/themes/${key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(cfg),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Could not create theme.');
      const saved = body.data as ThemeStudioTheme;
      acceptSavedTheme(saved);
      setThemes((list) => [...list, saved]);
      setCreateOpen(false);
      setNewName('');
      notify('success', `Theme “${saved.name}” created, including your current edits.`);
    } catch (error) {
      notify('error', errorMessage(error, 'Could not create theme. Your edits were kept.'));
    } finally {
      operation.current = false;
      setWorking(false);
    }
  };

  const bundled = isPlatformBundledTheme(current?.key);

  const save = async () => {
    if (!current || busy || operation.current || !studioDirty) return;
    if (bundled) return notify('error', 'Duplicate this platform theme to save your edits.');
    operation.current = true;
    setSaving(true);
    const updated = { ...current, layouts: mergeStudioLayouts(current.layouts, drafts) };
    try {
      const res = await fetch(`${API_BASE}/theme-studio/themes/${current.key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(updated),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Save failed.');
      // Use the sanitised server response, not the pre-save draft.
      const saved = body.data as ThemeStudioTheme;
      acceptSavedTheme(saved);
      setThemes((list) => list.map((theme) => theme.key === saved.key ? saved : theme));
      setRuntimeThemeConfig(saved);
      window.dispatchEvent(new Event('themeChange'));
      notify('success', `Theme “${saved.name}” saved. Homepage blocks were not changed. Apply styling in Appearance, or replace the homepage from this saved template.`);
    } catch (error) {
      notify('error', errorMessage(error, 'Could not save theme. Your edits were kept.'));
    } finally {
      operation.current = false;
      setSaving(false);
    }
  };

  const deleteCurrent = async () => {
    if (!current || bundled || busy || operation.current) return;
    if (!confirm(`Delete theme “${current.name}”${studioDirty ? ' and discard its unsaved edits' : ''}? This cannot be undone.`)) return;
    operation.current = true;
    setWorking(true);
    try {
      const res = await fetch(`${API_BASE}/theme-studio/themes/${current.key}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Delete failed.');
      setThemes((list) => list.filter((theme) => theme.key !== current.key));
      setCurrent(null);
      setCurrentKey('');
      setDrafts({});
      setMetaDirty(false);
      setSelectedBlockId(null);
      window.dispatchEvent(new Event('themeChange'));
      notify('success', body.message || 'Theme deleted.');
    } catch (error) {
      notify('error', errorMessage(error, 'Could not delete this theme.'));
    } finally {
      operation.current = false;
      setWorking(false);
    }
  };

  const setToken = (k: string, v: string | number | boolean) => {
    if (!current) return;
    setCurrent({ ...current, tokens: { ...current.tokens, [k]: v } });
    setMetaDirty(true);
  };

  const paletteBlocks = paletteForPage(page);
  const merch = studioHomeMerch();

  const appendBlock = (type: BlockType) => {
    if (!current) {
      notify('error', 'Select a theme first, then add blocks.');
      return;
    }
    if (busy) return;
    const next = addBlock(layout, type);
    setLayout(next);
    setSelectedBlockId(next.blocks[next.blocks.length - 1].id);
  };

  const homePreview = () => current && (
    <PreviewThemeProvider themeKey={current.key} themeConfig={current as ThemeConfig} storeActiveTheme={liveTheme.activeTheme}>
      <HomeSectionStack sections={layoutToHomeSections(layout)} isMobile={previewMode === 'phone'}
        perRow={Math.max(2, Math.min(6, Number(current.tokens.productsPerRow ?? 4) || 4))}
        currencySymbol="$" featuredProducts={merch.products} categories={merch.categories}
        heroBanners={merch.banners} promoBanners={[]} stripBanners={[]} bannersLoaded
        newArrivals={merch.products} trending={merch.products} />
    </PreviewThemeProvider>
  );

  // ---- grid editing -------------------------------------------------------
  const handleDropBlock = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = (e.dataTransfer.getData('text/plain') || draggingTypeRef.current || '').trim();
    draggingTypeRef.current = null;
    if (!(BLOCK_TYPES as readonly string[]).includes(raw)) return;
    appendBlock(raw as BlockType);
  };

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>Theme Studio</h1>
          <p style={{ color: '#666', marginTop: 4, fontSize: 14 }}>
            Design reusable theme styles and page templates. Appearance manages your live shop.
            Homepage templates are ordered sections; other pages support grids.
            Theme packages contain data, not executable React components.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'start' }}>
          <a href={appearanceHref('home')} style={{ ...btnGhost, padding: '9px 12px' }}>Edit live homepage</a>
          <button disabled={busy || !catalogLoaded}
            onClick={() => setCreateOpen((o) => !o)}
            style={btnPrimary}
          >
            {current ? 'Duplicate theme' : '+ New theme'}
          </button>
          {current && page === 'home' && <ReplaceHomepageButton key={current.key} themeKey={current.key} themeName={current.name}
            disabled={busy || studioDirty || !hasHomeTemplate(current.layouts)}
            disabledReason={studioDirty ? (bundled ? 'Duplicate this theme to save your edits first.' : 'Save theme edits first.') : !hasHomeTemplate(current.layouts) ? 'Add homepage sections and save the theme first.' : undefined}
            onApplied={() => setLivePreviewKey((key) => key + 1)} onBusyChange={setReplacing} />}
          {current && <a href={appearanceHref('theme', current.key)} aria-disabled={studioDirty || busy}
            onClick={(event) => { if (studioDirty || busy) { event.preventDefault(); notify('error', 'Save or duplicate this theme before applying its styling.'); } }}
            style={{ ...btnGhost, padding: '9px 12px', opacity: studioDirty || busy ? 0.5 : 1 }}>Apply styling in Appearance</a>}
          <button
            onClick={save}
            disabled={busy || !current || bundled || !studioDirty}
            title={bundled ? 'Duplicate this theme first — bundled themes cannot be overwritten' : undefined}
            style={{ ...btnPrimary, background: '#111', opacity: bundled ? 0.5 : 1 }}
          >
            {saving ? 'Saving…' : 'Save theme'}
          </button>
        </div>
      </header>

      {studioDirty && <p role="status" style={{ fontSize: 13, color: '#92400e', marginTop: 12 }}>Unsaved theme edits{bundled ? ' — duplicate this platform theme to keep them.' : ' — Save theme to keep them.'}</p>}
      {current?.key === liveTheme.activeTheme && <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>
        You are editing the active theme. Saving layouts for other pages updates those pages on their next load.
        Homepage blocks and live appearance overrides stay separate. Duplicate the theme to experiment safely.
      </p>}
      <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {createOpen && (
        <div style={{ margin: '16px 0', padding: 16, border: '1px solid #e5e5e5', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            aria-label="New theme name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Theme name (e.g. My Brand)"
            style={{ flex: 1, padding: '9px 11px', border: '1px solid #d4d4d4', borderRadius: 6 }}
          />
          <button onClick={createTheme} disabled={!catalogLoaded || !newName.trim()} style={btnPrimary}>Create</button>
        </div>
      )}

      {msg.text && (
        <div role={msg.type === 'error' ? 'alert' : 'status'} style={{ margin: '14px 0', padding: '12px 16px', borderRadius: 8, fontSize: 14, backgroundColor: msg.type === 'success' ? '#dcfce7' : '#fee2e2', color: msg.type === 'success' ? '#166534' : '#991b1b' }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '240px minmax(0, 1fr) 320px', gap: 18, marginTop: 20, alignItems: 'start' }}>
        {/* ---- Theme list ---- */}
        <div style={card}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Themes</h3>
          {themes.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTheme(t.key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 6,
                border: `1px solid ${t.key === currentKey ? '#111' : '#e5e5e5'}`,
                borderRadius: 8, background: t.key === currentKey ? '#f5f5f5' : '#fff', cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
              <div style={{ color: '#999', fontSize: 12 }}>{t.key}</div>
            </button>
          ))}
        </div>

        {/* ---- Canvas ---- */}
        <div style={card}>
          {!current ? (
            <p style={{ color: '#666', fontSize: 14 }}>Select a theme on the left, or create a new one.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                  aria-label="Theme name"
                  value={current.name}
                  onChange={(e) => {
                    setCurrent({ ...current, name: e.target.value });
                    setMetaDirty(true);
                  }}
                  style={{ ...inputField, fontWeight: 600, flex: 1 }}
                />
                <button
                  onClick={deleteCurrent}
                  disabled={bundled}
                  title={bundled ? 'Bundled themes cannot be deleted' : undefined}
                  style={{ ...btnPrimary, background: '#dc2626', opacity: bundled ? 0.5 : 1 }}
                >
                  Delete
                </button>
                {bundled && (
                  <p style={{ width: '100%', fontSize: 13, color: '#666', margin: 0 }}>
                    This is a platform theme. Use “Duplicate theme” to save a copy, including any edits you make here.
                  </p>
                )}
              </div>

              {/* Page tabs */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid #e5e5e5', paddingBottom: 10 }}>
                {PAGE_KEYS.map((p) => (
                  <button
                    key={p}
                    onClick={() => switchPage(p)}
                    style={{
                      padding: '7px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${p === page ? '#111' : '#d4d4d4'}`,
                      background: p === page ? '#111' : '#fff', color: p === page ? '#fff' : '#333', fontWeight: 600,
                    }}
                  >
                    {PAGE_LABELS[p]}
                  </button>
                ))}
              </div>

              {page !== 'home' && <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <label style={{ fontSize: 13 }}>
                  Columns:{' '}
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={layout.columns}
                    onChange={(e) => setLayout({ ...layout, columns: Math.max(1, parseInt(e.target.value) || 12) })}
                    style={{ ...inputField, width: 60 }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  Gap:{' '}
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={layout.gap}
                    onChange={(e) => setLayout({ ...layout, gap: Math.max(0, parseInt(e.target.value) || 0) })}
                    style={{ ...inputField, width: 60 }}
                  />
                </label>
              </div>}

              {/* Drop zone for palette blocks */}
              <div
                data-testid="studio-drop-zone"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={handleDropBlock}
                style={{ minHeight: 300, border: '2px dashed #d4d4d4', borderRadius: 12, padding: 12 }}
              >
                <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
                  {page === 'home' ? 'Homepage template — full-width sections. Add blocks, then use the arrows below to reorder.' : `Layout for “${PAGE_LABELS[page]}” — drag a block here, or reorder / resize blocks below.`}
                </div>
                <div dir={current.features.rtl ? 'rtl' : 'ltr'} style={studioTokenStyle(current.tokens)}>
                  {page === 'home' ? homePreview() : <LayoutRenderer layout={layout} data={studioLayoutData()} />}
                </div>
              </div>

              {/* Block list with grid controls */}
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 14, marginBottom: 8 }}>Blocks</h4>
                {layout.blocks.length === 0 && (
                  <p style={{ color: '#999', fontSize: 13 }}>No blocks yet. Drag one from the palette.</p>
                )}
                {layout.blocks.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBlockId(b.id)}
                    style={{
                      padding: '10px 12px', marginBottom: 8, border: `1px solid ${selectedBlockId === b.id ? '#111' : '#e5e5e5'}`,
                      borderRadius: 8, background: selectedBlockId === b.id ? '#fafafa' : '#fff', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{BLOCK_LABELS[b.type]}</span>
                      <button aria-label={`Remove ${BLOCK_LABELS[b.type]}`} onClick={(e) => { e.stopPropagation(); setLayout(removeBlock(layout, b.id)); setSelectedBlockId(null); }} style={btnGhost}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
                      <button type="button" aria-label={`Move ${BLOCK_LABELS[b.type]} up`} onClick={() => setLayout(page === 'home' ? moveHomeBlock(layout, b.id, -1) : moveBlock(layout, b.id, -1))} style={btnGhost}>↑</button>
                      <button type="button" aria-label={`Move ${BLOCK_LABELS[b.type]} down`} onClick={() => setLayout(page === 'home' ? moveHomeBlock(layout, b.id, 1) : moveBlock(layout, b.id, 1))} style={btnGhost}>↓</button>
                      {page !== 'home' && <>
                      <label>
                        Col{' '}
                        <input type="number" min={1} max={layout.columns} value={b.colStart} onChange={(e) => setLayout(resizeBlock(layout, b.id, 'colStart', parseInt(e.target.value) || 1))} style={{ ...inputField, width: 46 }} />
                      </label>
                      <label>
                        Span{' '}
                        <input type="number" min={1} max={layout.columns} value={b.colSpan} onChange={(e) => setLayout(resizeBlock(layout, b.id, 'colSpan', parseInt(e.target.value) || 1))} style={{ ...inputField, width: 46 }} />
                      </label>
                      <label>
                        Row{' '}
                        <input type="number" min={1} value={b.rowStart} onChange={(e) => setLayout(resizeBlock(layout, b.id, 'rowStart', parseInt(e.target.value) || 1))} style={{ ...inputField, width: 46 }} />
                      </label>
                      <label>
                        Span{' '}
                        <input type="number" min={1} value={b.rowSpan} onChange={(e) => setLayout(resizeBlock(layout, b.id, 'rowSpan', parseInt(e.target.value) || 1))} style={{ ...inputField, width: 46 }} />
                      </label>
                      </>}
                    </div>
                    {selectedBlockId === b.id && (
                      <div style={{ marginTop: 10 }}>
                        <BlockConfigEditor
                          block={b}
                          onChange={(cfg) => setLayout({ ...layout, blocks: layout.blocks.map((x) => (x.id === b.id ? { ...x, config: cfg } : x)) })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ---- Palette + tokens + preview ---- */}
        <div style={card}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Blocks palette</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {paletteBlocks.map((t) => (
              <button
                key={t}
                type="button"
                draggable
                data-testid={`palette-${t}`}
                onClick={() => appendBlock(t)}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', t);
                  e.dataTransfer.effectAllowed = 'copy';
                  draggingTypeRef.current = t;
                }}
                onDragEnd={() => { draggingTypeRef.current = null; }}
                style={{ padding: '8px 10px', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'grab', textAlign: 'center' }}
              >
                {BLOCK_LABELS[t]}
              </button>
            ))}
          </div>

          <h3 style={{ fontSize: 15, margin: '18px 0 10px' }}>Theme styles</h3>
          <TokenEditor
            tokens={{ ...getDefaultTheme().tokens, ...current?.tokens }}
            onTokenChange={setToken}
            features={current?.features}
            onFeatureChange={(k, v) => {
              if (!current) return;
              setCurrent({ ...current, features: { ...current.features, [k]: v } });
              setMetaDirty(true);
            }}
          />

          <h3 style={{ fontSize: 15, margin: '18px 0 10px' }}>Template preview · sample content</h3>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['desktop', 'tablet', 'phone'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPreviewMode(mode)}
                style={{
                  ...previewModeButton,
                  ...(previewMode === mode ? previewModeButtonActive : {}),
                }}
              >
                {mode === 'desktop' ? 'Desktop' : mode === 'tablet' ? 'Tablet' : 'Phone'}
              </button>
            ))}
          </div>
          <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, background: '#fff', overflowX: 'auto' }}>
            {/* The preview renders at the chosen device width (fixed), scrollable
                horizontally inside this narrow panel so each mode genuinely shows
                that width — otherwise the ~296px panel would force phone-width
                everywhere and the container-query stacking would always fire. */}
            <div
              style={{
                width: PREVIEW_WIDTHS[previewMode],
                minWidth: '100%',
                padding: 12,
              }}
            >
              <div
                dir={current?.features.rtl ? 'rtl' : 'ltr'}
                data-testid="studio-preview-dir"
                style={studioTokenStyle(current?.tokens ?? {})}
              >
                {page === 'home' ? (
                  homePreview()
                ) : (
                  <LayoutRenderer layout={layout} data={studioLayoutData()} />
                )}
              </div>
            </div>
          </div>
          {studioLivePreviewPath(page, livePreviewKey) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#666' }}>
                  {page === 'home' ? 'Saved storefront homepage · not the template above' : `Live storefront ${PAGE_LABELS[page]}`}
                </span>
                <button type="button" onClick={() => setLivePreviewKey((k) => k + 1)} style={btnGhost}>Refresh</button>
              </div>
              <iframe
                title="Saved storefront preview"
                src={studioLivePreviewPath(page, livePreviewKey)!}
                style={{ width: '100%', height: 280, border: '1px solid #e5e5e5', borderRadius: 8, background: '#fff' }}
              />
            </div>
          )}
        </div>
      </div>
    </fieldset>
    </div>
  );
}

function BlockConfigEditor({ block, onChange }: { block: LayoutBlock; onChange: (c: Record<string, unknown>) => void }) {
  const fields = configFieldsFor(block.type);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {fields.map((f) => {
        if (f.type === 'select') {
          return (
            <label key={f.key} style={{ fontSize: 13 }}>
              {f.label}
              <select
                value={String(block.config[f.key] ?? f.options?.[0] ?? '')}
                onChange={(e) => onChange({ ...block.config, [f.key]: e.target.value })}
                style={{ ...inputField, marginTop: 4, width: '100%' }}
              >
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          );
        }
        return (
          <label key={f.key} style={{ fontSize: 13 }}>
            {f.label}
            <input
              type={f.type === 'number' ? 'number' : 'text'}
              value={String(block.config[f.key] ?? '')}
              onChange={(e) =>
                onChange({
                  ...block.config,
                  [f.key]: f.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value,
                })
              }
              style={{ ...inputField, marginTop: 4 }}
            />
          </label>
        );
      })}
      {(block.type === 'richText' || block.type === 'custom') && (
        <label style={{ fontSize: 13 }}>
          HTML
          <textarea
            value={String(block.config.html ?? '')}
            onChange={(e) => onChange({ ...block.config, html: e.target.value })}
            style={{ ...inputField, marginTop: 4, minHeight: 80 }}
          />
        </label>
      )}
      {LIST_BLOCK_TYPES.includes(block.type) && (
        <label style={{ fontSize: 13 }}>
          Items (JSON array)
          <textarea
            value={JSON.stringify(itemsOfConfig(block.config), null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value || '[]');
                if (Array.isArray(parsed)) onChange({ ...block.config, items: parsed });
              } catch {
                // Leave the textarea as-is while it's mid-edit.
              }
            }}
            spellCheck={false}
            style={{ ...inputField, marginTop: 4, minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
          />
        </label>
      )}
    </div>
  );
}

/** Read the items array (defaulting to [] for the JSON editor). */
function itemsOfConfig(config: Record<string, unknown>): unknown[] {
  return Array.isArray(config.items) ? config.items : [];
}

function configFieldsFor(type: BlockType): ConfigField[] {
  if (CONFIG_FIELDS[type]) return CONFIG_FIELDS[type]!;
  switch (type) {
    case 'hero':
      return [
        { key: 'title', label: 'Title' },
        { key: 'subtitle', label: 'Subtitle' },
      ];
    case 'categories':
    case 'featured':
    case 'newArrivals':
    case 'trending':
      return [
        { key: 'title', label: 'Title' },
        { key: 'limit', label: 'Item limit' },
        { key: 'perRow', label: 'Items per row' },
      ];
    default:
      return [{ key: 'title', label: 'Title' }];
  }
}

function TokenEditor({
  tokens,
  onTokenChange,
  features,
  onFeatureChange,
}: {
  tokens: Record<string, string | number | boolean>;
  onTokenChange: (k: string, v: any) => void;
  features?: { rtl: boolean; darkMode: boolean; paid: boolean };
  onFeatureChange?: (k: 'rtl' | 'darkMode', v: boolean) => void;
}) {
  const colors = [...DESIGN_COLOR_FIELDS, ...ANNOUNCEMENT_COLOR_FIELDS];
  const fontKeys = Object.keys(FONT_STACKS);
  const fontValue = String(tokens.fontFamily ?? 'vazirmatn');
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {colors.map(({ key: k, label }) => (
        <label key={k} style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{label}</span>
          <input type="color" value={String(tokens[k] ?? '#000000')} onChange={(e) => onTokenChange(k, e.target.value)} style={{ width: 40, height: 26, border: 'none', background: 'none', cursor: 'pointer' }} />
        </label>
      ))}
      {onFeatureChange && features && (
        <>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>RTL storefront</span>
            <input type="checkbox" checked={features.rtl} onChange={(e) => onFeatureChange('rtl', e.target.checked)} />
          </label>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Dark mode ready</span>
            <input type="checkbox" checked={features.darkMode} onChange={(e) => onFeatureChange('darkMode', e.target.checked)} />
          </label>
        </>
      )}
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Font</span>
        <select value={fontKeys.includes(fontValue) ? fontValue : 'system'} onChange={(e) => onTokenChange('fontFamily', e.target.value)} style={{ ...inputField, width: 150 }}>
          {fontKeys.map((k) => (
            <option key={k} value={k}>{FONT_LABELS[k] ? FONT_LABELS[k].split('—')[0].trim() : k}</option>
          ))}
        </select>
      </label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Font size</span>
        <input type="number" min={12} max={22} value={Number(tokens.baseFontSize ?? 16)} onChange={(e) => onTokenChange('baseFontSize', Math.max(12, Math.min(22, parseInt(e.target.value) || 16)))} style={{ ...inputField, width: 70 }} />
      </label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Radius</span>
        <input type="number" min={0} max={40} value={Number(tokens.radius ?? 8)} onChange={(e) => onTokenChange('radius', Math.max(0, Math.min(40, parseInt(e.target.value) || 0)))} style={{ ...inputField, width: 70 }} />
      </label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Button radius</span>
        <input type="number" min={0} max={40} value={Number(tokens.buttonRadius ?? tokens.radius ?? 8)} onChange={(e) => onTokenChange('buttonRadius', Math.max(0, Math.min(40, parseInt(e.target.value) || 0)))} style={{ ...inputField, width: 70 }} />
      </label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Heading weight</span>
        <input type="number" min={400} max={900} step={100} value={Number(tokens.headingWeight ?? 800)} onChange={(e) => onTokenChange('headingWeight', Math.max(400, Math.min(900, parseInt(e.target.value) || 800)))} style={{ ...inputField, width: 70 }} />
      </label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Container width</span>
        <input type="number" min={960} max={1920} value={Number(tokens.containerWidth ?? 1200)} onChange={(e) => onTokenChange('containerWidth', Math.max(960, Math.min(1920, parseInt(e.target.value) || 1200)))} style={{ ...inputField, width: 70 }} />
      </label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Products per row</span>
        <input type="number" min={2} max={6} value={Number(tokens.productsPerRow ?? 4)} onChange={(e) => onTokenChange('productsPerRow', Math.max(2, Math.min(6, parseInt(e.target.value) || 4)))} style={{ ...inputField, width: 70 }} />
      </label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Card shadow</span>
        <select value={String(tokens.cardShadow ?? 'soft')} onChange={(e) => onTokenChange('cardShadow', e.target.value)} style={{ ...inputField, width: 90 }}>
          <option value="none">None</option>
          <option value="soft">Soft</option>
          <option value="strong">Strong</option>
        </select>
      </label>
      <p style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
        The shop’s announcement message and custom CSS are edited in <a href={appearanceHref('announcement')}>Appearance</a>, not in a theme template.
      </p>
    </div>
  );
}

const card: React.CSSProperties = { minWidth: 0, border: '1px solid #e5e5e5', borderRadius: 12, padding: 18, background: '#fff' };
const btnPrimary: React.CSSProperties = { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnGhost: React.CSSProperties = { padding: '4px 8px', border: '1px solid #d4d4d4', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 };
const inputField: React.CSSProperties = { padding: '7px 9px', border: '1px solid #d4d4d4', borderRadius: 6, fontSize: 13 };
const previewModeButton: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid #d4d4d4', borderRadius: 6, fontSize: 13,
  background: '#fff', color: '#333', cursor: 'pointer',
};
const previewModeButtonActive: React.CSSProperties = {
  background: 'var(--brand, #111)', color: '#fff', border: '1px solid transparent',
};
