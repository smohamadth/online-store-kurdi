// Share row — used on the product page and on blog posts.
//
// Small pill buttons for X, Facebook, WhatsApp, Telegram and "copy link".
// The URL/title come from props (server-known), so there is no hydration
// mismatch; the clipboard is only touched inside the click handler.

'use client';

import { useState } from 'react';

interface Props {
  /** Absolute URL of the page being shared. */
  url: string;
  /** Short text used in share intents (post title / product name). */
  title?: string;
  /** Optional lead-in label, e.g. "Share". */
  label?: string;
  /** Center the row (used on blog posts); default start-aligned. */
  center?: boolean;
}

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 13px',
  border: '1px solid var(--border, #e2e5ea)',
  borderRadius: '999px',
  backgroundColor: 'var(--card-bg, #fff)',
  color: 'var(--muted, #555)',
  fontSize: '12.5px',
  fontWeight: 700,
  textDecoration: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1.3,
};

export default function ShareButtons({ url, title, label, center = false }: Props) {
  const [copied, setCopied] = useState(false);
  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(title || '');
  const shareText = title ? `${title}\n${url}` : url;

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Older browsers / non-secure contexts: fall back to a temp input.
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — nothing sensible to do; the platform links
      // above still let the visitor share.
    }
  };

  return (
    <span
      role="group"
      aria-label={label ? `${label} (opens in a new tab)` : 'Share this page'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        justifyContent: center ? 'center' : 'flex-start',
      }}
    >
      {label && (
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted, #666)' }}>
          {label}
        </span>
      )}
      <a
        href={`https://twitter.com/intent/tweet?url=${encoded}&text=${text}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X"
        style={pill}
      >
        𝕏
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
        style={pill}
      >
        Facebook
      </a>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
        style={pill}
      >
        WhatsApp
      </a>
      <a
        href={`https://t.me/share/url?url=${encoded}&text=${text}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Telegram"
        style={pill}
      >
        Telegram
      </a>
      <button type="button" onClick={copy} aria-label="Copy link" style={pill}>
        {copied ? '✓ Copied' : 'Copy link'}
      </button>
    </span>
  );
}
