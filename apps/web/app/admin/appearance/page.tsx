// /admin/appearance - the look & feel editor, tabbed:
//   - theme: pick a theme (bundled + installed via the runtime catalog;
//     the API validates the active key against the on-disk catalog, so an
//     installed theme is activatable immediately), install a theme .zip,
//     and remove installed themes
//   - colors / typography / layout / sections / announcement: the
//     Theme fields, saved as one blob via PUT /api/theme (including
//     the customCss tab, which the server scans for script tags)
//   - home: the home-page block editor (the HomeSection rows)
// The live preview at /preview/<key> renders the same theme with
// sample data.
'use client';

import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '@/lib/hooks';
import { LoadingState, ButtonSpinner } from '@/components/Spinner';
import { DEFAULT_THEME, FONT_LABELS, FONT_STACKS, Theme } from '@/lib/theme';
import { API_BASE } from '@/lib/http';
import HomeBuilder from '@/components/HomeBuilder';
import { applyThemeHomeLayout } from '@/lib/homeSections';
import { ThemePicker } from './ThemePicker';
import { THEMES, type ThemeConfig } from '@/lib/themeRegistry';
import { fetchThemeCatalog, resolveThemeConfig } from '@/lib/themeRuntime';
import { mergePickedTheme } from '@/lib/mergePickedTheme';

const COLOR_FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: 'primaryColor', label: 'Primary / buttons', hint: 'Buttons, active states, brand accents' },
  { key: 'primaryTextColor', label: 'Text on primary', hint: 'Label colour inside primary buttons' },
  { key: 'accentColor', label: 'Accent', hint: 'Links and highlights' },
  { key: 'bodyBg', label: 'Page background', hint: 'Main background of every page' },
  { key: 'cardBg', label: 'Card / panel background', hint: 'Product cards, forms, summary boxes' },
  { key: 'bodyText', label: 'Body text', hint: 'Default text colour' },
  { key: 'mutedText', label: 'Muted text', hint: 'Captions, secondary labels' },
  { key: 'borderColor', label: 'Borders', hint: 'Card and input outlines' },
  { key: 'headerBg', label: 'Header background', hint: 'Top navigation bar' },
  { key: 'headerText', label: 'Header text', hint: 'Navigation links' },
  { key: 'footerBg', label: 'Footer background', hint: '' },
  { key: 'footerText', label: 'Footer text', hint: '' },
  { key: 'priceColor', label: 'Price', hint: 'Product price colour' },
  { key: 'saleColor', label: 'Sale / discount', hint: 'Discount badges' },
];

const PRESETS: { name: string; swatch: string; values: Partial<Theme> }[] = [
  {
    name: 'Classic',
    swatch: '#111111',
    values: { primaryColor: '#111111', primaryTextColor: '#ffffff', accentColor: '#2563eb', bodyBg: '#ffffff', cardBg: '#ffffff', mutedText: '#666666', borderColor: '#e5e5e5', headerText: '#111111', footerText: '#111111', headerBg: '#ffffff', footerBg: '#fafafa', bodyText: '#111111', priceColor: '#111111' },
  },
  {
    name: 'Ocean',
    swatch: '#0369a1',
    values: { primaryColor: '#0369a1', primaryTextColor: '#ffffff', accentColor: '#0ea5e9', bodyBg: '#f8fafc', cardBg: '#ffffff', mutedText: '#64748b', borderColor: '#e2e8f0', headerText: '#0f172a', footerText: '#0f172a', headerBg: '#ffffff', footerBg: '#e0f2fe', bodyText: '#0f172a', priceColor: '#0369a1' },
  },
  {
    name: 'Forest',
    swatch: '#166534',
    values: { primaryColor: '#166534', primaryTextColor: '#ffffff', accentColor: '#16a34a', bodyBg: '#f7fdf9', cardBg: '#ffffff', mutedText: '#4b6b57', borderColor: '#d7eadd', headerText: '#14532d', footerText: '#14532d', headerBg: '#ffffff', footerBg: '#dcfce7', bodyText: '#14532d', priceColor: '#166534' },
  },
  {
    name: 'Sunset',
    swatch: '#c2410c',
    values: { primaryColor: '#c2410c', primaryTextColor: '#ffffff', accentColor: '#f97316', bodyBg: '#fffbf7', cardBg: '#ffffff', mutedText: '#7c5b4a', borderColor: '#f3e0d3', headerText: '#431407', footerText: '#431407', headerBg: '#ffffff', footerBg: '#ffedd5', bodyText: '#431407', priceColor: '#c2410c' },
  },
  {
    name: 'Royal',
    swatch: '#6d28d9',
    values: { primaryColor: '#6d28d9', primaryTextColor: '#ffffff', accentColor: '#8b5cf6', bodyBg: '#fdfaff', cardBg: '#ffffff', mutedText: '#6b5b7f', borderColor: '#ece1f7', headerText: '#2e1065', footerText: '#2e1065', headerBg: '#ffffff', footerBg: '#f3e8ff', bodyText: '#2e1065', priceColor: '#6d28d9' },
  },
  {
    name: 'Midnight',
    swatch: '#0f172a',
    values: { primaryColor: '#e2e8f0', primaryTextColor: '#0f172a', accentColor: '#38bdf8', bodyBg: '#0f172a', cardBg: '#1e293b', bodyText: '#e2e8f0', mutedText: '#94a3b8', borderColor: '#1e293b', headerBg: '#0f172a', headerText: '#e2e8f0', footerBg: '#020617', footerText: '#e2e8f0', priceColor: '#e2e8f0' },
  },
];

