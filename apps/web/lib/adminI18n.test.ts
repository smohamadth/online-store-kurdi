import { describe, it, expect, beforeEach } from 'vitest';
import { adminT, readAdminLanguage, adminDictionaries } from './adminI18n';

describe('adminI18n', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to English for missing keys', () => {
    expect(adminT('ku', 'nav.orders')).toBe('داواکارییەکان');
    expect(adminT('xx', 'nav.orders')).toBe('Orders');
    expect(adminT('en', 'missing.key')).toBe('missing.key');
  });

  it('interpolates welcome name', () => {
    expect(adminT('fa', 'admin.welcome', { name: 'آدا' })).toBe('خوش آمدید، آدا');
  });

  it('covers every English chrome key in fa and ku', () => {
    for (const key of Object.keys(adminDictionaries.en)) {
      expect(adminDictionaries.fa[key], key).toBeTruthy();
      expect(adminDictionaries.ku[key], key).toBeTruthy();
    }
  });

  it('reads adminLanguage from localStorage', () => {
    expect(readAdminLanguage()).toBe('en');
    localStorage.setItem('adminLanguage', 'ku');
    expect(readAdminLanguage()).toBe('ku');
    localStorage.setItem('adminLanguage', 'nope');
    expect(readAdminLanguage()).toBe('en');
  });
});
