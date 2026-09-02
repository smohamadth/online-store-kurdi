// Small building blocks for the developer reference UI.
// These components are deliberately independent of the store theme
// tokens so the reference stays readable whatever theme is active.

'use client';

import { useState } from 'react';

export const C = {
  pageBg: '#f5f6fa',
  ink: '#0f172a',
  muted: '#5b6472',
  faint: '#94a0b4',
  border: '#e3e7ef',
  cardBg: '#ffffff',
  codeBg: '#0f172a',
  codeInk: '#e2e8f0',
  accent: '#4f46e5',
  accentSoft: '#eef2ff',
  ok: '#15803d',
  okSoft: '#ecfdf5',
  warn: '#92400e',
  warnSoft: '#fffbeb',
  bad: '#b91c1c',
  badSoft: '#fef2f2',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export const methodColors: Record<string, { fg: string; bg: string }> = {
  GET: { fg: '#166534', bg: '#dcfce7' },
  POST: { fg: '#1e40af', bg: '#dbeafe' },
  PUT: { fg: '#854d0e', bg: '#fef9c3' },
  DELETE: { fg: '#991b1b', bg: '#fee2e2' },
};

/** A read-only <pre> with a copy button. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable (http context) — ignore
    }
  };
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '10px',
        backgroundColor: C.codeBg,
        overflow: 'hidden',
        margin: '10px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: C.mono }}>
          {label ?? 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          style={{
            fontSize: 11,
            color: '#cbd5e1',
            background: 'none',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 6,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          {copied ? 'copied ✓' : 'copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '14px 16px',
          overflowX: 'auto',
          fontSize: 12.5,
          lineHeight: 1.6,
          color: C.codeInk,
          fontFamily: C.mono,
          whiteSpace: 'pre',
        }}
      >
        {code}
      </pre>
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'accent';
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: '#eef1f6', fg: '#3d4757' },
    ok: { bg: C.okSoft, fg: C.ok },
    warn: { bg: C.warnSoft, fg: C.warn },
    accent: { bg: C.accentSoft, fg: C.accent },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        backgroundColor: t.bg,
        color: t.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: 21,
        fontWeight: 800,
        color: C.ink,
        margin: '44px 0 6px',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14.5, lineHeight: 1.7, color: C.muted, margin: '8px 0' }}>
      {children}
    </p>
  );
}
