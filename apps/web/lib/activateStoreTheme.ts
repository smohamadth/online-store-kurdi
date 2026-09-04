/**
 * Activate a theme from the storefront preview chrome.
 *
 * The preview page used to PATCH localhost:3001 (wrong method, wrong host,
 * no admin token). The real contract is PUT /api/theme { activeTheme }
 * with a Bearer token — same as Admin → Appearance.
 */
import { CLIENT_API_BASE } from './apiBase';

export async function activateStoreTheme(
  themeKey: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) {
    return { ok: false, message: 'Sign in as admin to activate this theme.' };
  }
  try {
    const res = await fetch(`${CLIENT_API_BASE}/theme`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify({ activeTheme: themeKey }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { message?: string }));
      return {
        ok: false,
        message: (data as { message?: string })?.message || `Could not activate (${res.status})`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not reach the server.' };
  }
}
