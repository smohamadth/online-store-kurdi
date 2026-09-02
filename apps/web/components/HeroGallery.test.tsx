/**
 * HeroGallery unit + rendering tests.
 *
 * Covers the two things the storefront hero does beyond sliding:
 *   - background resolution when a slide has no image (gradients and
 *     solid overlay colours become the backdrop; scrim-like rgba values
 *     keep the classic dark band so white text stays readable), and
 *   - the design options (height preset, arrows/dots toggles) that the
 *     home builder's hero block feeds in via lib/heroOptions.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeroGallery, { looksLikeScrim, resolveSlideBackground } from './HeroGallery';
import DefaultHero from '@/themes/default/sections/Hero';

const slides = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    title: `Slide ${i + 1}`,
    image: '',
    overlayColor:
      i === 0
        ? 'linear-gradient(120deg,#7f1d1d,#f97316)'
        : 'linear-gradient(120deg,#064e3b,#10b981)',
    linkUrl: '/products',
    buttonText: 'Shop',
  }));

describe('looksLikeScrim / resolveSlideBackground', () => {
  it('uses gradients as the backdrop', () => {
    const g = 'linear-gradient(120deg,#1a1a2e,#0f3460)';
    expect(looksLikeScrim(g)).toBe(false);
    expect(resolveSlideBackground(g)).toBe(g);
  });

  it('uses solid colours (hex/rgb) as the backdrop', () => {
    expect(looksLikeScrim('#f59e0b')).toBe(false);
    expect(resolveSlideBackground('#f59e0b')).toBe('#f59e0b');
    expect(resolveSlideBackground('rgb(245, 158, 11)')).toBe('rgb(245, 158, 11)');
    expect(resolveSlideBackground('rgba(245, 158, 11, 1)')).toBe('rgba(245, 158, 11, 1)');
  });

  it('treats a low-alpha rgba as a scrim, not a backdrop', () => {
    expect(looksLikeScrim('rgba(0,0,0,0.35)')).toBe(true);
    expect(resolveSlideBackground('rgba(0,0,0,0.35)')).toBe(
      'linear-gradient(120deg, #1a1a2e, #16213e)'
    );
  });

  it('falls back to the dark band when nothing is supplied', () => {
    expect(looksLikeScrim('')).toBe(true);
    expect(looksLikeScrim(null)).toBe(true);
    expect(resolveSlideBackground('')).toBe('linear-gradient(120deg, #1a1a2e, #16213e)');
  });
});

describe('HeroGallery design options', () => {
  it('renders the standard 520px band by default', () => {
    const { container } = render(<HeroGallery banners={slides(1)} loaded={true} />);
    expect(container.querySelector('section')?.getAttribute('style')).toContain('height: 520px');
  });

  it('honours the compact and tall height presets', () => {
    const compact = render(<HeroGallery banners={slides(1)} loaded={true} height="compact" />);
    expect(compact.container.querySelector('section')?.getAttribute('style')).toContain('height: 400px');
    compact.unmount();
    const tall = render(<HeroGallery banners={slides(1)} loaded={true} height="tall" />);
    expect(tall.container.querySelector('section')?.getAttribute('style')).toContain('height: 640px');
    tall.unmount();
  });

  it('shows arrows and dots for a slideshow by default', () => {
    render(<HeroGallery banners={slides(2)} loaded={true} />);
    expect(screen.getByLabelText('Next slide')).toBeTruthy();
    expect(screen.getByLabelText('Go to slide 2')).toBeTruthy();
  });

  it('hides arrows and dots when switched off', () => {
    render(
      <HeroGallery banners={slides(2)} loaded={true} showArrows={false} showDots={false} />
    );
    expect(screen.queryByLabelText('Next slide')).toBeNull();
    expect(screen.queryByLabelText('Go to slide 2')).toBeNull();
  });

  it('renders a solid overlay colour as the imageless backdrop', () => {
    const { container } = render(
      <HeroGallery
        banners={[{ id: 'x', title: 'Amber band', image: '', overlayColor: '#f59e0b' }]}
        loaded={true}
      />
    );
    expect(container.innerHTML).toContain('#f59e0b');
  });
});

describe('DefaultHero (default theme hero) honours the hero config block', () => {
  const banners = [
    { id: 'a', title: 'First', image: '', overlayColor: 'linear-gradient(120deg,#1a1a2e,#0f3460)' },
    { id: 'b', title: 'Second', image: '', overlayColor: 'linear-gradient(120deg,#7f1d1d,#f97316)' },
  ];

  it('renders a slideshow by default', () => {
    const { container } = render(<DefaultHero banners={banners} />);
    expect(screen.getByLabelText('Next slide')).toBeTruthy();
    expect(container.innerHTML).toContain('First');
  });

  it('renders only the first slide for layout "single"', () => {
    const { container } = render(
      <DefaultHero banners={banners} config={{ hero: { layout: 'single' } }} />
    );
    expect(screen.queryByLabelText('Next slide')).toBeNull();
    expect(screen.queryByLabelText('Go to slide 2')).toBeNull();
    expect(container.innerHTML).toContain('First');
    // The second slide is aria-hidden even when inactive, so check content
    // count through the dots/aria instead: only one slide is registered.
    expect(container.querySelectorAll('[aria-roledescription="slide"]').length).toBe(1);
  });

  it('honours the compact height preset', () => {
    const { container } = render(
      <DefaultHero banners={banners} config={{ hero: { height: 'compact' } }} />
    );
    expect(container.querySelector('section')?.getAttribute('style')).toContain('height: 400px');
  });
});
