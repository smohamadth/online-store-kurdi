// Appearance edits the running shop. Studio edits reusable theme definitions.
// Homepage blocks have their own editor/save API; never hide that distinction
// behind a global appearance Save button or legacy theme.show* switches.
'use client';

import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '@/lib/hooks';
import { useDesignNavigationGuard } from '@/lib/useDesignNavigationGuard';
import { LoadingState, ButtonSpinner } from '@/components/Spinner';
import { DEFAULT_THEME, FONT_LABELS, FONT_STACKS, Theme } from '@/lib/theme';
import { API_BASE } from '@/lib/http';
import HomeBuilder from '@/components/HomeBuilder';
import ReplaceHomepageButton from '@/components/ReplaceHomepageButton';
import { APPEARANCE_TABS, appearanceTab, appearanceHref, appearanceSettings, hasHomeTemplate, type AppearanceTab } from '@/lib/designWorkflow';
import { ThemePicker } from './ThemePicker';
import { THEMES, type ThemeConfig } from '@/lib/themeRegistry';
import { fetchThemeCatalog } from '@/lib/themeRuntime';
import { DESIGN_COLOR_FIELDS as COLOR_FIELDS } from '@/lib/designTokens';
import { mergePickedTheme } from '@/lib/mergePickedTheme';

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

function themeFromResponse(data: Partial<Theme>): Theme {
  // Never put API metadata / activeThemeConfig into an editable settings blob.
  return Object.fromEntries(Object.entries(DEFAULT_THEME).map(([key, fallback]) => [
    key, data[key as keyof Theme] ?? fallback,
  ])) as unknown as Theme;
}

