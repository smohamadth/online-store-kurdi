/**
 * PromoGrid - the home page promo banner tiles.
 *
 * Untested until now. The cases below cover the two defects found by reading
 * it: a column count that produces a ragged last row, and a text scrim that
 * is pinned to left-to-right while the store ships three RTL locales.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PromoGrid from './PromoGrid';
import { I18nSeedProvider } from '@/lib/I18nSeedProvider';
import type { Banner } from './HeroGallery';

let mobile = false;
vi.mock('@/lib/hooks', () => ({ useIsMobile: () => mobile }));

function banners(n: number, over: Partial<Banner> = {}): Banner[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    title: `Banner ${i}`,
    position: 'promo',
    isActive: true,
    ...over,
  })) as unknown as Banner[];
}

/** The grid container carries the template; find it by that style. */
function gridOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[style*="grid-template-columns"]');
  if (!el) throw new Error('grid container not found');
  return el as HTMLElement;
}

describe('rendering', () => {
  it('renders nothing when there are no banners', () => {
    const { container } = render(<PromoGrid banners={[]} />);
    expect(container.textContent).toBe('');
  });

  it('renders each banner title', () => {
    render(<PromoGrid banners={banners(3)} />);
    expect(screen.getByText('Banner 0')).toBeTruthy();
    expect(screen.getByText('Banner 2')).toBeTruthy();
  });

  it('caps the grid at six tiles', () => {
    // The API can return any number of active promo banners; the home page
    // layout only has room for six.
    render(<PromoGrid banners={banners(9)} />);
    expect(screen.queryByText('Banner 5')).toBeTruthy();
    expect(screen.queryByText('Banner 6')).toBeNull();
  });

  it('links a tile only when it has a destination', () => {
    const { container, rerender } = render(<PromoGrid banners={banners(1)} />);
    expect(container.querySelector('a')).toBeNull();
    rerender(<PromoGrid banners={banners(1, { linkUrl: '/deals' })} />);
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/deals');
  });
});

describe('column layout', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [6, 3],
  ])('lays %i banners out in %i columns', (n, cols) => {
    const { container } = render(<PromoGrid banners={banners(n)} />);
    expect(gridOf(container).style.gridTemplateColumns).toBe(`repeat(${cols}, 1fr)`);
  });

  it('uses two columns for four banners, not three', () => {
    // Regression: cols was min(length, 3), so four banners rendered as a row
    // of three plus one lone tile stretched to a third of the width. 2x2 is
    // the balanced layout.
    const { container } = render(<PromoGrid banners={banners(4)} />);
    expect(gridOf(container).style.gridTemplateColumns).toBe('repeat(2, 1fr)');
  });

  it('never leaves a single orphan tile on the last row', () => {
    // The general property behind the case above: for every count the grid
    // supports, the final row must not contain exactly one tile while the
    // rows above are full.
    for (let n = 2; n <= 6; n++) {
      const { container, unmount } = render(<PromoGrid banners={banners(n)} />);
      const m = /repeat\((\d+), 1fr\)/.exec(gridOf(container).style.gridTemplateColumns);
      const cols = Number(m![1]);
      const lastRow = n % cols || cols;
      expect(lastRow === cols || lastRow > 1, `${n} banners in ${cols} columns orphans a tile`)
        .toBe(true);
      unmount();
    }
  });

  it('collapses to a single column on mobile', () => {
    mobile = true;
    const { container } = render(<PromoGrid banners={banners(6)} />);
    expect(gridOf(container).style.gridTemplateColumns).toBe('1fr');
    mobile = false;
  });
});

describe('right-to-left', () => {
  it('runs the text scrim from the start edge in RTL', () => {
    // The scrim is a 90deg gradient going dark -> transparent, so the text
    // sits over the dark end. Hardcoded to `90deg` it always darkens the LEFT,
    // while RTL text starts on the RIGHT - leaving the copy over the light
    // end of the gradient and effectively unreadable.
    const { container } = render(
      <I18nSeedProvider value={{ lang: 'ku', dir: 'rtl' }}>
        <PromoGrid banners={banners(1)} />
      </I18nSeedProvider>,
    );
    const scrim = Array.from(container.querySelectorAll("div")).find((d) =>
      d.getAttribute('style')?.includes('linear-gradient(2'),
    );
    expect(scrim, 'RTL scrim should run 270deg so the dark end is on the right')
      .toBeTruthy();
  });

  it('keeps the LTR scrim direction by default', () => {
    const { container } = render(<PromoGrid banners={banners(1)} />);
    const scrim = Array.from(container.querySelectorAll("div")).find((d) =>
      d.getAttribute('style')?.includes('linear-gradient(9'),
    );
    expect(scrim).toBeTruthy();
  });
});

describe('content safety', () => {
  it('renders optional fields only when present', () => {
    const { container } = render(<PromoGrid banners={banners(1)} />);
    // Only the title is set, so no subtitle/description/button text appears.
    expect(container.textContent).toBe('Banner 0');
  });

  it('shows subtitle, description and button text when given', () => {
    render(
      <PromoGrid
        banners={banners(1, { subtitle: 'SALE', description: 'Half price', buttonText: 'Shop' })}
      />,
    );
    expect(screen.getByText('SALE')).toBeTruthy();
    expect(screen.getByText('Half price')).toBeTruthy();
    expect(screen.getByText(/Shop/)).toBeTruthy();
  });
});
