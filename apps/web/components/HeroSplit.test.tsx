/**
 * HeroSplit — the split (copy + media) hero layout for the platform
 * hero. Pins the essentials: the first banner's copy and CTA drive the
 * band, the media side falls back to the banner's own colour/gradient
 * when there is no photo, and nothing renders without a banner.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeroSplit from './HeroSplit';

const banner = (over: Partial<{ image: string; secondaryUrl: string }>) => ({
  id: 'b1',
  title: 'Summer collection',
  subtitle: 'New season',
  description: 'Up to 40% off selected styles.',
  image: '',
  overlayColor: 'linear-gradient(120deg,#7f1d1d,#f97316)',
  linkUrl: '/deals',
  buttonText: 'Shop the drop',
  secondaryText: 'Browse products',
  secondaryUrl: '/products',
  ...over,
});

describe('HeroSplit', () => {
  it('renders nothing without a banner', () => {
    const { container } = render(<HeroSplit banner={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the copy, CTA and secondary link from the banner', () => {
    const { container } = render(<HeroSplit banner={banner({})} />);
    expect(container.querySelector('[data-section="hero"]')).toBeTruthy();
    expect(container.textContent).toContain('Summer collection');
    expect(container.textContent).toContain('Up to 40% off selected styles.');
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.some((a) => a.getAttribute('href') === '/deals')).toBe(true);
    expect(links.some((a) => a.getAttribute('href') === '/products')).toBe(true);
  });

  it('omits the secondary link when the banner has none', () => {
    const { container } = render(
      <HeroSplit banner={banner({ secondaryUrl: '' })} />
    );
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.length).toBe(1);
  });

  it('uses the banner gradient as the media backdrop without an image', () => {
    const { container } = render(<HeroSplit banner={banner({})} />);
    expect(container.innerHTML).toContain('linear-gradient');
    expect(container.innerHTML).toContain('#7f1d1d');
  });

  it('uses the photo as the media backdrop when present', () => {
    const { container } = render(
      <HeroSplit banner={banner({ image: '/uploads/hero.jpg' })} />
    );
    expect(container.innerHTML).toContain('uploads/hero.jpg');
  });
});