const SECTIONS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: 'showAnnouncement', label: 'Announcement bar', hint: 'Strip above the header' },
  { key: 'showCategories', label: 'Shop by Category', hint: 'Category tiles on the home page' },
  { key: 'showFeatured', label: 'Featured Products', hint: '' },
  { key: 'showNewArrivals', label: 'New Arrivals carousel', hint: '' },
  { key: 'showTrustBar', label: 'Trust bar', hint: 'Free shipping / returns / support' },
  { key: 'showDealCountdown', label: 'Deal countdown', hint: 'Deal of the day banner' },
  { key: 'showTestimonials', label: 'Testimonials', hint: 'Customer quotes' },
  { key: 'showStats', label: 'Stats strip', hint: 'Animated counters' },
  { key: 'showNewsletter', label: 'Newsletter signup', hint: '' },
];

type Tab = 'theme' | 'colors' | 'typography' | 'layout' | 'home' | 'sections' | 'announcement' | 'css';

export default function AdminAppearancePage() {
  const isMobile = useIsMobile();
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [tab, setTab] = useState<Tab>('theme');

  // Themes installed at runtime (developer .zip packages). They are not in
  // the web bundle, so the picker merges them with the bundled registry;
  // installing / removing goes through the API and refreshes this list.
  const [installedThemes, setInstalledThemes] = useState<ThemeConfig[]>([]);
  const [installing, setInstalling] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const token = () => localStorage.getItem('token');

  const refreshInstalledThemes = async () => {
    try {
      const { themes } = await fetchThemeCatalog();
      // Only themes the bundle doesn't know are "installed"; bundled keys
      // stay managed by the platform registry.
      const staticKeys = new Set(THEMES.map((t) => t.key));
      setInstalledThemes(themes.filter((t) => !staticKeys.has(t.key)));
    } catch {
      setInstalledThemes([]);
    }
  };

  useEffect(() => {
    refreshInstalledThemes();
  }, []);

  /**
   * Install a theme package (.zip) via the API. The package is validated
   * end-to-end server-side (zip-slip, schema, bundled-key protection)
   * before anything is written. On success the catalog refreshes and the
   * storefront is told to reload its theme.
   */
  const installTheme = async (file: File | null) => {
    if (!file) return;
    setInstalling(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/theme-studio/install`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || `Install failed (HTTP ${res.status}).`);
      await refreshInstalledThemes();
      notify('success', `Theme "${body?.data?.name ?? body?.data?.key}" installed — pick it above to activate.`);
      window.dispatchEvent(new Event('themeChange'));
    } catch (e: any) {
      notify('error', e?.message || 'Could not install the theme.');
    } finally {
      setInstalling(false);
    }
  };

  /**
   * Remove an installed theme. The API refuses bundled themes; if the
   * removed theme was the store's active one, the API switches the store
   * back to the default theme and says so.
   */
  const removeTheme = async (key: string) => {
    if (!window.confirm(`Remove theme "${key}"? This cannot be undone. If it is the store's active theme, the store will switch back to the default theme.`)) {
      return;
    }
    setRemovingKey(key);
    try {
      const res = await fetch(`${API_BASE}/theme-studio/themes/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || `Remove failed (HTTP ${res.status}).`);
      await refreshInstalledThemes();
      notify('success', body?.message || `Theme "${key}" removed.`);
      window.dispatchEvent(new Event('themeChange'));
    } catch (e: any) {
      notify('error', e?.message || 'Could not remove the theme.');
    } finally {
      setRemovingKey(null);
    }
  };

  // `loadFailed` matters: if the GET fails we must NOT present the shipped
  // defaults as if they were the stored settings. Doing that made the page
  // look like it had "lost" the admin's theme, and saving from that state
  // would overwrite the real settings in the database with defaults.
  const [loadFailed, setLoadFailed] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/theme`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.message || `Could not load the theme (HTTP ${r.status}).`);
        }
        return r.json();
      })
      .then((d) => d.data && setTheme({ ...DEFAULT_THEME, ...d.data }))
      .catch((err) =>
        setLoadFailed(
          `${err?.message || 'Could not reach the API.'} ` +
            'The values below are the shipped defaults, NOT your saved settings — ' +
            'saving now would overwrite them. Start the API, then reload this page.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setTheme((t) => ({ ...t, [k]: v }));

  const notify = (type: string, text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 5000);
  };

  const save = async () => {
    if (loadFailed) {
      notify(
        'error',
        'Refusing to save: this page never loaded your saved theme, so saving ' +
          'would replace it with the defaults. Reload once the API is running.'
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(theme),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        notify('error', e.message || `Save failed (${res.status}). Nothing was stored.`);
        return;
      }
      const saved = await res.json();
      setTheme({ ...DEFAULT_THEME, ...saved.data });
      localStorage.setItem('themeSettings', JSON.stringify(saved.data));
      // Repaint every open tab of the storefront immediately.
      window.dispatchEvent(new Event('themeChange'));
      notify('success', 'Appearance saved. Your storefront has been updated.');
    } catch {
      notify('error', 'Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm('Reset every appearance setting back to the defaults?')) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/theme/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        const d = await res.json();
        setTheme({ ...DEFAULT_THEME, ...d.data });
        localStorage.setItem('themeSettings', JSON.stringify(d.data));
        window.dispatchEvent(new Event('themeChange'));
        notify('success', 'Appearance reset to defaults.');
      }
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (values: Partial<Theme>) => setTheme((t) => ({ ...t, ...values }));

  if (loading) return <LoadingState message="Loading appearance…" minHeight={400} />;

  const label: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' };
  const input: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: '1px solid #d4d4d4',
    borderRadius: '6px', fontSize: '14px',
  };
  const card: React.CSSProperties = {
    border: '1px solid #e5e5e5', borderRadius: '10px', padding: '20px', backgroundColor: '#fff',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700 }}>Appearance</h1>
          <p style={{ color: '#666', marginTop: '4px', fontSize: '14px' }}>
            Change how your storefront looks — colours, fonts, layout and which sections appear.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a href="/admin/theme-studio" style={{ padding: '10px 16px', border: '1px solid #d4d4d4', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontWeight: 600, textDecoration: 'none', color: '#111', display: 'inline-flex', alignItems: 'center' }}>
            🧩 Theme Studio
          </a>
          <button onClick={reset} disabled={saving} style={{ padding: '10px 16px', border: '1px solid #d4d4d4', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Reset
          </button>
          <button onClick={save} disabled={saving} style={{ padding: '10px 22px', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'default' : 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {saving ? <><ButtonSpinner /> Saving…</> : 'Save changes'}
          </button>
        </div>
      </div>

      {loadFailed && (
        <div style={{
          marginTop: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '14px',
          backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
        }}>
          <strong>Settings not loaded.</strong> {loadFailed}
        </div>
      )}

      {msg.text && (
        <div style={{
          marginTop: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '14px',
          backgroundColor: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'success' ? '#166534' : '#991b1b',
        }}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '22px', flexWrap: 'wrap', borderBottom: '1px solid #e5e5e5', paddingBottom: '10px' }}>
        {([
          ['theme', '🎨 Theme'],
          ['colors', '🎨 Colours'],
          ['typography', '🔤 Typography'],
          ['layout', '📐 Layout'],
          ['home', '🏠 Home page'],
          ['sections', '🧩 Sections'],
          ['announcement', '📣 Announcement'],
          ['css', '⚙️ Custom CSS'],
        ] as [Tab, string][]).map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 14px', borderRadius: '999px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            border: tab === t ? '1px solid #111' : '1px solid #e5e5e5',
            backgroundColor: tab === t ? '#111' : '#fff',
            color: tab === t ? '#fff' : '#111',
          }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* The home page builder and the theme picker both need the full
          width - their content is wide and the small colour preview on
          the right is irrelevant. Other tabs share the width with the
          preview pane. */}
      {tab === 'home' || tab === 'theme' ? (
        <div style={{ marginTop: '22px' }}>
          {tab === 'home' ? (
            <HomeBuilder />
          ) : (
            <ThemeTab
              activeTheme={(theme as any).activeTheme as string | null}
              installedThemes={installedThemes}
              onPick={(key) => {
                const picked = resolveThemeConfig(key);
                setTheme((t) => mergePickedTheme(t, picked));
                notify('success', `Theme "${picked.name}" selected. Click Save to apply.`);
              }}
              onInstall={installTheme}
              onRemove={removeTheme}
              installing={installing}
              removingKey={removingKey}
              disabled={saving}
            />
          )}
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: '22px', marginTop: '22px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '18px' }}>
          {tab === 'colors' && (
            <>
              <div style={card}>
                <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Presets</h3>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '14px' }}>
                  A quick starting point — you can fine-tune every colour afterwards.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {PRESETS.map((p) => (
                    <button key={p.name} onClick={() => applyPreset(p.values)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
                      border: '1px solid #e5e5e5', borderRadius: '999px', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                    }}>
                      <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: p.swatch, border: '1px solid rgba(0,0,0,.15)' }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={card}>
                <h3 style={{ fontWeight: 700, marginBottom: '14px' }}>Colours</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  {COLOR_FIELDS.map((f) => (
                    <div key={f.key as string}>
                      <label style={label}>{f.label}</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={String(theme[f.key] ?? '#000000')}
                          onChange={(e) => set(f.key, e.target.value as never)}
                          style={{ width: '46px', height: '38px', padding: '2px', border: '1px solid #d4d4d4', borderRadius: '6px', cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={String(theme[f.key] ?? '')}
                          onChange={(e) => set(f.key, e.target.value as never)}
                          style={{ ...input, fontFamily: 'monospace' }}
                        />
                      </div>
                      {f.hint && <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{f.hint}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'typography' && (
            <div style={card}>
              <h3 style={{ fontWeight: 700, marginBottom: '14px' }}>Typography</h3>
              <div style={{ display: 'grid', gap: '18px' }}>
                <div>
                  <label style={label}>Font family</label>
                  <select value={theme.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} style={input}>
                    {/* Kurdish / Arabic-script faces first: this is a
                        Kurdish store, and they are what make کوردی text
                        render professionally. */}
                    {Object.keys(FONT_STACKS).map((key) => (
                      <option key={key} value={key}>
                        {FONT_LABELS[key] || key}
                      </option>
                    ))}
                  </select>
                  {/* Preview in BOTH scripts: the Latin line shows the
                      face, the Kurdish line shows what the storefront
                      will actually look like (the Arabic fallback in the
                      stack is exercised here too). */}
                  <p dir="ltr" style={{ marginTop: '10px', padding: '12px', border: '1px dashed #e0e0e0', borderRadius: '8px', fontFamily: FONT_STACKS[theme.fontFamily] }}>
                    The quick brown fox jumps over the lazy dog — 0123456789
                  </p>
                  <p dir="rtl" style={{ marginTop: '8px', padding: '12px', border: '1px dashed #e0e0e0', borderRadius: '8px', fontFamily: FONT_STACKS[theme.fontFamily], fontSize: '17px' }}>
                    دکانی ئۆنلاین — گەشتی خێرای بە ڕێگای لایەنی کەم
                  </p>
                </div>
                <div>
                  <label style={label}>Base font size — {theme.baseFontSize}px</label>
                  <input type="range" min={12} max={22} value={theme.baseFontSize}
                    onChange={(e) => set('baseFontSize', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={label}>Heading weight — {theme.headingWeight}</label>
                  <input type="range" min={400} max={900} step={100} value={theme.headingWeight}
                    onChange={(e) => set('headingWeight', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          )}

          {tab === 'layout' && (
            <div style={card}>
              <h3 style={{ fontWeight: 700, marginBottom: '14px' }}>Layout &amp; shape</h3>
              <div style={{ display: 'grid', gap: '18px' }}>
                <div>
                  <label style={label}>Corner radius — {theme.radius}px</label>
                  <input type="range" min={0} max={28} value={theme.radius}
                    onChange={(e) => set('radius', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={label}>Button radius — {theme.buttonRadius}px</label>
                  <input type="range" min={0} max={28} value={theme.buttonRadius}
                    onChange={(e) => set('buttonRadius', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={label}>Content width — {theme.containerWidth}px</label>
                  <input type="range" min={960} max={1600} step={20} value={theme.containerWidth}
                    onChange={(e) => set('containerWidth', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={label}>Products per row (desktop) — {theme.productsPerRow}</label>
                  <input type="range" min={2} max={6} value={theme.productsPerRow}
                    onChange={(e) => set('productsPerRow', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={label}>Card shadow</label>
                  <select value={theme.cardShadow} onChange={(e) => set('cardShadow', e.target.value as Theme['cardShadow'])} style={input}>
                    <option value="none">None (flat)</option>
                    <option value="soft">Soft</option>
                    <option value="strong">Strong</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === 'sections' && (
            <div style={card}>
              <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Home page sections</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '14px' }}>
                Turn parts of the storefront on or off. Changes apply immediately after saving.
              </p>
              <p style={{ fontSize: '13px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px' }}>
                These are the original master switches and they still win: a section switched off
                here stays hidden even if it is marked visible under{' '}
                <strong>🏠 Home page</strong>. Use the Home page tab to reorder and re-word blocks.
              </p>
              <div style={{ display: 'grid', gap: '10px' }}>
                {SECTIONS.map((sct) => (
                  <label key={sct.key as string} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                    border: '1px solid #eee', borderRadius: '8px', cursor: 'pointer',
                    backgroundColor: theme[sct.key] ? '#f8fffa' : '#fafafa',
                  }}>
                    <input type="checkbox" checked={Boolean(theme[sct.key])}
                      onChange={(e) => set(sct.key, e.target.checked as never)} />
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>{sct.label}</span>
                      {sct.hint && <span style={{ display: 'block', fontSize: '12px', color: '#888' }}>{sct.hint}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'announcement' && (
            <div style={card}>
              <h3 style={{ fontWeight: 700, marginBottom: '14px' }}>Announcement bar</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '14px' }}>
                <input type="checkbox" checked={theme.showAnnouncement}
                  onChange={(e) => set('showAnnouncement', e.target.checked)} />
                Show the announcement bar
              </label>
              <div style={{ display: 'grid', gap: '14px' }}>
                <div>
                  <label style={label}>Message</label>
                  <input type="text" value={theme.announcementText || ''} placeholder="Free shipping on orders over 50!"
                    onChange={(e) => set('announcementText', e.target.value)} style={input} />
                </div>
                <div>
                  <label style={label}>Link (optional)</label>
                  <input type="text" value={theme.announcementLink || ''} placeholder="/deals"
                    onChange={(e) => set('announcementLink', e.target.value)} style={input} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={label}>Background</label>
                    <input type="color" value={theme.announcementBg}
                      onChange={(e) => set('announcementBg', e.target.value)}
                      style={{ ...input, height: '40px', padding: '3px' }} />
                  </div>
                  <div>
                    <label style={label}>Text colour</label>
                    <input type="color" value={theme.announcementText2}
                      onChange={(e) => set('announcementText2', e.target.value)}
                      style={{ ...input, height: '40px', padding: '3px' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'css' && (
            <div style={card}>
              <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Custom CSS</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
                Applied to every storefront page. <code>&lt;script&gt;</code>, <code>javascript:</code> and{' '}
                <code>expression()</code> are rejected for safety.
              </p>
              <textarea
                value={theme.customCss || ''}
                onChange={(e) => set('customCss', e.target.value)}
                spellCheck={false}
                placeholder={'.product-card:hover { transform: translateY(-6px); }'}
                style={{ ...input, minHeight: '260px', fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.6 }}
              />
            </div>
          )}
        </div>

        {/* Live preview */}
        <div style={{ position: isMobile ? 'static' : 'sticky', top: '16px' }}>
          <div style={{ ...card, padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: '14px' }}>
              Live preview
            </div>
            <div style={{ backgroundColor: theme.bodyBg, color: theme.bodyText, fontFamily: FONT_STACKS[theme.fontFamily], fontSize: `${theme.baseFontSize}px` }}>
              {theme.showAnnouncement && theme.announcementText && (
                <div style={{ backgroundColor: theme.announcementBg, color: theme.announcementText2, textAlign: 'center', padding: '7px', fontSize: '12px', fontWeight: 600 }}>
                  {theme.announcementText}
                </div>
              )}
              <div style={{ backgroundColor: theme.headerBg, color: theme.headerText, padding: '12px 16px', borderBottom: `1px solid ${theme.borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontWeight: theme.headingWeight }}>My Store</strong>
                <span style={{ fontSize: '12px', color: theme.mutedText }}>Products · Cart</span>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{
                  border: `1px solid ${theme.borderColor}`,
                  borderRadius: `${theme.radius}px`,
                  overflow: 'hidden',
                  boxShadow: theme.cardShadow === 'none' ? 'none' : theme.cardShadow === 'strong' ? '0 10px 30px rgba(0,0,0,.12)' : '0 1px 3px rgba(0,0,0,.06)',
                }}>
                  <div style={{ height: '96px', background: 'linear-gradient(135deg,#eee,#f7f7f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.mutedText, fontSize: '12px' }}>
                    product image
                  </div>
                  <div style={{ padding: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Sample Product</div>
                    <div style={{ marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 800, color: theme.priceColor }}>$29.99</span>
                      <span style={{ fontSize: '12px', color: theme.saleColor, fontWeight: 700 }}>-20%</span>
                    </div>
                    <button style={{
                      marginTop: '10px', width: '100%', padding: '9px',
                      backgroundColor: theme.primaryColor, color: theme.primaryTextColor,
                      border: 'none', borderRadius: `${theme.buttonRadius}px`, fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    }}>
                      Add to cart
                    </button>
                  </div>
                </div>
                <p style={{ marginTop: '12px', fontSize: '12px', color: theme.mutedText }}>
                  Muted caption text · <span style={{ color: theme.accentColor }}>a link</span>
                </p>
              </div>
              <div style={{ backgroundColor: theme.footerBg, color: theme.footerText, padding: '14px 16px', fontSize: '12px', borderTop: `1px solid ${theme.borderColor}` }}>
                © 2026 My Store
              </div>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '10px', lineHeight: 1.6 }}>
            The preview updates as you edit. Nothing changes on the live storefront until you press{' '}
            <strong>Save changes</strong>.
          </p>
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * Theme tab content.
 *
 * Renders the ThemePicker (bundled + installed themes) plus the
 * install / remove management for runtime-installed themes. Kept as a
 * local component so the page's render function doesn't have
 * to inline 30+ lines of JSX for one tab.
 *
 * The `onPick` callback is the parent's responsibility: it
 * receives the theme key, looks up the new tokens, and
 * updates the page's theme state. The picker is dumb on
 * purpose.
 */
function ThemeTab({
  activeTheme,
  installedThemes,
  onPick,
  onInstall,
  onRemove,
  installing,
  removingKey,
  disabled,
}: {
  activeTheme: string | null;
  installedThemes: ThemeConfig[];
  onPick: (key: string) => void;
  onInstall: (file: File | null) => void;
  onRemove: (key: string) => void;
  installing: boolean;
  removingKey: string | null;
  disabled: boolean;
}) {
  const [pickFile, setPickFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The page persists `activeTheme` as a separate field on the
  // theme record (added in the multi-theme migration). The
  // picker reads it via props; this component is just the
  // presentation layer.
  //
  // Why is the active theme not in local state? Because the
  // page's `theme` state is the source of truth (it gets
  // loaded from /theme, saved back to /theme). The picker is
  // a controlled component: it renders what the parent
  // tells it, and tells the parent when the user picked
  // something.
  return (
    <div>
      <div
        style={{
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          borderRadius: '10px',
          marginBottom: '18px',
        }}
      >
        <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Choose your theme</h3>
        <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
          Pick a starting point. Each theme sets the design tokens (colours, fonts,
          layout). You can fine-tune individual values in the other tabs after picking.
        </p>
      </div>
      <ThemePicker
        activeTheme={activeTheme}
        onSelect={onPick}
        disabled={disabled}
        themes={[...THEMES, ...installedThemes]}
      />
      {activeTheme && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={async () => {
              if (
                !window.confirm(
                  'Replace the live homepage with this theme’s home layout? Current Home page blocks will be deleted.',
                )
              )
                return;
              try {
                const { message } = await applyThemeHomeLayout(activeTheme);
                window.alert(message || 'Live home now matches this theme.');
              } catch (e: any) {
                window.alert(e?.message || 'Could not apply the theme home.');
              }
            }}
            disabled={disabled}
            style={{
              padding: '10px 16px',
              border: '1px solid #111',
              borderRadius: 8,
              background: '#111',
              color: '#fff',
              fontWeight: 700,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            Apply this theme’s homepage
          </button>
          <p style={{ fontSize: 12, color: '#666', marginTop: 8, maxWidth: 520 }}>
            Tokens apply when you Save. The homepage is separate — this copies the theme’s
            home layout into Appearance → Home in one step.
          </p>
        </div>
      )}

      {/* Install / remove runtime-installed themes */}
      <div
        style={{
          marginTop: '18px',
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          borderRadius: '10px',
        }}
      >
        <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Install a theme</h3>
        <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px' }}>
          Upload a theme package (.zip) built with the developer toolkit. It is
          validated on the server and appears in the gallery immediately — no
          rebuild or deploy needed. Re-uploading the same key updates the theme.
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={(e) => setPickFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: '13px' }}
          />
          <button
            type="button"
            onClick={() => {
              if (pickFile) onInstall(pickFile);
            }}
            disabled={installing || !pickFile}
            data-testid="install-theme-button"
            style={{
              minHeight: '36px',
              padding: '8px 14px',
              backgroundColor: installing || !pickFile ? '#f5f5f5' : '#111',
              color: installing || !pickFile ? '#999' : '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: installing || !pickFile ? 'not-allowed' : 'pointer',
            }}
          >
            {installing ? 'Installing…' : 'Install theme'}
          </button>
        </div>

        {installedThemes.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontWeight: 700, margin: '0 0 4px', fontSize: '14px' }}>
              Installed themes
            </h4>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 8px' }}>
              Bundled platform themes cannot be removed. Removing the active
              theme switches the store back to the default theme.
            </p>
            {installedThemes.map((t) => (
              <div
                key={t.key}
                data-testid={`installed-theme-${t.key}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: '14px' }}>{t.name}</strong>
                  <span style={{ color: '#888', fontSize: '12px', marginLeft: '8px' }}>
                    v{t.version} · {t.author}
                  </span>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '12px',
                      color: '#666',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(t.key)}
                  disabled={removingKey === t.key}
                  data-testid={`remove-theme-${t.key}`}
                  style={{
                    flexShrink: 0,
                    minHeight: '32px',
                    padding: '6px 12px',
                    backgroundColor: removingKey === t.key ? '#f5f5f5' : '#fff',
                    color: removingKey === t.key ? '#999' : '#dc2626',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: removingKey === t.key ? 'not-allowed' : 'pointer',
                  }}
                >
                  {removingKey === t.key ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


