/**
 * Storefront languages: enable/disable built-ins, add a locale, edit UI strings.
 */
'use client';

import { useEffect, useState } from 'react';
import { API_BASE, getToken } from '@/lib/http';
import { allTranslationKeys, translations } from '@/lib/i18n';

type Lang = { code: string; name: string; dir: 'ltr' | 'rtl'; flag: string; enabled: boolean };

export default function AdminLanguagesPage() {
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [strings, setStrings] = useState<Record<string, Record<string, string>>>({});
  const [editCode, setEditCode] = useState('en');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDir, setNewDir] = useState<'ltr' | 'rtl'>('ltr');

  async function load() {
    const res = await fetch(`${API_BASE}/i18n/storefront`);
    const json = await res.json();
    const data = json.data;
    setLanguages(data.languages);
    setStrings(data.strings || {});
    const code = data.languages[0]?.code || 'en';
    setEditCode(code);
    setDraft({ ...(translations[code] || translations.en), ...(data.strings?.[code] || {}) });
  }

  useEffect(() => { load().catch(() => setMessage('Could not load languages')); }, []);

  function selectLang(code: string) {
    const merged = { ...strings, [editCode]: draft };
    setStrings(merged);
    setEditCode(code);
    setDraft({ ...(translations[code] || translations.en), ...(merged[code] || {}) });
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
      setMessage('Saved.');
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
    save(next, { ...strings, [editCode]: draft, [code]: { ...translations.en } });
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Storefront languages</h1>
      <p style={{ color: '#555', marginBottom: 20, maxWidth: 720 }}>
        Enable languages shoppers can pick, add a new locale, and edit every storefront UI string.
        Admin-panel language is chosen separately from the top bar.
      </p>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(240px, 320px) 1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Enabled languages</h2>
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
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>UI texts — {editCode}</h2>
          <div style={{ maxHeight: 560, overflow: 'auto' }}>
            {allTranslationKeys.map((key) => (
              <label key={key} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 8, marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: '#666', fontFamily: 'monospace' }}>{key}</span>
                <input
                  aria-label={key}
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  style={{ padding: 6, border: '1px solid #ddd', borderRadius: 4 }}
                />
              </label>
            ))}
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
