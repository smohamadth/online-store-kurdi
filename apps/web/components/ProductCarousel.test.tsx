/**
 * ProductCarousel - the horizontal product row on the home page and PDP.
 *
 * It is one of the highest-traffic components in the storefront and had no
 * test at all. The cases below cover three defects found by reading it, all
 * of which make products genuinely unreachable rather than merely ugly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductCarousel from './ProductCarousel';
import { I18nSeedProvider } from '@/lib/I18nSeedProvider';
import type { Product } from '@/lib/api';

// useIsMobile reads a media query; drive it explicitly per test.
let mobile = false;
vi.mock('@/lib/hooks', () => ({ useIsMobile: () => mobile }));

// ProductCard (rendered for each item) calls useCart. The carousel itself has
// no cart behaviour, so stub the store rather than wrapping every render in a
// provider - the same approach BundleOffer.test.tsx uses.
vi.mock('@/lib/store', () => ({
  useCart: () => ({ addItem: vi.fn(), items: [] }),
}));
vi.mock('@/lib/compare', () => ({
  useCompare: () => ({ isCompared: () => false, toggle: vi.fn(), items: [] }),
}));

function products(n: number): Product[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Product ${i}`,
    slug: `product-${i}`,
    price: 10 + i,
    images: [],
    category: { id: 'c', name: 'Cat', slug: 'cat' },
  })) as unknown as Product[];
}

/** Render inside an RTL seed, as the Kurdish/Arabic/Persian storefront does. */
function renderRtl(ui: React.ReactElement) {
  return render(
    <I18nSeedProvider value={{ lang: 'ku', dir: 'rtl' }}>{ui}</I18nSeedProvider>,
  );
}

let scrollBySpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mobile = false;
  // happy-dom does not implement Element.scrollBy at all, so install it before
  // any render rather than after - a component that reads it on mount would
  // otherwise see undefined.
  scrollBySpy = vi.fn();
  Element.prototype.scrollBy = scrollBySpy as never;
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
  // happy-dom has no layout engine: scrollWidth/clientWidth are always 0, so
  // the component's overflow measurement can never be true. Give it a row
  // that is wider than its viewport, which is the state under test.
  setLayout({ scrollWidth: 2400, clientWidth: 1160 });
});

/** Fake the layout numbers the carousel measures. */
function setLayout({ scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true, get() { return scrollWidth; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true, get() { return clientWidth; },
  });
}

describe('rendering', () => {
  it('renders the title and every product', () => {
    render(<ProductCarousel title="New arrivals" products={products(3)} />);
    expect(screen.getByText('New arrivals')).toBeTruthy();
    expect(screen.getByText('Product 0')).toBeTruthy();
    expect(screen.getByText('Product 2')).toBeTruthy();
  });

  it('renders nothing at all when there are no products', () => {
    // An empty "New arrivals" heading is worse than silence.
    const { container } = render(<ProductCarousel title="New arrivals" products={[]} />);
    expect(container.textContent).toBe('');
  });

  it('shows the subtitle only when given', () => {
    const { rerender } = render(<ProductCarousel title="T" products={products(2)} />);
    expect(screen.queryByText('Sub')).toBeNull();
    rerender(<ProductCarousel title="T" subtitle="Sub" products={products(2)} />);
    expect(screen.getByText('Sub')).toBeTruthy();
  });

  it('links "View all" only when a destination is given', () => {
    const { rerender } = render(<ProductCarousel title="T" products={products(2)} />);
    expect(screen.queryByText(/View all/)).toBeNull();
    rerender(<ProductCarousel title="T" products={products(2)} viewAllHref="/products" />);
    expect(screen.getByText(/View all/).closest('a')!.getAttribute('href')).toBe('/products');
  });
});

