import type { PageKey, PageLayout } from './types';

/** Merge in-memory page drafts onto the last saved layouts. */
export function mergeStudioLayouts(
  saved: Record<string, unknown> | undefined,
  drafts: Partial<Record<PageKey, PageLayout>>,
): Record<string, unknown> {
  return { ...(saved ?? {}), ...drafts };
}

export function studioHasUnsavedDrafts(
  drafts: Partial<Record<PageKey, PageLayout>>,
): boolean {
  return Object.keys(drafts).length > 0;
}
