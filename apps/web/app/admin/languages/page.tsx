/**
 * Storefront languages: enable/disable built-ins, add a locale, edit every UI string.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE, getToken } from '@/lib/http';
import { allTranslationKeys, translations } from '@/lib/i18n';

type Lang = { code: string; name: string; dir: 'ltr' | 'rtl'; flag: string; enabled: boolean };

function keysForCatalog(strings: Record<string, Record<string, string>>): string[] {
  const extra = new Set<string>();
  for (const bag of Object.values(strings)) {
    for (const k of Object.keys(bag || {})) extra.add(k);
  }
  return [...allTranslationKeys, ...Array.from(extra).filter((k) => !allTranslationKeys.includes(k)).sort()];
}

function seedDraft(
  code: string,
  strings: Record<string, Record<string, string>>,
): Record<string, string> {
  const keys = keysForCatalog(strings);
  const builtIn = translations[code] || translations.en;
  const overlay = strings[code] || {};
  const draft: Record<string, string> = {};
  for (const key of keys) {
    draft[key] = overlay[key] ?? builtIn[key] ?? translations.en[key] ?? '';
  }
  return draft;
}

function groupOf(key: string): string {
  const i = key.indexOf('.');
  return i === -1 ? 'other' : key.slice(0, i);
}

export default function AdminLanguagesPage() {
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [strings, setStrings] = useState<Record<string, Record<string, string>>>({});
  const [editCode, setEditCode] = useState('en');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDir, setNewDir] = useState<'ltr' | 'rtl'>('ltr');
  const [query, setQuery] = useState('');
  const [onlyUntranslated, setOnlyUntranslated] = useState(false);

  async function load() {
    const res = await fetch(`${API_BASE}/i18n/storefront`);
    const json = await res.json();
    const data = json.data;
    setLanguages(data.languages);
    setStrings(data.strings || {});
    const code = data.languages[0]?.code || 'en';
    setEditCode(code);
    setDraft(seedDraft(code, data.strings || {}));
  }

  useEffect(() => { load().catch(() => setMessage('Could not load languages')); }, []);

  function selectLang(code: string) {
    const merged = { ...strings, [editCode]: draft };
    setStrings(merged);
    setEditCode(code);
    setDraft(seedDraft(code, merged));
  }

  async function save(nextLangs = languages, nextStrings = { ...strings, [editCode]: draft }) {
    setMessage('Saving…');
    try {
      const res = await fetch(`${API_BASE}/i18n/storefront`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ languages: nextLangs, strings: nextStrings }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.message || 'Save failed');
        return;
      }
      setLanguages(json.data.languages);
      setStrings(json.data.strings || {});
      setMessage('Saved. Storefront shoppers will see these strings after a refresh.');
    } catch {
      setMessage('Could not reach the server — save failed.');
    }
  }

  function addLanguage() {
    const code = newCode.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,7}$/.test(code) || languages.some((l) => l.code === code)) {
      setMessage('Enter a unique language code (e.g. de, ckb).');
      return;
    }
    const next = [...languages, { code, name: newName || code, dir: newDir, flag: '🏳️', enabled: true }];
    setLanguages(next);
    setNewCode('');
    setNewName('');
    const seeded = seedDraft(code, { ...strings, [editCode]: draft, [code]: { ...translations.en } });
    save(next, { ...strings, [editCode]: draft, [code]: seeded });
  }

  const keys = useMemo(() => keysForCatalog({ ...strings, [editCode]: draft }), [strings, editCode, draft]);

  const visibleKeys = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keys.filter((key) => {
      const en = translations.en[key] || '';
      const val = draft[key] ?? '';
      if (onlyUntranslated && editCode !== 'en' && val === en) return false;
      if (!q) return true;
      return (
        key.toLowerCase().includes(q) ||
        en.toLowerCase().includes(q) ||
        val.toLowerCase().includes(q)
      );
    });
  }, [keys, query, onlyUntranslated, draft, editCode]);

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of visibleKeys) {
      const g = groupOf(key);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(key);
    }
    return Array.from(map.entries());
  }, [visibleKeys]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Storefront languages</h1>
      <p style={{ color: '#555', marginBottom: 20, maxWidth: 820 }}>
        Every storefront UI string for every language. Pick a locale, edit the texts, Save.
        Product names and CMS pages are translated on those records; this page is chrome, buttons, and labels.
      </p>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(240px, 300px) 1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Languages</h2>
          {languages.map((l) => (
            <label key={l.code} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                aria-label={`Enable ${l.name}`}
                checked={l.enabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  if (!enabled && languages.filter((x) => x.enabled).length <= 1) {
                    setMessage('At least one language must stay enabled.');
                    return;
                  }
                  const next = languages.map((x) => x.code === l.code ? { ...x, enabled } : x);
                  setLanguages(next);
                }}
              />
              <button type="button" onClick={() => selectLang(l.code)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: editCode === l.code ? 700 : 400 }}>
                {l.flag} {l.name} ({l.code})
              </button>
            </label>
          ))}
          <button type="button" onClick={() => save()} style={{ marginTop: 8, padding: '8px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Save languages
          </button>

          <h3 style={{ fontSize: 14, marginTop: 24 }}>Add language</h3>
          <input aria-label="New language code" placeholder="Code (de)" value={newCode} onChange={(e) => setNewCode(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
          <input aria-label="New language name" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
          <select aria-label="Text direction" value={newDir} onChange={(e) => setNewDir(e.target.value as 'ltr' | 'rtl')} style={{ width: '100%', marginBottom: 8, padding: 8 }}>
            <option value="ltr">LTR</option>
            <option value="rtl">RTL</option>
          </select>
          <button type="button" onClick={addLanguage} style={{ padding: '8px 12px', cursor: 'pointer' }}>Add language</button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>UI texts — {editCode} ({keys.length} strings)</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <input
              aria-label="Search strings"
              placeholder="Search key or text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
            />
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={onlyUntranslated}
                onChange={(e) => setOnlyUntranslated(e.target.checked)}
              />
              Untranslated only
            </label>
          </div>
          <div style={{ maxHeight: 640, overflow: 'auto' }}>
            {groups.map(([group, groupKeys]) => (
              <div key={group} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#666', margin: '8px 0' }}>
                  {group}
                </h3>
                {groupKeys.map((key: string) => (
                  <label key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) minmax(140px, 1fr) minmax(160px, 1.2fr)', gap: 8, marginBottom: 8, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: '#666', fontFamily: 'monospace' }}>{key}</span>
                    <span style={{ color: '#888', fontSize: 12 }} data-testid={`en-${key}`}>{translations.en[key] || '—'}</span>
                    <input
                      aria-label={key}
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      style={{ padding: 6, border: '1px solid #ddd', borderRadius: 4, width: '100%' }}
                    />
                  </label>
                ))}
              </div>
            ))}
            {visibleKeys.length === 0 && (
              <p style={{ color: '#888', fontSize: 13 }}>No strings match that search.</p>
            )}
          </div>
          <button type="button" onClick={() => save()} style={{ marginTop: 12, padding: '8px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Save texts
          </button>
        </div>
      </div>
      {message && <p role="status" style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}
