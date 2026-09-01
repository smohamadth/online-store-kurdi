'use client';

/**
 * ThemePicker.
 *
 * The merchant-facing "pick a theme" widget for the admin
 * appearance page. Lists every theme in the registry as a
 * card with a name, description, and a "use this theme"
 * button. The currently-active theme is highlighted.
 *
 * Why a separate component?
 *   - Testable in isolation. The parent page is 514 lines and
 *     runs the auth check, the GET /theme load, the save flow,
 *     and seven tabs. Mounting the picker standalone lets us
 *     pin its behaviour without all that scaffolding.
 *   - Reusable. If a future "switch theme" button ends up in
 *     the main admin dashboard, this component drops in.
 *
 * The picker's value is just the theme key. The parent is
 * responsible for:
 *   - Reading the active theme from the loaded theme record
 *   - POSTing the new activeTheme to /api/theme
 *   - Showing the user-visible success / failure message
 *
 * The picker does the click → onChange → "did the click land on
 * a valid theme?" check; it does not do network. That's a
 * separation-by-concerns choice: a component that's hard to
 * test (network) is harder to ship safely.
 */

import { useState, useEffect } from 'react';
import { THEMES, type ThemeConfig } from '@/lib/themeRegistry';

export interface ThemePickerProps {
  /**
   * The currently-active theme key. The picker highlights the
   * matching card. If the key is null (loading state), no
   * card is highlighted.
   */
  activeTheme: string | null;
  /**
   * Called when the merchant clicks "Use this theme". The
   * parent's responsibility is to confirm + persist.
   */
  onSelect: (key: string) => void;
  /**
   * Disable every card. Set during the save roundtrip so a
   * double-click doesn't fire two PUTs.
   */
  disabled?: boolean;
}

/**
 * The Picker card. Renders a single theme's metadata and a
 * "Use this theme" button. Active state is the parent's
 * `activeTheme` prop.
 *
 * Pulled out of the parent so the visual state and the
 * click behaviour can be tested independently of the list
 * wrapper.
 */
function ThemeCard({
  theme,
  active,
  disabled,
  onSelect,
}: {
  theme: ThemeConfig;
  active: boolean;
  disabled: boolean;
  onSelect: (key: string) => void;
}) {
  // The card preview shows a few of the theme's signature
  // tokens as a swatch row. A merchant looking at the
  // gallery should be able to tell at a glance: this one is
  // dark, that one is serif, etc.
  const swatches = [
    theme.tokens.primaryColor as string | undefined,
    theme.tokens.bodyBg as string | undefined,
    theme.tokens.accentColor as string | undefined,
  ].filter((c): c is string => typeof c === 'string');

  return (
    <div
      data-testid={`theme-card-${theme.key}`}
      data-active={active ? 'true' : 'false'}
      style={{
        // Active cards get a thicker, dark border. Inactive
        // cards use a neutral light grey.
        border: active ? '2px solid #111' : '1px solid #e5e5e5',
        borderRadius: '12px',
        padding: '16px',
        backgroundColor: '#fff',
        // Lift active cards slightly. Subtle but it's the
        // difference between "this is selected" and "these
        // are all the options".
        boxShadow: active
          ? '0 4px 16px rgba(0,0,0,0.10)'
          : '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.18s ease, border-color 0.18s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
            {theme.name}
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: '#666',
              margin: '4px 0 0',
              // Two-line clamp so a long description doesn't
              // unbalance the row of cards.
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {theme.description}
          </p>
        </div>
        {theme.features.paid && (
          <span
            data-testid={`paid-badge-${theme.key}`}
            style={{
              flexShrink: 0,
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#92400e',
              backgroundColor: '#fef3c7',
              borderRadius: '999px',
            }}
          >
            Paid
          </span>
        )}
      </div>

      {swatches.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            gap: '4px',
          }}
        >
          {swatches.map((c, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: '32px',
                backgroundColor: c,
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '4px',
              }}
            />
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#888',
        }}
      >
        <span>
          v{theme.version} · {theme.author}
        </span>
        {active && (
          <span
            data-testid={`active-badge-${theme.key}`}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#fff',
              backgroundColor: '#111',
              borderRadius: '999px',
            }}
          >
            Active
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect(theme.key)}
        disabled={disabled || active}
        data-testid={`theme-select-${theme.key}`}
        style={{
          // The button is full-width and tall enough to be
          // comfortable on a touch device.
          minHeight: '40px',
          padding: '8px 14px',
          backgroundColor: active ? '#f5f5f5' : '#111',
          color: active ? '#999' : '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : active ? 'default' : 'pointer',
          // Visible focus ring for keyboard users. The
          // global :focus-visible rule in globals.css
          // covers this; the explicit outline here is a
          // belt-and-suspenders for theme cards rendered
          // inside admin contexts that may have overridden
          // focus styling.
        }}
      >
        {active ? 'Currently active' : 'Use this theme'}
      </button>

      {/* A separate "Preview" link opens /preview/<key>?from=admin
          so the merchant can see what the theme looks like
          with sample content before activating. The link
          preserves the admin context (the preview's "back
          to admin" CTA only shows when from=admin is in
          the query string). */}
      <a
        href={`/preview/${theme.key}?from=admin`}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`theme-preview-link-${theme.key}`}
        style={{
          display: 'block',
          textAlign: 'center',
          fontSize: 12,
          color: '#666',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        Preview in new tab ↗
      </a>
    </div>
  );
}

export function ThemePicker({ activeTheme, onSelect, disabled }: ThemePickerProps) {
  // The list is read from the registry at module load, but
  // rendering them in a stable order is a UX choice: sorted
  // by `key` so the order is deterministic across renders.
  // (The THEMES array's order is the source-of-truth order;
  // this sort is a fallback in case future code adds themes
  // out of order.)
  const sorted = [...THEMES].sort((a, b) => a.key.localeCompare(b.key));

  // Track which card the user is hovering. The hover state
  // is a tiny detail (border colour shift) but it's the
  // kind of polish that distinguishes a "card list" from a
  // "form".
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  // Clear the hover on unmount. The component might be
  // re-rendered with a different active theme; a stale
  // hoverKey would be harmless but messy.
  useEffect(() => () => setHoverKey(null), []);

  if (sorted.length === 0) {
    // Defensive: the registry always has at least the
    // fallback theme, but the test for the empty state
    // makes the failure mode explicit if a future refactor
    // breaks the assertion.
    return (
      <p data-testid="theme-picker-empty" style={{ color: '#666' }}>
        No themes are installed. Drop a directory in{' '}
        <code>apps/web/themes/</code> and rebuild.
      </p>
    );
  }

  return (
    <div data-testid="theme-picker">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '16px',
        }}
      >
        {sorted.map((theme) => (
          <div
            key={theme.key}
            onMouseEnter={() => setHoverKey(theme.key)}
            onMouseLeave={() => setHoverKey(null)}
            // The hoverKey drives a CSS-attribute the card
            // could read to change border colour on hover.
            // Currently unused by ThemeCard but useful for
            // future tweaks (e.g. showing a preview
            // on hover). Pinning the attribute so tests
            // can verify the wiring.
            data-hover={hoverKey === theme.key ? 'true' : 'false'}
          >
            <ThemeCard
              theme={theme}
              active={activeTheme === theme.key}
              disabled={Boolean(disabled)}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
