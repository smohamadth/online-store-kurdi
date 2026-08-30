/**
 * Minimal theme — Hero section.
 *
 * A text-first hero. No large imagery, no carousel, no overlay
 * buttons. The store name as a typographic statement, a single
 * line of marketing copy, a small link to the products.
 *
 * This is the kind of hero a writer or maker uses. The product
 * is the brand; the storefront gets out of the way.
 */

'use client';

import Link from 'next/link';
import { useStoreSettings } from '@/lib/settings';
import { useTheme } from '@/lib/theme';
import type { SectionProps } from '@/lib/themeSections';

export default function MinimalHero(_props: SectionProps) {
  const { settings } = useStoreSettings();
  // The active theme is always available inside a section override
  // (the section is only rendered when the theme picker resolved to
  // it). Reading it here is the only way for a section to know which
  // theme is active, since CSS variables are scoped to the root.
  const theme = useTheme();

  return (
    <section
      data-section="hero"
      data-theme={theme.activeTheme}
      style={{
        // The "min-height" is calibrated for a 17px base font: at
        // mobile the hero is one screen tall, on desktop it's a
        // quarter of a screen. The store name is the only visual
        // weight; let it breathe.
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--body-bg, #fafaf7)',
        padding: '80px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--container, 960px)',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <p
          style={{
            fontSize: '13px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--muted, #6b6b65)',
            margin: 0,
            marginBottom: '24px',
            fontWeight: 500,
          }}
        >
          {settings.storeName}
        </p>
        <h1
          style={{
            // 56px on desktop, 36px on mobile via a CSS calc.
            fontSize: 'clamp(36px, 6vw, 64px)',
            lineHeight: 1.1,
            fontWeight: 600,
            color: 'var(--body-text, #1a1a1a)',
            margin: 0,
            marginBottom: '24px',
            maxWidth: '20ch',
            letterSpacing: '-0.01em',
          }}
        >
          {settings.storeDescription || 'A small collection of things, made carefully.'}
        </h1>
        {settings.storeDescription && (
          <p
            style={{
              fontSize: '17px',
              lineHeight: 1.6,
              color: 'var(--muted, #6b6b65)',
              maxWidth: '52ch',
              margin: 0,
              marginBottom: '40px',
            }}
          >
            {/* The description serves double duty: as the SEO
                description and as the hero's tagline. Truncate
                for the hero so the page never has a wall of
                text above the fold. */}
            {settings.storeDescription.length > 180
              ? settings.storeDescription.slice(0, 177) + '…'
              : settings.storeDescription}
          </p>
        )}
        <Link
          href="/products"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: 'var(--brand, #1a1a1a)',
            color: 'var(--brand-text, #fafaf7)',
            textDecoration: 'none',
            fontSize: '15px',
            fontWeight: 500,
            // Minimal: zero radius. The button reads as a quiet,
            // intentional shape rather than a clickable pill.
            borderRadius: 0,
            transition: 'transform 0.18s ease',
          }}
        >
          See what's in stock
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
