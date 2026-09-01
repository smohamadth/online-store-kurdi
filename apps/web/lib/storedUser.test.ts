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
});