describe('scroll affordance', () => {
  it('offers arrows when the row overflows', () => {
    render(<ProductCarousel title="T" products={products(8)} />);
    expect(screen.getByLabelText('Scroll left')).toBeTruthy();
    expect(screen.getByLabelText('Scroll right')).toBeTruthy();
  });

  it('hides arrows on mobile, where the row is swipeable', () => {
    mobile = true;
    render(<ProductCarousel title="T" products={products(8)} />);
    expect(screen.queryByLabelText('Scroll left')).toBeNull();
  });

  it('offers arrows whenever the content actually overflows, not at a fixed count', () => {
    // Regression: the threshold was a hardcoded `products.length > 4`, chosen
    // for a 1200px container. On a narrower desktop window four cards already
    // overflow - and the scrollbar is deliberately hidden - so those products
    // were unreachable by any means.
    Object.defineProperty(window, 'innerWidth', { value: 820, configurable: true });
    render(<ProductCarousel title="T" products={products(4)} />);
    expect(
      screen.queryByLabelText('Scroll right'),
      'four cards overflow an 820px window; arrows must appear',
    ).toBeTruthy();
  });

  it('does not offer arrows when everything fits', () => {
    setLayout({ scrollWidth: 500, clientWidth: 1160 });
    render(<ProductCarousel title="T" products={products(2)} />);
    expect(screen.queryByLabelText('Scroll right')).toBeNull();
  });

  it('starts with the back arrow disabled', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    render(<ProductCarousel title="T" products={products(8)} />);
    expect(screen.getByLabelText('Scroll left').hasAttribute('disabled')).toBe(true);
  });

  it('scrolls the row when an arrow is pressed', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    render(<ProductCarousel title="T" products={products(8)} />);
    fireEvent.click(screen.getByLabelText('Scroll right'));
    expect(scrollBySpy).toHaveBeenCalled();
    const arg = scrollBySpy.mock.calls[0][0] as { left: number };
    expect(arg.left).toBeGreaterThan(0);
  });
});

describe('right-to-left', () => {
  it('scrolls toward the start of the row in RTL', () => {
    // In RTL a flex row scrolls with NEGATIVE scrollLeft, so "next" must move
    // left, not right. Sending a positive delta walks away from the content
    // and the row appears frozen.
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    renderRtl(<ProductCarousel title="T" products={products(8)} />);
    fireEvent.click(screen.getByLabelText('Scroll right'));

    const arg = scrollBySpy.mock.calls[0][0] as { left: number };
    expect(arg.left, 'RTL "next" must scroll toward negative scrollLeft').toBeLessThan(0);
  });

  it('mirrors the arrow glyphs in RTL', () => {
    // The glyphs were hardcoded to a LTR chevron pair, so in Kurdish/Arabic
    // the "next" button visually pointed back the way the reader came.
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    renderRtl(<ProductCarousel title="T" products={products(8)} />);

    const next = screen.getByLabelText('Scroll right');
    expect(next.textContent).toBe('\u2039');   // ‹ points left, i.e. forward in RTL
    const back = screen.getByLabelText('Scroll left');
    expect(back.textContent).toBe('\u203a');   // ›
  });

  it('keeps the LTR glyphs in LTR', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    render(<ProductCarousel title="T" products={products(8)} />);
    expect(screen.getByLabelText('Scroll right').textContent).toBe('\u203a');
    expect(screen.getByLabelText('Scroll left').textContent).toBe('\u2039');
  });
});

describe('accessibility', () => {
  it('labels both arrows for screen readers', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    render(<ProductCarousel title="T" products={products(8)} />);
    expect(screen.getByLabelText('Scroll left')).toBeTruthy();
    expect(screen.getByLabelText('Scroll right')).toBeTruthy();
  });

  it('exposes the row as a scrollable region a keyboard can reach', () => {
    // A div with overflow:auto is only keyboard-scrollable if it is focusable.
    // Without this the arrows are the ONLY way through the row, and they are
    // hidden on mobile.
    render(<ProductCarousel title="T" products={products(8)} />);
    const regions = screen.getAllByRole('region', { name: /T/i });
    const scrollable = regions.find((r) => r.getAttribute('tabindex') === '0');
    expect(scrollable, 'the scrolling row must be keyboard-focusable').toBeTruthy();
  });
});
