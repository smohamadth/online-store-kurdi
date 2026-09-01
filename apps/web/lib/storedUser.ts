// ---------------------------------------------------------------------------
// Safe localStorage reads.
//
// The 'user' blob is written by this app but may be missing, truncated, from
// an older schema, or even from another app sharing the same origin (a dev
// server, a previous project, a leftover from a different store). An
// unguarded JSON.parse of it crashes the whole page at mount, so every
// consumer should go through readStoredUser() — corrupt data yields null,
// never an exception.
// ---------------------------------------------------------------------------

export interface StoredUser {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  [key: string]: unknown;
}

/** Read the localStorage 'user' blob; null when absent or not a plain object. */
export function readStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('user');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as StoredUser)
      : null;
  } catch {
    return null;
  }
}
