/** Navigation and save boundaries for the store's design tools. */
import type { Theme } from './theme';

export const APPEARANCE_TABS = [
  ['theme', 'Themes'],
  ['home', 'Homepage'],
  ['colors', 'Colours'],
  ['typography', 'Typography'],
  ['layout', 'Layout & shape'],
  ['announcement', 'Announcement'],
  ['css', 'Custom CSS'],
] as const;

export type AppearanceTab = (typeof APPEARANCE_TABS)[number][0];

export function appearanceTab(value: string | null): AppearanceTab {
  // Old bookmarks should lead to the real visibility controls, never a dead tab.
  if (value === 'sections') return 'home';
  return APPEARANCE_TABS.some(([key]) => key === value) ? value as AppearanceTab : 'theme';
}

export function appearanceHref(tab: AppearanceTab = 'theme', themeKey?: string): string {
  const query = new URLSearchParams({ tab });
  if (themeKey) query.set('theme', themeKey);
  return `/admin/appearance?${query}`;
}

/**
 * Legacy DB columns stay backwards-compatible, but are no longer authored by
 * Appearance. HomeSection.isVisible is the only homepage visibility control.
 */
const LEGACY_HOME_SWITCHES = new Set([
  'showTrustBar', 'showTestimonials', 'showStats', 'showNewsletter',
  'showDealCountdown', 'showCategories', 'showFeatured', 'showNewArrivals',
]);

export function appearanceSettings(theme: Theme): Partial<Theme> {
  return Object.fromEntries(
    Object.entries(theme).filter(([key]) => !LEGACY_HOME_SWITCHES.has(key)),
  );
}

export function hasHomeTemplate(layouts: Record<string, unknown> | undefined): boolean {
  const home = layouts?.home as { blocks?: unknown[] } | undefined;
  return Array.isArray(home?.blocks) && home.blocks.length > 0;
}
