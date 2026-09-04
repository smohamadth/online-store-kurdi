/**
 * Default theme — Hero section.
 *
 * Delegates to the platform's existing HeroGallery. This exists
 * so the default theme's `theme.json` can declare a `sections.hero`
 * entry and the resolution logic in `themeSections.tsx` finds a
 * component at the same logical key as third-party themes.
 *
 * The home row's `config.hero` design block (layout / height /
 * autoplay / arrows / dots, see lib/heroOptions.ts) is honoured
 * here, so the default theme reacts to the hero controls in the
 * Home builder exactly like the platform fallback does.
 *
 * If you wanted the default theme to look different from the
 * platform's built-in hero, you'd replace this with a custom
 * component. As shipped, "default" is the platform default.
 */

'use client';

import HeroGallery from '@/components/HeroGallery';
import HeroSplit from '@/components/HeroSplit';
import { heroOptionsFromConfig } from '@/lib/heroOptions';
import type { SectionProps } from '@/lib/themeSections';

export default function DefaultHero(props: SectionProps) {
  const opts = heroOptionsFromConfig(
    props.config?.hero as Record<string, unknown> | undefined
  );
  const banners = props.banners ?? [];
  // "single" and "split" both show the first banner statically; split
  // renders it in the copy+media band (HeroSplit), single uses the
  // full-bleed band without carousel chrome.
  if (opts.layout === 'split') {
    return <HeroSplit banner={banners[0] ?? null} height={opts.height} />;
  }
  const slides = opts.layout === 'single' ? banners.slice(0, 1) : banners;
  return (
    <HeroGallery
      banners={slides}
      loaded={true}
      autoPlay={opts.autoPlay}
      autoPlayMs={opts.autoPlayMs}
      showArrows={opts.showArrows}
      showDots={opts.showDots}
      height={opts.height}
    />
  );
}
