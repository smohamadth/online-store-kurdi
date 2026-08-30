/**
 * ThemeSectionRenderer.
 *
 * Used by the home page (HomeView.tsx) to render a section. The
 * renderer checks if the active theme ships an override for this
 * section; if so, the override is rendered. If not, the platform
 * default (the JSX the home page would otherwise inline) is
 * rendered instead.
 *
 * The pattern is:
 *
 *   <ThemeSectionRenderer
 *     section="hero"
 *     fallback={<HeroGallery banners={...} />}
 *     props={{ banners: heroBanners }}
 *   />
 *
 * The `fallback` is what gets rendered when no theme override
 * exists. The `props` are forwarded to whichever component wins
 * (theme override or platform default).
 *
 * Why both `fallback` and `props`?
 *   - `fallback` lets the platform keep its existing inline JSX
 *     for the default theme. We don't have to refactor every
 *     section to a separate component.
 *   - `props` is the data the override will receive when it
 *     wins. The fallback already has the data captured in
 *     closure; only the override needs the explicit data.
 */

'use client';

import type { ReactNode } from 'react';
import { useSection, type SectionProps } from './themeSections';

interface Props {
  /** Section name. Maps to a key in the theme's `sections` map. */
  section: string;
  /** What to render when the theme has no override for this section. */
  fallback: ReactNode;
  /**
   * Data the override component receives. Ignored when the
   * fallback wins.
   */
  props?: SectionProps;
}

export function ThemeSectionRenderer({ section, fallback, props }: Props) {
  const Override = useSection(section);
  if (Override) {
    return <Override {...(props ?? {})} />;
  }
  return <>{fallback}</>;
}
