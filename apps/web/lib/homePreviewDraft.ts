/**
 * Same-origin draft for the Home builder iframe (`/?homePreview=`).
 *
 * The iframe cannot see React state in the admin tab, but it shares
 * sessionStorage. Only HomeView with `homePreview` in the query reads this;
 * the live storefront never does.
 */
import type { HomeSection } from '@/lib/homeSections';

export const HOME_PREVIEW_DRAFT_KEY = 'home-builder-preview-draft';

export function parseHomePreviewDraft(raw: string | null | undefined): HomeSection[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((r) => r && typeof r.id === 'string' && typeof r.type === 'string')) {
      return null;
    }
    return parsed as HomeSection[];
  } catch {
    return null;
  }
}

export function writeHomePreviewDraft(sections: HomeSection[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HOME_PREVIEW_DRAFT_KEY, JSON.stringify(sections));
  } catch {
    // Quota / private mode: preview falls back to the saved API layout.
  }
}

export function readHomePreviewDraft(): HomeSection[] | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseHomePreviewDraft(window.sessionStorage.getItem(HOME_PREVIEW_DRAFT_KEY));
  } catch {
    return null;
  }
}
