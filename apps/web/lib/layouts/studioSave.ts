import type { PageKey, PageLayout } from './types';
import { homeStackLayout } from './homeStack';

/** Merge in-memory page drafts onto the last saved layouts. */
export function mergeStudioLayouts(
  saved: Record<string, unknown> | undefined,
  drafts: Partial<Record<PageKey, PageLayout>>,
): Record<string, unknown> {
  const layouts = { ...(saved ?? {}), ...drafts };
  const home = layouts.home as PageLayout | undefined;
  if (home && Array.isArray(home.blocks)) layouts.home = homeStackLayout(home);
  return layouts;
}

export function studioHasUnsavedDrafts(
  drafts: Partial<Record<PageKey, PageLayout>>,
): boolean {
  return Object.keys(drafts).length > 0;
}