export default function AdminAppearancePage() {
  const isMobile = useIsMobile();
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<Theme>(DEFAULT_THEME);
  const [homeDirty, setHomeDirty] = useState(false);
  const [homeBusy, setHomeBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const appearanceDirty = JSON.stringify(appearanceSettings(theme)) !== JSON.stringify(appearanceSettings(savedTheme));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [tab, setTab] = useState<AppearanceTab>('theme');
  const initialSelection = useRef(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogThemes, setCatalogThemes] = useState<ThemeConfig[]>([...THEMES]);

  // Themes installed at runtime (developer .zip packages). They are not in
  // the web bundle, so the picker merges them with the bundled registry;
  // installing / removing goes through the API and refreshes this list.
  const [installedThemes, setInstalledThemes] = useState<ThemeConfig[]>([]);
  const [installing, setInstalling] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const busy = saving || replacing || homeBusy || installing || removingKey !== null;

  const token = () => localStorage.getItem('token');

  const refreshInstalledThemes = async () => {
    try {
      const { themes } = await fetchThemeCatalog();
      // Only themes the bundle doesn't know are "installed"; bundled keys
      // stay managed by the platform registry.
      const staticKeys = new Set(THEMES.map((t) => t.key));
      setInstalledThemes(themes.filter((t) => !staticKeys.has(t.key)));
      setCatalogThemes(themes);
    } catch {
      setInstalledThemes([]);
      setCatalogThemes([...THEMES]);
    } finally {
      setCatalogLoaded(true);
    }
  };

  useEffect(() => {
    refreshInstalledThemes();
    setTab(appearanceTab(new URLSearchParams(window.location.search).get('tab')));
  }, []);

  /**
   * Install a theme package (.zip) via the API. The package is validated
   * end-to-end server-side (zip-slip, schema, bundled-key protection)
   * before anything is written. On success the catalog refreshes and the
   * storefront is told to reload its theme.
   */
  const installTheme = async (file: File | null) => {
    if (!file || busy) return;
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
    if (busy) return;
    if (appearanceDirty && !window.confirm('Discard unsaved appearance edits before removing a theme?')) return;
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
      try {
        const response = await fetch(`${API_BASE}/theme`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.data) throw new Error('Appearance reload failed');
        const next = themeFromResponse(result.data);
        setTheme(next);
        setSavedTheme(next);
      } catch {
        const message = 'Theme removed, but appearance could not be reloaded. Reload this page before saving.';
        setLoadFailed(message);
        window.dispatchEvent(new Event('themeChange'));
        throw new Error(message);
      }
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
    let active = true;
    fetch(`${API_BASE}/theme`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.message || `Could not load the theme (HTTP ${r.status}).`);
        }
        return r.json();
      })
      .then((d) => {
        if (!active) return;
        if (!d.data) throw new Error('The server returned no appearance settings.');
        const loaded = themeFromResponse(d.data);
        setTheme(loaded);
        setSavedTheme(loaded);
      })
      .catch((err) => {
        if (!active) return;
        setLoadFailed(
          `${err?.message || 'Could not reach the API.'} ` +
            'The values below are the shipped defaults, NOT your saved settings — ' +
            'saving now would overwrite them. Start the API, then reload this page.'
        );
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading || !catalogLoaded || loadFailed || initialSelection.current) return;
    initialSelection.current = true;
    const key = new URLSearchParams(window.location.search).get('theme');
    if (!key) return;
    const picked = catalogThemes.find((candidate) => candidate.key === key);
    if (!picked) {
      setMsg({ type: 'error', text: `Theme “${key}” is not available. No settings were changed.` });
      return;
    }
    setTheme((current) => mergePickedTheme(current, picked));
    setTab('theme');
    setMsg({ type: 'success', text: `“${picked.name}” selected. Save appearance to apply its styling. Homepage blocks stay unchanged.` });
  }, [loading, catalogLoaded, catalogThemes, loadFailed]);

  useDesignNavigationGuard(
    appearanceDirty || homeDirty || busy,
    busy ? 'A design update is still in progress. Leave this page?' : 'Discard unsaved design edits and leave this page?',
  );

  const changeTab = (next: AppearanceTab) => {
    if (busy || next === tab) return;
    if (tab === 'home' && homeDirty && !window.confirm('Discard unsaved homepage edits and leave the Homepage tab?')) return;
    setTab(next);
    window.history.replaceState(null, '', appearanceHref(next));
  };

  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setTheme((t) => ({ ...t, [k]: v }));

  const notify = (type: string, text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 5000);
  };

  const save = async () => {
    if (busy || !appearanceDirty) return;
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
        body: JSON.stringify(appearanceSettings(theme)),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        notify('error', e.message || `Save failed (${res.status}). Nothing was stored.`);
        return;
      }
      const saved = await res.json();
      const next = themeFromResponse(saved.data);
      setTheme(next);
      setSavedTheme(next);
      try { localStorage.setItem('themeSettings', JSON.stringify(next)); } catch { /* API save succeeded even when storage is full. */ }
      // Repaint every open tab of the storefront immediately.
      window.dispatchEvent(new Event('themeChange'));
      notify('success', 'Appearance saved. Styling is live; homepage blocks were not changed.');
    } catch {
      notify('error', 'Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (busy || loadFailed || !confirm('Reset the active theme, colours, fonts, announcement and custom CSS to platform defaults? Homepage blocks will not be changed.')) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/theme/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || `Reset failed (${res.status}).`);
      const next = themeFromResponse(d.data);
      setTheme(next);
      setSavedTheme(next);
      try { localStorage.setItem('themeSettings', JSON.stringify(next)); } catch { /* optional cache */ }
      window.dispatchEvent(new Event('themeChange'));
      notify('success', 'Appearance reset. Homepage blocks were not changed.');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Could not reset appearance.');
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
            Style your live shop here. Manage its content and visibility in Homepage; design reusable themes in Theme Studio.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a href="/admin/theme-studio" style={{ padding: '10px 16px', border: '1px solid #d4d4d4', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontWeight: 600, textDecoration: 'none', color: '#111', display: 'inline-flex', alignItems: 'center' }}>
            Theme Studio · templates
          </a>
          {tab !== 'home' && <>
            <button onClick={reset} disabled={busy || !!loadFailed} style={{ padding: '10px 16px', border: '1px solid #d4d4d4', borderRadius: 6, background: '#fff', fontWeight: 600 }}>
              Reset appearance
            </button>
            <button onClick={() => setTheme(savedTheme)} disabled={busy || !appearanceDirty} style={{ padding: '10px 16px', border: '1px solid #d4d4d4', borderRadius: 6, background: '#fff', fontWeight: 600 }}>
              Discard appearance edits
            </button>
            <button onClick={save} disabled={busy || !!loadFailed || !appearanceDirty} style={{ padding: '10px 22px', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, opacity: busy || !appearanceDirty || loadFailed ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save appearance'}
            </button>
          </>}

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
        <div role={msg.type === 'error' ? 'alert' : 'status'} style={{
          marginTop: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '14px',
          backgroundColor: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'success' ? '#166534' : '#991b1b',
        }}>
          {msg.text}
        </div>
      )}

      {appearanceDirty && <p role="status" style={{ color: '#92400e', fontSize: 13, marginTop: 14 }}>
        Unsaved appearance edits. {tab === 'home' ? 'Return to a styling tab to save them; Homepage saves only its blocks.' : 'Save appearance to make them live.'}
      </p>}
      <div role="tablist" aria-label="Appearance tools" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 22, borderBottom: '1px solid #e5e5e5', paddingBottom: 10 }}>
        {APPEARANCE_TABS.map(([key, name]) => (
          <button key={key} role="tab" aria-selected={tab === key} aria-controls="appearance-panel" id={`appearance-tab-${key}`} disabled={busy}
            onClick={() => changeTab(key)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', border: '1px solid #e5e5e5', background: tab === key ? '#111' : '#fff', color: tab === key ? '#fff' : '#111' }}>
            {name}
          </button>
        ))}
      </div>
      <fieldset disabled={saving || replacing || installing || removingKey !== null} id="appearance-panel" role="tabpanel" aria-labelledby={`appearance-tab-${tab}`} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {/* The home page builder and the theme picker both need the full
          width - their content is wide and the small colour preview on
          the right is irrelevant. Other tabs share the width with the
          preview pane. */}
      {tab === 'home' || tab === 'theme' ? (
        <div style={{ marginTop: '22px' }}>
          {tab === 'home' ? (
            <HomeBuilder onDirtyChange={setHomeDirty} onBusyChange={setHomeBusy} />
          ) : (
            <ThemeTab
              activeTheme={savedTheme.activeTheme}
              selectedTheme={theme.activeTheme}
              themes={catalogThemes}
              appearanceDirty={appearanceDirty}
              onReplacing={setReplacing}
              installedThemes={installedThemes}
              onPick={(key) => {
                const picked = catalogThemes.find((candidate) => candidate.key === key);
                if (!picked) return;
                setTheme((t) => mergePickedTheme(t, picked));
                notify('success', `“${picked.name}” selected. Save appearance to apply styling; homepage blocks stay unchanged.`);
              }}
              onInstall={installTheme}
              onRemove={removeTheme}
              installing={installing}
              removingKey={removingKey}
              disabled={busy || !!loadFailed}
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
                  <input type="range" min={0} max={40} value={theme.radius}
                    onChange={(e) => set('radius', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={label}>Button radius — {theme.buttonRadius}px</label>
                  <input type="range" min={0} max={40} value={theme.buttonRadius}
                    onChange={(e) => set('buttonRadius', parseInt(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={label}>Content width — {theme.containerWidth}px</label>
                  <input type="range" min={960} max={1920} step={20} value={theme.containerWidth}
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
              Style preview · sample content
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
            <strong>Save appearance</strong>.
          </p>
        </div>
      </div>
      )}
      </fieldset>
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
  selectedTheme,
  themes,
  appearanceDirty,
  onReplacing,
  installedThemes,
  onPick,
  onInstall,
  onRemove,
  installing,
  removingKey,
  disabled,
}: {
  activeTheme: string | null;
  selectedTheme: string;
  themes: ThemeConfig[];
  appearanceDirty: boolean;
  onReplacing: (busy: boolean) => void;
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

  const selected = themes.find((candidate) => candidate.key === selectedTheme);
  const hasTemplate = hasHomeTemplate(selected?.layouts);

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
          Select a starting point, then Save appearance to apply its colours, fonts and styling.
          Your homepage blocks, announcement message and custom CSS are kept. Fine-tune styles in the other tabs.
        </p>
      </div>
      <ThemePicker
        activeTheme={activeTheme}
        selectedTheme={selectedTheme}
        onSelect={onPick}
        disabled={disabled}
        themes={themes}
      />
      {selected && (
        <div style={{ marginTop: 16, padding: 16, border: '1px solid #e5e5e5', borderRadius: 8 }}>
          <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Optional: start with this theme’s homepage</h4>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 10px' }}>
            Copy the saved template from “{selected.name}” into your live Homepage editor.
            This replaces existing blocks; it is not part of saving appearance.
          </p>
          <ReplaceHomepageButton key={selected.key} themeKey={selected.key} themeName={selected.name}
            disabled={disabled || appearanceDirty || !hasTemplate}
            disabledReason={appearanceDirty ? 'Save or discard appearance edits first.' : !hasTemplate ? 'This theme has no saved homepage template. Build one in Theme Studio.' : undefined}
            onBusyChange={onReplacing} />
          <a href={appearanceHref('home')} style={{ display: 'inline-block', marginTop: 10, fontSize: 13 }}>Edit live homepage →</a>
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
            disabled={disabled || installing || !pickFile}
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
                  disabled={disabled || removingKey === t.key}
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


