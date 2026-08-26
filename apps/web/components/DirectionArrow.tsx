'use client';

import { useContext, type ReactNode } from 'react';
import { I18nSeedContext } from '@/lib/i18n';

/**
 * Direction-aware arrow glyph.
 *
 * Use this anywhere the codebase inlines a single-character arrow next
 * to a label that points to a destination (Back / Next / View all /
 * Continue shopping). In RTL the arrow character flips so the visual
 * cue still points away from the label and toward the destination.
 *
 * Why a component, not a helper that returns a string:
 *   - The 15+ call sites that need this fix are scattered across
 *     files that don't otherwise import useTranslation. Adding the
 *     hook to each one bloats the diff; this component reads the
 *     I18nSeedContext directly (which the root layout already
 *     provides) and renders the right character.
 *   - Future "use a real SVG icon" change lives in one place.
 *
 * Usage: <DirectionArrow kind="back" />, kind="forward", kind="up",
 * kind="down". Default content is empty (the caller provides the
 * label) — the arrow is the only thing this component renders.
 */
export type ArrowKind = 'back' | 'forward' | 'up' | 'down';

const ARROWS = {
  back: { ltr: '←', rtl: '→' },
  forward: { ltr: '→', rtl: '←' },
  up: { ltr: '↑', rtl: '↓' },
  down: { ltr: '↓', rtl: '↑' },
} as const;

export function DirectionArrow({ kind }: { kind: ArrowKind }): ReactNode {
  // I18nSeedContext is provided by the root layout. For tests that
  // don't wrap in a provider, the default value is null, and we
  // fall back to LTR.
  const seed = useContext(I18nSeedContext);
  const isRtl = seed?.dir === 'rtl';
  return <span aria-hidden="true">{ARROWS[kind][isRtl ? 'rtl' : 'ltr']}</span>;
}
