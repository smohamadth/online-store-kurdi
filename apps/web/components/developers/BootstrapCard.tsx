// BootstrapCard — demonstrates GET /api/developers/bootstrap, the
// one-call storefront bundle for headless clients.

'use client';

import { useState } from 'react';
import { API_BASE } from '@/lib/http';
import { C, CodeBlock, Pill } from './ui';

interface BootstrapData {
  settings: { storeName?: string | null; currency?: string | null } | null;
  sections: Array<{ type: string; title?: string | null; config?: Record<string, unknown> }>;
  banners: unknown[];
  categories: unknown[];
  menus: { header: unknown; footer: unknown };
}

export default function BootstrapCard() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState('loading');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/developers/bootstrap`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body?.status !== 'success') throw new Error('Unexpected payload');
      setData(body.data as BootstrapData);
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };

  const heroSection = data?.sections.find((s) => s.type === 'hero');

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        backgroundColor: C.cardBg,
        padding: 16,
        margin: '10px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={run}
          disabled={state === 'loading'}
          style={{
            fontSize: 13,
            fontWeight: 800,
            padding: '9px 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: C.accent,
            color: '#ffffff',
            cursor: state === 'loading' ? 'default' : 'pointer',
            opacity: state === 'loading' ? 0.7 : 1,
          }}
        >
          {state === 'loading' ? 'Fetching…' : 'Fetch /api/developers/bootstrap'}
        </button>
        {state === 'done' && data && (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill tone="accent">{data.settings?.storeName || 'store'} settings</Pill>
            <Pill>{data.sections.length} sections</Pill>
            <Pill>{data.banners.length} banners</Pill>
            <Pill>{data.categories.length} categories</Pill>
            <Pill tone={data.menus.header ? 'ok' : 'neutral'}>
              header menu: {data.menus.header ? 'yes' : 'none'}
            </Pill>
            <Pill tone={data.menus.footer ? 'ok' : 'neutral'}>
              footer menu: {data.menus.footer ? 'yes' : 'none'}
            </Pill>
          </span>
        )}
      </div>
      {state === 'error' && (
        <p style={{ color: C.bad, fontSize: 13, margin: '10px 0 0' }}>
          Request failed — is the API running? ({error})
        </p>
      )}
      {state === 'done' && data && heroSection && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 4px' }}>
            The live <code style={{ fontFamily: C.mono }}>hero</code> section row from this store —
            its <code style={{ fontFamily: C.mono }}>config.hero</code> is exactly what the
            platform hero renders:
          </p>
          <CodeBlock
            label="bootstrap.sections[] (type = hero) — config.hero"
            code={JSON.stringify(heroSection.config ?? {}, null, 2)}
          />
        </div>
      )}
    </div>
  );
}
