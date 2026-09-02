import { describe, it, expect, beforeEach } from 'vitest';
import { readStoredUser } from './storedUser';

describe('readStoredUser', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredUser()).toBeNull();
  });

  it('returns the parsed object for a valid blob', () => {
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'a@b.c', firstName: 'Ada' }));
    expect(readStoredUser()).toEqual({ id: 'u1', email: 'a@b.c', firstName: 'Ada' });
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    localStorage.setItem('user', '{not json!!');
    expect(readStoredUser()).toBeNull();
  });

  it('returns null for a valid-JSON non-object (array / string / null)', () => {
    localStorage.setItem('user', '[1,2]');
    expect(readStoredUser()).toBeNull();
    localStorage.setItem('user', '"hello"');
    expect(readStoredUser()).toBeNull();
    localStorage.setItem('user', 'null');
    expect(readStoredUser()).toBeNull();
  });

  it('returns null for an empty blob', () => {
    localStorage.setItem('user', '');
    expect(readStoredUser()).toBeNull();
  });

  /**
   * Regression: `phone` and `avatar` are part of the API's user projection and
   * are read by /admin/profile, but they were missing from the StoredUser
   * interface. They then resolved through the `[key: string]: unknown` index
   * signature and typed as `{}`, which does not assign to a `string` form
   * field — a compile error in `next build`. This asserts the fields survive a
   * round-trip and stay usable as strings.
   */
  it('preserves phone and avatar as typed string fields', () => {
    const stored = {
      id: 'u1',
      email: 'a@b.c',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+964 750 000 0000',
      avatar: 'https://cdn.example/a.png',
      role: 'admin',
    };
    localStorage.setItem('user', JSON.stringify(stored));

    const user = readStoredUser();
    expect(user).not.toBeNull();

    // Assigning to `string` is the actual regression check: this line does not
    // compile if the fields fall back to the `unknown` index signature.
    const phone: string = user?.phone ?? '';
    const avatar: string = user?.avatar ?? '';
    expect(phone).toBe('+964 750 000 0000');
    expect(avatar).toBe('https://cdn.example/a.png');
    expect(user?.role).toBe('admin');
  });
});
