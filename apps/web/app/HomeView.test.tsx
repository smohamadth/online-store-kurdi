import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomeView from './HomeView';
import { ThemeContext, DEFAULT_THEME } from '@/lib/theme';
import { HomeSectionStack } from '@/components/HomeSectionStack';
import { writeHomePreviewDraft, clearHomePreviewDraft } from '@/lib/homePreviewDraft';
import type { HomeSection } from '@/lib/homeSections';

const saved: HomeSection = { id: 'saved', key: 'saved', type: 'richText', title: 'Saved home', subtitle: null, isVisible: true, sortOrder: 10, config: { html: '<p>Saved content</p>' } };
const draft: HomeSection = { ...saved, id: 'draft', title: 'Draft home' };

beforeEach(() => {
  sessionStorage.clear();
  global.fetch = vi.fn(async (url: any) => ({ ok: true, status: 200, json: async () => ({ data: String(url).includes('/home-sections') ? [saved] : [] }) })) as any;
});
afterEach(() => {
  clearHomePreviewDraft();
  window.history.replaceState(null, '', '/');
});

describe('homepage source of truth', () => {
  it.each(['/', '/?studioPreview=1'])('renders saved DB sections at %s, never a leftover editor draft', async (url) => {
    window.history.replaceState(null, '', url);
    writeHomePreviewDraft([draft]);
    render(<HomeView />);
    expect(await screen.findByRole('heading', { name: 'Saved home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Draft home' })).not.toBeInTheDocument();
  });

  it('reads a draft only in the explicitly marked Home editor preview', async () => {
    window.history.replaceState(null, '', '/?homePreview=1');
    writeHomePreviewDraft([draft]);
    render(<HomeView />);
    expect(await screen.findByRole('heading', { name: 'Draft home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Saved home' })).not.toBeInTheDocument();
  });

  it('uses block visibility even when old theme master switches disagree', () => {
    const sections: HomeSection[] = [
      { ...saved, type: 'newsletter', title: 'Visible newsletter' },
      { ...saved, id: 'hidden', title: 'Hidden section', isVisible: false },
    ];
    render(<ThemeContext.Provider value={{ theme: { ...DEFAULT_THEME, showNewsletter: false }, loading: false, reload() {} }}>
      <HomeSectionStack sections={sections} isMobile={false} perRow={4} currencySymbol="$" featuredProducts={[]}
        categories={[]} heroBanners={[]} promoBanners={[]} stripBanners={[]} newArrivals={[]} trending={[]} />
    </ThemeContext.Provider>);
    expect(screen.getByRole('heading', { name: 'Visible newsletter' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hidden section' })).not.toBeInTheDocument();
  });
});
