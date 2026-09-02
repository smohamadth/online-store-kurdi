/**
 * Hero section design options.
 *
 * The home page's "hero" row (HomeBuilder → the hero block) can carry a
 * small design block in its `config.hero`:
 *
 * ```json
 * "hero": {
 *   "layout": "slideshow" | "single" | "split",
 *   "height": "compact" | "standard" | "tall",
 *   "autoPlay": true | false,
 *   "intervalSec": 3-10,
 *   "arrows": true | false,
 *   "dots": true | false
 * }
 * ```
 *
 * The storefront (HomeView), the default theme's hero and HeroGallery all
 * normalise this config through `heroOptionsFromConfig`, so an empty or
 * malformed block always falls back to the classic behaviour (slideshow,
 * standard height, autoplay every 6s, arrows + dots on). Unknown keys are
 * ignored; wrong-typed values fall back per key.
 */

export type HeroLayout = 'slideshow' | 'single' | 'split';
export type HeroHeight = 'compact' | 'standard' | 'tall';

export interface HeroOptions {
  /**
   * slideshow = rotate through the active banners;
   * single = first banner only, no motion;
   * split = first banner as a copy+media split band (platform hero only).
   */
  layout: HeroLayout;
  /** Desktop hero band height. Mobile scales down automatically. */
  height: HeroHeight;
  /** Autoplay the slideshow. Only meaningful for the slideshow layout. */
  autoPlay: boolean;
  /** Autoplay delay in milliseconds. */
  autoPlayMs: number;
  showArrows: boolean;
  showDots: boolean;
}

export const HERO_DEFAULTS: HeroOptions = {
  layout: 'slideshow',
  height: 'standard',
  autoPlay: true,
  autoPlayMs: 6000,
  showArrows: true,
  showDots: true,
};

/** Pixels per height preset (desktop / mobile). */
export const HERO_HEIGHT_PX: Record<HeroHeight, { desktop: number; mobile: number }> = {
  compact: { desktop: 400, mobile: 320 },
  standard: { desktop: 520, mobile: 420 },
  tall: { desktop: 640, mobile: 520 },
};

export const HERO_LAYOUTS: readonly HeroLayout[] = ['slideshow', 'single', 'split'];
export const HERO_HEIGHTS: readonly HeroHeight[] = ['compact', 'standard', 'tall'];

/** Options a store owner can set; keys match the HomeBuilder form. */
export interface HeroConfigInput {
  layout?: unknown;
  height?: unknown;
  autoPlay?: unknown;
  intervalSec?: unknown;
  arrows?: unknown;
  dots?: unknown;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
};

const boolOf = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

/**
 * Normalise a home-section row's `config.hero` block into the full
 * HeroOptions shape. Anything missing/invalid falls back per key, so
 * existing rows (which have no hero block at all) keep the classic
 * slideshow exactly as before.
 */
export function heroOptionsFromConfig(
  input?: HeroConfigInput | Record<string, unknown> | null
): HeroOptions {
  const raw = (input ?? {}) as Record<string, unknown>;
  const layout = HERO_LAYOUTS.includes(raw.layout as HeroLayout)
    ? (raw.layout as HeroLayout)
    : HERO_DEFAULTS.layout;
  const height = HERO_HEIGHTS.includes(raw.height as HeroHeight)
    ? (raw.height as HeroHeight)
    : HERO_DEFAULTS.height;
  const autoPlay =
    layout === 'slideshow' ? boolOf(raw.autoPlay, HERO_DEFAULTS.autoPlay) : false;
  const intervalSec = clampInt(raw.intervalSec, 3, 10, 6);
  return {
    layout,
    height,
    autoPlay,
    autoPlayMs: intervalSec * 1000,
    showArrows:
      layout === 'slideshow' ? boolOf(raw.arrows, HERO_DEFAULTS.showArrows) : false,
    showDots:
      layout === 'slideshow' ? boolOf(raw.dots, HERO_DEFAULTS.showDots) : false,
  };
}
