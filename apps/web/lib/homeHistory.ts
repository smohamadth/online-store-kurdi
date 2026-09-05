/**
 * Browser-local home-builder version history.
 *
 * Each successful save/reorder/add/delete/reset pushes a snapshot so the
 * admin can restore an earlier layout without a new API table. Caps at 20.
 */
import type { HomeSection } from '@/lib/homeSections';

export const HOME_HISTORY_KEY = 'home-builder-versions';
export const HOME_HISTORY_CAP = 20;

export interface HomeVersion {
  id: string;
  at: string;
  sections: HomeSection[];
}

export function parseHomeVersions(raw: string | null | undefined): HomeVersion[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v) => v && typeof v.id === 'string' && Array.isArray(v.sections),
    ) as HomeVersion[];
  } catch {
    return [];
  }
}

export function pushHomeVersion(
  existing: HomeVersion[],
  sections: HomeSection[],
  now = new Date(),
): HomeVersion[] {
  const next: HomeVersion = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    at: now.toISOString(),
    sections: JSON.parse(JSON.stringify(sections)),
  };
  return [next, ...existing].slice(0, HOME_HISTORY_CAP);
}

export function loadHomeVersions(): HomeVersion[] {
  if (typeof window === 'undefined') return [];
  return parseHomeVersions(window.localStorage.getItem(HOME_HISTORY_KEY));
}

export function persistHomeVersions(versions: HomeVersion[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HOME_HISTORY_KEY, JSON.stringify(versions));
}

export function recordHomeVersion(sections: HomeSection[]): HomeVersion[] {
  const next = pushHomeVersion(loadHomeVersions(), sections);
  persistHomeVersions(next);
  return next;
}
