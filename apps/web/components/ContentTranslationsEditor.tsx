// ---------------------------------------------------------------------------
// ContentTranslationsEditor - per-language content editor.
//
// A reusable admin panel that manages the ContentTranslation rows for a single
// entity (product / category / page / blogPost). The default language (en) is
// edited on the entity itself and is NOT offered here; every other supported
// locale gets a tab where the admin edits the translatable fields (see
// ContentEntityType in the API's translatableFields.ts for the fixed field set).
//
//   GET    /content-translations/:entityType/:entityId   load all locales
//   PUT    /content-translations/:entityType/:entityId/:locale  save one locale
//   DELETE /content-translations/:entityType/:entityId/:locale  clear one locale
//
// The panel is inert until an entityId is known (a newly created entity must be
// saved once before its translations can be persisted), so callers embed it
// with the live entity id.
// ---------------------------------------------------------------------------
'use client';

import { useEffect, useMemo, useState } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

export type ContentEntityType = 'product' | 'category' | 'page' | 'blogPost';

export interface TranslationField {
  key: string;
  label: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}

const SUPPORTED_LOCALES = ['ku', 'ar', 'fa', 'tr'] as const;
const LOCALE_LABELS: Record<string, string> = {
  ku: 'Kurdish',
  ar: 'Arabic',
  fa: 'Persian',
  tr: 'Turkish',
};

interface Props {
  entityType: ContentEntityType;
  entityId: string | null;
  fields: TranslationField[];
}

type LocaleData = Record<string, string>;
type AllData = Record<string, LocaleData>;

export default function ContentTranslationsEditor({ entityType, entityId, fields }: Props) {
  const [activeLocale, setActiveLocale] = useState<string>(SUPPORTED_LOCALES[0]);
  const [data, setData] = useState<AllData>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingLocale, setSavingLocale] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load all existing translations for the entity (only when we have an id).
  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    setLoaded(false);
    setMsg(null);
    setData({});
    (async () => {
      try {
        const res = await authHttp.get<{ locale: string; data: Record<string, unknown> }[]>(
          `/content-translations/${entityType}/${entityId}`,
        );
        if (cancelled) return;
        const next: AllData = {};
        for (const row of res.data || []) {
          const localeData: LocaleData = {};
          for (const f of fields) {
            const v = row.data?.[f.key];
            localeData[f.key] = v == null ? '' : String(v);
          }
          next[row.locale] = localeData;
        }
        setData(next);
      } catch (err) {
        if (!cancelled) setMsg({ type: 'error', text: `Failed to load translations: ${errorMessage(err)}` });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const localeData = useMemo<LocaleData>(() => {
    const base: LocaleData = {};
    for (const f of fields) base[f.key] = '';
    return { ...base, ...(data[activeLocale] || {}) };
  }, [data, activeLocale, fields]);

  const setField = (key: string, value: string) => {
    setData((prev) => ({
      ...prev,
      [activeLocale]: { ...(prev[activeLocale] || {}), [key]: value },
    }));
  };

  const existingLocales = useMemo(() => Object.keys(data).filter((l) => data[l]), [data]);

  const handleSave = async () => {
    if (!entityId) return;
    setSaving(true);
    setSavingLocale(activeLocale);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) payload[f.key] = localeData[f.key] ?? '';
      await authHttp.put(`/content-translations/${entityType}/${entityId}/${activeLocale}`, { data: payload });
      setData((prev) => ({ ...prev, [activeLocale]: { ...localeData } }));
      setMsg({ type: 'success', text: `${LOCALE_LABELS[activeLocale] || activeLocale} translation saved.` });
    } catch (err) {
      setMsg({ type: 'error', text: `Save failed: ${errorMessage(err)}` });
    } finally {
      setSaving(false);
      setSavingLocale(null);
    }
  };

  const handleClear = async () => {
    if (!entityId) return;
    if (!data[activeLocale]) return; // nothing stored
    setSaving(true);
    setSavingLocale(activeLocale);
    setMsg(null);
    try {
      await authHttp.delete(`/content-translations/${entityType}/${entityId}/${activeLocale}`);
      setData((prev) => {
        const next = { ...prev };
        delete next[activeLocale];
        return next;
      });
      setMsg({ type: 'success', text: `${LOCALE_LABELS[activeLocale] || activeLocale} translation cleared (falls back to English).` });
    } catch (err) {
      setMsg({ type: 'error', text: `Clear failed: ${errorMessage(err)}` });
    } finally {
      setSaving(false);
      setSavingLocale(null);
    }
  };

  if (!entityId) {
    return (
      <div style={{ marginTop: 18, padding: 16, border: '1px dashed #ccc', borderRadius: 8, background: '#fafafa' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Translations</div>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
          Save this {entityType} first, then come back to add its translations. New content cannot be
          translated until it has an ID.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 18, border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Translations</div>
        <div style={{ fontSize: 12, color: '#888' }}>
          The storefront shows English until a locale is filled in below.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {SUPPORTED_LOCALES.map((loc) => {
          const has = data[loc] != null && Object.values(data[loc]).some((v) => String(v).trim() !== '');
          return (
            <button
              key={loc}
              type="button"
              onClick={() => setActiveLocale(loc)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: activeLocale === loc ? '2px solid #2563eb' : '1px solid #ddd',
                background: activeLocale === loc ? '#eff6ff' : '#fff',
                fontWeight: activeLocale === loc ? 600 : 400,
                cursor: 'pointer',
                fontSize: 13,
                color: '#111',
              }}
            >
              {LOCALE_LABELS[loc] || loc}
              {has ? <span style={{ color: '#16a34a', marginInlineStart: 4 }}>●</span> : null}
            </button>
          );
        })}
      </div>

      {!loaded ? (
        <div style={{ color: '#888', fontSize: 13 }}>Loading translations…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 14 }}>
            {fields.map((f) => (
              <label key={f.key} style={{ display: 'block' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{f.label}</div>
                {f.multiline ? (
                  <textarea
                    value={localeData[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    rows={f.rows || 4}
                    placeholder={`${f.label} (${LOCALE_LABELS[activeLocale] || activeLocale})`}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #e5e5e5',
                      borderRadius: 6,
                      fontFamily: 'inherit',
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  />
                ) : (
                  <input
                    type="text"
                    value={localeData[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={`${f.label} (${LOCALE_LABELS[activeLocale] || activeLocale})`}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #e5e5e5',
                      borderRadius: 6,
                      fontFamily: 'inherit',
                      fontSize: 14,
                    }}
                  />
                )}
                {f.hint ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{f.hint}</div> : null}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '9px 18px',
                borderRadius: 6,
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {saving && savingLocale === activeLocale ? 'Saving…' : 'Save translation'}
            </button>
            {data[activeLocale] ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                style={{
                  padding: '9px 18px',
                  borderRadius: 6,
                  background: '#fff',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  cursor: 'pointer',
                }}
              >
                {saving && savingLocale === activeLocale ? 'Clearing…' : 'Clear (fall back to English)'}
              </button>
            ) : null}
          </div>
        </>
      )}

      {msg ? (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
            background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: msg.type === 'success' ? '#166534' : '#b91c1c',
            border: msg.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
          }}
        >
          {msg.text}
        </div>
      ) : null}

      {existingLocales.length > 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: '#888' }}>
          Translated: {existingLocales.map((l) => LOCALE_LABELS[l] || l).join(', ')}
        </div>
      ) : null}
    </div>
  );
}
