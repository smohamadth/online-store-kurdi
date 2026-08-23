/**
 * settings.ts — localStorage-backed store settings (the admin form uses
 * these for instant preview before saving).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadStoreSettings, saveStoreSettings, formatPrice } from './settings';

describe('loadStoreSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    const s = loadStoreSettings();
    expect(s.storeName).toBe('Online Store');
    expect(s.currency).toBe('USD');
    expect(s.maintenanceMode).toBe(false);
  });

  it('merges stored values over the defaults', () => {
    localStorage.setItem('storeSettings', JSON.stringify({ storeName: 'My Shop', currency: 'EUR' }));
    const s = loadStoreSettings();
    expect(s.storeName).toBe('My Shop');
    expect(s.currency).toBe('EUR');
    // The defaults still flow through for fields that weren't stored
    expect(s.maintenanceMode).toBe(false);
  });

  it('falls back to defaults when the stored JSON is corrupt', () => {
    localStorage.setItem('storeSettings', 'not-json{');
    const s = loadStoreSettings();
    expect(s.storeName).toBe('Online Store');
  });
});

describe('saveStoreSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists the merge and fires the change event', () => {
    const handler = () => { handler.calls += 1; };
    handler.calls = 0;
    window.addEventListener('settingsChange', handler);
    saveStoreSettings({ storeName: 'New' });
    const stored = JSON.parse(localStorage.getItem('storeSettings')!);
    expect(stored.storeName).toBe('New');
    // Defaults are preserved in the stored blob too
    expect(stored.currency).toBe('USD');
    expect(handler.calls).toBeGreaterThanOrEqual(1);
  });
});

describe('formatPrice', () => {
  it('prepends the currency symbol by default', () => {
    expect(formatPrice(10)).toBe('$10.00');
    expect(formatPrice(0)).toBe('$0.00');
    expect(formatPrice(3.5)).toBe('$3.50');
  });

  it('respects an override symbol', () => {
    expect(formatPrice(5, '€')).toBe('€5.00');
    expect(formatPrice(5, '₹')).toBe('₹5.00');
  });

  it('handles values that need rounding', () => {
    expect(formatPrice(0.1)).toBe('$0.10');
    expect(formatPrice(0.005)).toBe('$0.01');
  });
});
