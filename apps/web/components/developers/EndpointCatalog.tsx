// EndpointCatalog — renders the live public-API manifest served by
// GET /api/developers (the manifest module in apps/api is the single
// source of truth). Each row can fire the request itself ("try it").

'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/http';
import { C, CodeBlock, methodColors, Pill } from './ui';

export interface EndpointParam {
  name: string;
  type: string;
  values?: string[];
  optional?: boolean;
  description: string;
}

export interface ManifestEntry {
  method: string;
  path: string;
  tag: string;
  auth: 'none' | 'optional' | 'customer';
  summary: string;
  params?: EndpointParam[];
}

export interface ManifestData {
  version: number;
  basePath: string;
  envelope: string;
  endpoints: ManifestEntry[];
}

const authLabel: Record<string, string> = {
  none: 'public',
  optional: 'public / customer',
  customer: 'customer token',
};

export async function fetchManifest(base = API_BASE): Promise<ManifestData> {
  const res = await fetch(`${base}/developers`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${base}/developers`);
  const body = await res.json();
  if (body?.status !== 'success') throw new Error('Unexpected manifest payload');
  return body.data as ManifestData;
}

function TryIt({ entry }: { entry: ManifestEntry }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ status: number; body: string } | null>(null);

  const run = async () => {
    setState('loading');
    setResult(null);
    try {
      const path = entry.path.replace(/:([a-zA-Z]+)/g, 'demo');
      const isPost = entry.method === 'POST';
      const res = await fetch(`${API_BASE}${path}`, {
        method: entry.method,
        headers: {
          accept: 'application/json',
          ...(isPost ? { 'content-type': 'application/json' } : {}),
        },
        // POST entries take an empty JSON body, which surfaces the
        // endpoint's validation response (e.g. "code is required") —
        // proof the route is alive without creating anything.
        ...(isPost ? { body: '{}' } : {}),
      });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // non-JSON response — show raw
      }
      setResult({ status: res.status, body });
      setState('done');
    } catch (err) {
      setResult({ status: 0, body: String(err instanceof Error ? err.message : err) });
      setState('error');
    }
  };

  const busy = state === 'loading';
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={run}
        disabled={busy || entry.path.includes(':')}
        style={{
          fontSize: 12,
          fontWeight: 700,
          padding: '5px 12px',
          borderRadius: 7,
          border: `1px solid ${C.border}`,
          backgroundColor: busy ? '#eef1f6' : C.cardBg,
          color: C.ink,
          cursor: busy ? 'default' : 'pointer',
        }}
        title={entry.path.includes(':') ? 'Replace the :param segments first (try it only works for fixed paths)' : undefined}
      >
        {busy ? 'Requesting…' : 'Try it'}
      </button>
      {result && (
        <div style={{ marginTop: 8 }}>
          <Pill tone={result.status >= 200 && result.status < 300 ? 'ok' : result.status === 0 ? 'warn' : 'neutral'}>
            HTTP {result.status || 'network error'}
          </Pill>
          <CodeBlock code={result.body} label={`${entry.method} ${entry.path}`} />
        </div>
      )}
    </div>
  );
}

function EndpointRow({ entry }: { entry: ManifestEntry }) {
  const [open, setOpen] = useState(false);
  const mc = methodColors[entry.method] ?? { fg: C.ink, bg: '#eef1f6' };
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        backgroundColor: C.cardBg,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'start',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            fontFamily: C.mono,
            color: mc.fg,
            backgroundColor: mc.bg,
            borderRadius: 6,
            padding: '2px 7px',
            minWidth: 46,
            textAlign: 'center',
          }}
        >
          {entry.method}
        </span>
        <code style={{ fontSize: 13, color: C.ink, fontFamily: C.mono, flex: '1 1 260px' }}>
          {entry.path}
        </code>
        <Pill tone={entry.auth === 'none' ? 'ok' : entry.auth === 'customer' ? 'warn' : 'accent'}>
          {authLabel[entry.auth]}
        </Pill>
        <span style={{ fontSize: 12, color: C.faint, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
          ›
        </span>
      </button>
      {open && (
        <div style={{ padding: '2px 16px 14px', borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: C.muted, margin: '10px 0 6px' }}>
            {entry.summary}
          </p>
          {entry.params && entry.params.length > 0 && (
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6 }}>
              <thead>
                <tr>
                  {['Name', 'Type', 'Required', 'Description'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'start',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: C.faint,
                        padding: '4px 8px',
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entry.params.map((p) => (
                  <tr key={p.name}>
                    <td style={{ padding: '5px 8px' }}>
                      <code style={{ fontFamily: C.mono, fontSize: 12, color: C.ink }}>{p.name}</code>
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 12, color: C.muted, fontFamily: C.mono }}>
                      {p.values ? `${p.type}: ${p.values.join('|')}` : p.type}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 12, color: C.muted }}>
                      {p.optional ? 'optional' : 'yes'}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 12.5, color: C.muted }}>{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TryIt entry={entry} />
        </div>
      )}
    </div>
  );
}

export default function EndpointCatalog() {
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [tag, setTag] = useState<string>('all');

  useEffect(() => {
    let alive = true;
    fetchManifest()
      .then((m) => alive && setManifest(m))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const tags = useMemo(() => {
    if (!manifest) return [];
    const seen: string[] = [];
    for (const e of manifest.endpoints) if (!seen.includes(e.tag)) seen.push(e.tag);
    return seen;
  }, [manifest]);

  const filtered = useMemo(() => {
    if (!manifest) return [];
    const q = filter.trim().toLowerCase();
    return manifest.endpoints.filter((e) => {
      if (tag !== 'all' && e.tag !== tag) return false;
      if (!q) return true;
      return (
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.tag.toLowerCase().includes(q)
      );
    });
  }, [manifest, filter, tag]);

  if (error) {
    return (
      <div
        style={{
          border: `1px solid #fecaca`,
          backgroundColor: C.badSoft,
          color: C.bad,
          borderRadius: 10,
          padding: '14px 16px',
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        <strong>Could not load the endpoint manifest.</strong> The reference is served live by the
        API at <code style={{ fontFamily: C.mono }}>/api/developers</code> — make sure the API is
        running ({' '}
        <code style={{ fontFamily: C.mono }}>npm run dev</code> starts both apps).{' '}
        <span style={{ opacity: 0.75 }}>({error})</span>
      </div>
    );
  }

  if (!manifest) {
    return (
      <p style={{ color: C.faint, fontSize: 13.5 }}>
        Loading the endpoint manifest from <code style={{ fontFamily: C.mono }}>/api/developers</code>…
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter endpoints (path, tag, keyword)…"
          aria-label="Filter endpoints"
          style={{
            flex: '1 1 240px',
            padding: '8px 12px',
            fontSize: 13,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            backgroundColor: C.cardBg,
            color: C.ink,
          }}
        />
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="Filter by group"
          style={{
            padding: '8px 10px',
            fontSize: 13,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            backgroundColor: C.cardBg,
            color: C.ink,
          }}
        >
          <option value="all">All groups</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: C.faint }}>
          {filtered.length} of {manifest.endpoints.length} endpoints · manifest v{manifest.version}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: C.faint, margin: '0 0 10px' }}>
        Click an endpoint for details and a live “try it” request. This list is generated from the
        API itself — <code style={{ fontFamily: C.mono }}>GET /api/developers</code> — so it can
        never go stale. Paths with <code style={{ fontFamily: C.mono }}>:params</code> are patterns;
        replace the segment with a real value.
      </p>
      {(() => {
        let lastTag = '';
        return filtered.map((e) => {
          const head = e.tag !== lastTag ? e.tag : null;
          lastTag = e.tag;
          return (
            <div key={`${e.method} ${e.path}`}>
              {head && (
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: C.muted,
                    margin: '18px 0 8px',
                  }}
                >
                  {head}
                </h3>
              )}
              <EndpointRow entry={e} />
            </div>
          );
        });
      })()}
      {filtered.length === 0 && (
        <p style={{ color: C.faint, fontSize: 13 }}>No endpoints match “{filter}”.</p>
      )}
    </div>
  );
}
