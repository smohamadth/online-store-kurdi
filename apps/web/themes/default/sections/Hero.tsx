/**
 * Default theme — Hero section.
 *
 * Delegates to the platform's existing HeroGallery. This exists
 * so the default theme's `theme.json` can declare a `sections.hero`
 * entry and the resolution logic in `themeSections.tsx` finds a
 * component at the same logical key as third-party themes.
 *
 * If you wanted the default theme to look different from the
 * platform's built-in hero, you'd replace this with a custom
 * component. As shipped, "default" is the platform default.
 */

'use client';

import HeroGallery from '@/components/HeroGallery';
import type { SectionProps } from '@/lib/themeSections';

export default function DefaultHero(props: SectionProps) {
  return <HeroGallery banners={(props.banners as any) ?? []} loaded={true} />;
}
