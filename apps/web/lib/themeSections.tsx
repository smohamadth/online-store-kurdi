/**
 * Section overrides.
 *
 * A theme can replace specific storefront sections (hero, featured,
 * categories) with its own component. The default theme uses the
 * platform's built-in components; a third-party theme can ship
 * replacements in `themes/<key>/sections/<Section>.tsx`.
 *
 * Resolution order:
 *   1. The active theme's `theme.json` declares an override for
 *      this section.
 *   2. The override path points to a component the theme ships.
 *      We resolve the path via the `themeSectionComponents` map
 *      below - this is a static import map because Vite needs to
 *      know what to bundle.
 *   3. If the theme doesn't ship an override, we fall through to
 *      the platform's default.
 *
 * Why a static import map, not dynamic import()?
 *   - Vite tree-shakes dynamic imports into separate chunks. For
 *     theme variants that always need to be available, that's
 *     wasted complexity. (The dynamic import would only make
 *     sense for paid themes you don't want to bundle for free.)
 *   - A typo in a section path is a build error, not a runtime
 *     "this theme is broken" 404.
 *
 * The component for each section receives a generic `props` bag -
 * the platform passes the same data shape to all section
 * implementations. If a theme's override doesn't read a field,
 * that's fine.
 */

import { useTheme } from './theme';

// Platform default sections.
import HeroGallery, { type Banner } from '@/components/HeroGallery';
import { SectionHeading } from '@/components/HomeSections';

// Theme default sections.
import DefaultHero from '@/themes/default/sections/Hero';
import MinimalHero from '@/themes/minimal/sections/Hero';
import MinimalFeatured from '@/themes/minimal/sections/Featured';
import MinimalCategories from '@/themes/minimal/sections/Categories';
import BoldHero from '@/themes/bold/sections/Hero';
import BoldFeatured from '@/themes/bold/sections/Featured';
import BoldCategories from '@/themes/bold/sections/Categories';
import DawnlightHero from '@/themes/dawnlight/sections/Hero';
import DawnlightFeatured from '@/themes/dawnlight/sections/Featured';
import DawnlightCategories from '@/themes/dawnlight/sections/Categories';
import PulseHero from '@/themes/pulse/sections/Hero';
import PulseFeatured from '@/themes/pulse/sections/Featured';
import PulseCategories from '@/themes/pulse/sections/Categories';

/**
 * The shape of props every section component receives. Each
 * section is rendered by the home page in turn; the platform
 * already has the data loaded. We pass the minimum the sections
 * need to render.
 *
 * Keep this loose on purpose: a section is allowed to ignore
 * fields it doesn't care about, and a theme is allowed to add
 * its own props via the data the home page passes.
 */
export interface SectionProps {
  // Common to all sections
  title?: string | null;
  subtitle?: string | null;
  // Hero-specific
  banners?: Banner[];
  // Featured / categories / new arrivals
  products?: Array<{
    id: string;
    name: string;
    slug: string;
    price: number;
    images?: Array<{ url: string; alt?: string | null }>;
    category?: { name: string; slug: string } | null;
  }>;
  // Categories
  categories?: Array<{ name: string; slug: string; emoji?: string; count?: number; image?: string }>;
  // Config block from the home section row (admin can override per-section)
  config?: Record<string, unknown>;
  // Theme access
  // (sections import useTheme themselves if they need tokens)
}

type SectionComponent = React.ComponentType<SectionProps>;

/**
 * Static map of theme-section overrides.
 *
 * Adding a section override:
 *   1. Create the component in `themes/<key>/sections/<Name>.tsx`.
 *   2. Add it to this map.
 *   3. Reference its path in the theme's `theme.json` `sections` map.
 *
 * The path string in `theme.json` is a logical key, not a file path
 * — this map is the actual file path. That indirection means
 * themes don't need to know about Webpack/Vite resolution.
 */
const THEME_SECTION_COMPONENTS: Record<string, SectionComponent> = {
  // Default theme - just delegates to the platform's built-in
  // HeroGallery. We keep this here so the override path is
  // consistent across themes.
  'default/hero': DefaultHero,
  // Minimal theme overrides.
  'minimal/hero': MinimalHero,
  'minimal/featured': MinimalFeatured,
  'minimal/categories': MinimalCategories,
  // Bold theme overrides.
  'bold/hero': BoldHero,
  'bold/featured': BoldFeatured,
  'bold/categories': BoldCategories,
  // Dawnlight theme overrides.
  'dawnlight/hero': DawnlightHero,
  'dawnlight/featured': DawnlightFeatured,
  'dawnlight/categories': DawnlightCategories,
  // Pulse theme overrides.
  'pulse/hero': PulseHero,
  'pulse/featured': PulseFeatured,
  'pulse/categories': PulseCategories,
};

/**
 * Platform default components. Used when the active theme doesn't
 * ship an override for a section.
 */
const PLATFORM_DEFAULT_SECTIONS: Record<string, SectionComponent> = {
  hero: HeroGallery,
  // The platform's existing section renderer for featured / categories
  // lives inline in HomeView.tsx; the theme overrides replace that
  // wholesale. If a theme doesn't override these, HomeView uses
  // its inline JSX.
  featured: () => null,
  categories: () => null,
};

/**
 * Resolve a section component for the active theme.
 *
 * Returns the theme's override if one exists, otherwise the
 * platform default. Returns `null` if neither is available (the
 * home page should skip rendering in that case).
 */
export function useSection(sectionName: string): SectionComponent | null {
  const theme = useTheme();
  const key = `${theme.activeTheme}/${sectionName}`;
  const themed = THEME_SECTION_COMPONENTS[key];
  if (themed) return themed;
  return PLATFORM_DEFAULT_SECTIONS[sectionName] ?? null;
}

/**
 * Re-export the section heading so the platform's default
 * sections and theme overrides can use the same component.
 */
export { SectionHeading };
