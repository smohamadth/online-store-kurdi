import { describe, it, expect } from 'vitest';
import { APPEARANCE_TABS, appearanceTab, appearanceHref, appearanceSettings, hasHomeTemplate } from './designWorkflow';
import { DEFAULT_THEME } from './theme';

describe('design workflow boundaries', () => {
  it('has one homepage editor and redirects legacy sections bookmarks to it', () => {
    expect(APPEARANCE_TABS.map(([key]) => key)).not.toContain('sections');
    expect(appearanceTab('sections')).toBe('home');
    expect(appearanceTab('home')).toBe('home');
    expect(appearanceTab('missing')).toBe('theme');
    expect(appearanceTab(null)).toBe('theme');
  });

  it('routes template/preview selections through Appearance without activating anything', () => {
    expect(appearanceHref('home')).toBe('/admin/appearance?tab=home');
    expect(appearanceHref('theme', 'my-brand')).toBe('/admin/appearance?tab=theme&theme=my-brand');
    const query = new URL(appearanceHref('theme', 'a&tab=home'), 'https://shop.test').searchParams;
    expect(query.get('theme')).toBe('a&tab=home');
    expect(query.get('tab')).toBe('theme');
  });

  it('does not write legacy homepage switches, but keeps the real announcement switch', () => {
    const payload = appearanceSettings({ ...DEFAULT_THEME, showFeatured: false, showAnnouncement: true });
    for (const key of ['showFeatured', 'showCategories', 'showNewsletter', 'showTrustBar', 'showStats', 'showTestimonials', 'showNewArrivals', 'showDealCountdown']) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.showAnnouncement).toBe(true);
    expect(payload.primaryColor).toBe(DEFAULT_THEME.primaryColor);
    expect(payload.activeTheme).toBe('default');
    expect(DEFAULT_THEME).toHaveProperty('showFeatured'); // no schema migration or mutation
  });

  it('never treats a missing or empty template as the default homepage', () => {
    expect(hasHomeTemplate(undefined)).toBe(false);
    expect(hasHomeTemplate({ home: {} })).toBe(false);
    expect(hasHomeTemplate({ home: { blocks: [] } })).toBe(false);
    expect(hasHomeTemplate({ home: { blocks: [{ id: 'one' }] } })).toBe(true);
  });
});
