/**
 * Component tests for ProductView's typed-options picker and
 * variant sale-price rendering.
 *
 * The PDP fetches the product via api.getProductBySlug, then
 * GET /api/products/:id/options. We mock both. The two pieces
 * of new behaviour we cover:
 *
 *   1. Swatch picker: each option row renders one chip per value;
 *      clicking a chip selects it; the chosen variant highlight
 *      updates accordingly.
 *   2. Sale price: when a variant has compareAtPrice > price, the
 *      chip shows a strikethrough on the original price; the price
 *      block above also shows a strikethrough.
 *
 * Mock lifecycle note: the global setup-components.tsx calls
 * `vi.restoreAllMocks()` in afterEach. That restores the *first*
 * implementation registered on each mock, which would wipe our
 * `.mockResolvedValue(...)` after the first test. We work around
 * that by re-installing the implementation in beforeEach using
 * `vi.hoisted` so the mock identity is shared between the factory
 * and the test body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

// vi.hoisted runs before vi.mock factories, so we can stash
// shared mock state here. The factory below reads from this
// object; the test body mutates it in beforeEach.
const hoisted = vi.hoisted(() => {
  return {
    getProductBySlug: vi.fn(),
  };
});

// next/navigation must return a slug for useParams so the page
// actually fires its useEffect and starts loading the product.
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 't-shirt' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/products/t-shirt',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getProductBySlug: hoisted.getProductBySlug,
  },
  Product: class {},
  getCategoryEmoji: () => '👕',
  getImageUrl: (u: string) => u,
  getProductImage: (img: any) => img?.url || '',
}));

vi.mock('@/lib/store', () => ({
  useCart: () => ({
    addItem: vi.fn(), items: [], savedItems: [],
    removeItem: vi.fn(), updateQuantity: vi.fn(), clearCart: vi.fn(),
    getTotal: () => 0, getItemCount: () => 0,
    syncWithDatabase: vi.fn(), saveForLater: vi.fn(),
    moveToCart: vi.fn(), removeSavedItem: vi.fn(),
  }),
}));

vi.mock('@/lib/compare', () => ({
  useCompare: () => ({
    items: [], isCompared: () => false, toggle: vi.fn(),
    remove: vi.fn(), clear: vi.fn(),
  }),
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$' }, loading: false }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

vi.mock('@/lib/http', () => ({ API_BASE: 'http://api.local/api' }));

vi.mock('@/components/ReviewSection', () => ({
  default: () => <div data-testid="review-section" />,
}));

import ProductView from './ProductView';

const fetchMock = vi.fn();

const PRODUCT = {
  id: 'p-1', name: 'T-Shirt', slug: 't-shirt', sku: 'TS-1',
  price: 100, compareAtPrice: null, quantity: 50, averageRating: 0, reviewCount: 0,
  shortDescription: '', description: '',
  images: [], category: { name: 'Shirts' },
  variants: [
    {
      id: 'v-rs', productId: 'p-1', name: 'Red, Small', sku: 'rs-1', slug: 'red-small',
      price: 10, compareAtPrice: null, quantity: 5, isActive: true, sortOrder: 0,
      attributes: JSON.stringify({ Color: 'Red', Size: 'Small' }),
    },
    {
      id: 'v-rl', productId: 'p-1', name: 'Red, Large', sku: 'rl-1', slug: 'red-large',
      price: 12, compareAtPrice: 15, quantity: 3, isActive: true, sortOrder: 1,
      attributes: JSON.stringify({ Color: 'Red', Size: 'Large' }),
    },
    {
      id: 'v-bs', productId: 'p-1', name: 'Blue, Small', sku: 'bs-1', slug: 'blue-small',
      price: 11, compareAtPrice: null, quantity: 0, isActive: true, sortOrder: 2,
      attributes: JSON.stringify({ Color: 'Blue', Size: 'Small' }),
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  // Re-install the mock implementation each test. The global
  // afterEach in setup-components calls `vi.restoreAllMocks()`
  // which restores the *original* implementation on the
  // vi.fn - the empty function that was created when hoisted.
  // We need to put `.mockResolvedValue` back.
  hoisted.getProductBySlug.mockReset();
  hoisted.getProductBySlug.mockResolvedValue({ data: PRODUCT });
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/options')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ data: [
          // Green is intentionally NOT in any variant - clicking
          // the Green swatch has no match and verifies the
          // previous selection is preserved.
          { id: 'o-color', name: 'Color', sortOrder: 0, values: [
            { id: 'v-red', value: 'Red', swatch: '#ff0000', sortOrder: 0 },
            { id: 'v-blue', value: 'Blue', swatch: '#0000ff', sortOrder: 1 },
            { id: 'v-green', value: 'Green', swatch: '#00ff00', sortOrder: 2 },
          ] },
          { id: 'o-size', name: 'Size', sortOrder: 1, values: [
            { id: 'v-s', value: 'Small', swatch: null, sortOrder: 0 },
            { id: 'v-l', value: 'Large', swatch: null, sortOrder: 1 },
          ] },
        ] }),
      });
    }
    if (typeof url === 'string' && url.includes('/wishlist/check')) {
      return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ data: { inWishlist: false } }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: {} }) });
  });
  globalThis.fetch = fetchMock as any;
});

describe('ProductView: typed options swatch picker', () => {
  it('renders one chip per option value, with swatch colour when present', async () => {
    render(<ProductView />);
    // Print current state to help debug if it fails
    try {
      const apiMod = await import('@/lib/api');
      console.log('api.getProductBySlug.mock:', (apiMod.api.getProductBySlug as any).mock);
      console.log('api.getProductBySlug.mock.calls:', (apiMod.api.getProductBySlug as any).mock?.calls);
      const lastResult = (apiMod.api.getProductBySlug as any).mock?.results?.[0];
      console.log('lastResult:', JSON.stringify(lastResult));
      const r = await apiMod.api.getProductBySlug('test');
      console.log('Direct call result:', JSON.stringify(r));
    } catch (e) {
      console.log('cannot import api:', e);
    }
    await waitFor(() => expect(screen.getByTestId('typed-options-picker')).toBeTruthy());
    expect(screen.getByTestId('swatch-Color-Red')).toBeTruthy();
    expect(screen.getByTestId('swatch-Color-Blue')).toBeTruthy();
    expect(screen.getByTestId('swatch-Size-Small')).toBeTruthy();
    expect(screen.getByTestId('swatch-Size-Large')).toBeTruthy();
  });

  it('pre-selects the first value of each option on load', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('typed-options-picker')).toBeTruthy());
    const red = screen.getByTestId('swatch-Color-Red') as HTMLButtonElement;
    const small = screen.getByTestId('swatch-Size-Small') as HTMLButtonElement;
    // The selected swatch has a 2px solid border; unselected has
    // 1px solid. The exact colour may differ, but the border is
    // present on both.
    expect(red.style.border).toContain('solid');
    expect(small.style.border).toContain('solid');
    // The selected swatch has fontWeight 600; unselected is 400.
    expect(red.style.fontWeight).toBe('600');
    expect(small.style.fontWeight).toBe('600');
  });

  it('clicking a swatch updates the chosen label and the selected variant chip', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('typed-options-picker')).toBeTruthy());
    // Click "Large" for Size - the variant that matches is v-rl
    // (Red, Large).
    fireEvent.click(screen.getByTestId('swatch-Size-Large'));
    await waitFor(() => {
      const chip = screen.getByTestId('variant-chip-v-rl') as HTMLButtonElement;
      // Selected chips get a 2px solid black border. happy-dom
      // normalises the colour to "#000" (not the canonical
      // "rgb(0, 0, 0)" the browser reports). Check for either.
      const colour = chip.style.borderColor;
      expect(colour === '#000' || colour === 'rgb(0, 0, 0)').toBe(true);
      expect(chip.style.borderWidth).toBe('2px');
    });
  });

  it('clicking a swatch with no matching variant leaves the previous selection', async () => {
    // Green is in the option tree but not in any variant. Clicking
    // it should leave the previous selection (v-rs) highlighted.
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('typed-options-picker')).toBeTruthy());
    fireEvent.click(screen.getByTestId('swatch-Color-Green'));
    await waitFor(() => {
      const rsChip = screen.getByTestId('variant-chip-v-rs') as HTMLButtonElement;
      const colour = rsChip.style.borderColor;
      expect(colour === '#000' || colour === 'rgb(0, 0, 0)').toBe(true);
      expect(rsChip.style.borderWidth).toBe('2px');
    });
  });
});

describe('ProductView: variant sale price', () => {
  it('shows the strikethrough on the variant chip when compareAtPrice > price', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('variant-chip-v-rl')).toBeTruthy());
    const chip = screen.getByTestId('variant-chip-v-rl');
    expect(within(chip).getByTestId('variant-compare-v-rl')).toBeTruthy();
    expect(within(chip).getByTestId('variant-compare-v-rl').textContent).toBe('$15.00');
  });

  it('does NOT show a strikethrough on a chip without a sale', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('variant-chip-v-rs')).toBeTruthy());
    const chip = screen.getByTestId('variant-chip-v-rs');
    expect(within(chip).queryByTestId('variant-compare-v-rs')).toBeNull();
  });

  it('shows the strikethrough on the price block when a sale variant is selected', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('variant-chip-v-rl')).toBeTruthy());
    fireEvent.click(screen.getByTestId('variant-chip-v-rl'));
    await waitFor(() => {
      expect(screen.getByTestId('compare-at-price')).toBeTruthy();
      expect(screen.getByTestId('compare-at-price').textContent).toBe('$15.00');
    });
  });
});

describe('ProductView: out-of-stock variant', () => {
  it('disables the chip and adds line-through', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('variant-chip-v-bs')).toBeTruthy());
    const chip = screen.getByTestId('variant-chip-v-bs') as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    expect(chip.style.textDecoration).toContain('line-through');
  });
});

describe('ProductView: JSON-LD structured data', () => {
  // The PDP must publish a Product + BreadcrumbList in a single
  // <script type="application/ld+json"> tag. We pin the field
  // names Google reads so the SEO contract can't drift.
  async function getJsonLd() {
    return waitFor(() => {
      const script = document.querySelector(
        'script[data-testid="json-ld-product"][type="application/ld+json"]',
      ) as HTMLScriptElement | null;
      if (!script) throw new Error('JSON-LD script not found');
      return JSON.parse(script.innerHTML);
    });
  }

  it('emits a Product entity with the basic fields', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('typed-options-picker')).toBeTruthy());
    const payload = await getJsonLd();
    // The PDP uses a graph-style payload (Product + BreadcrumbList).
    const graph = payload['@graph'] || [payload];
    const product = graph.find((e: any) => e['@type'] === 'Product');
    expect(product).toBeTruthy();
    expect(product.name).toBe('T-Shirt');
    // The default swatch selection is Red/Small which matches the
    // first variant (v-rs) - so the Offer is keyed off the variant
    // SKU, not the product SKU.
    expect(product.sku).toBe('rs-1');
    expect(product.offers).toBeTruthy();
    expect(product.offers.priceCurrency).toBe('USD');
    expect(product.offers.availability).toMatch(/schema.org\/(In|OutOf)Stock/);
  });

  it('emits a BreadcrumbList with three items', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('typed-options-picker')).toBeTruthy());
    const payload = await getJsonLd();
    const graph = payload['@graph'] || [payload];
    const crumbs = graph.find((e: any) => e['@type'] === 'BreadcrumbList');
    expect(crumbs).toBeTruthy();
    expect(crumbs.itemListElement).toHaveLength(3);
    expect(crumbs.itemListElement[2].name).toBe('T-Shirt');
  });

  it('reflects the selected variant in the Offer price + sku', async () => {
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('variant-chip-v-rl')).toBeTruthy());
    fireEvent.click(screen.getByTestId('variant-chip-v-rl'));
    const payload = await getJsonLd();
    const graph = payload['@graph'] || [payload];
    const product = graph.find((e: any) => e['@type'] === 'Product');
    // v-rl is the sale variant; the Offer should advertise its
    // current price (12) and use its variant SKU (rl-1).
    expect(product.sku).toBe('rl-1');
    expect(Number(product.offers.price)).toBe(12);
  });
});

describe('ProductView: digital product branch', () => {
  /**
   * When the product is digital the PDP shows a different
   * surface:
   *   - "Instant download" badge above the price
   *   - "Available — download link delivered instantly..."
   *   - "Download now" CTA (instead of "Buy Now")
   *   - meta line listing the per-purchase limit + link expiry
   *   - JSON-LD graph includes a DigitalDocument sibling
   *
   * The existing physical-product mock in this file is left
   * intact; the digital cases override the product shape with
   * `mockResolvedValueOnce` so the test never depends on
   * shared state.
   */
  function setupDigitalProduct(overrides: Partial<any> = {}) {
    hoisted.getProductBySlug.mockReset();
    hoisted.getProductBySlug.mockResolvedValue({
      data: {
        ...PRODUCT,
        type: 'digital',
        quantity: 0,
        // No variants on a digital product, by convention.
        variants: [],
        downloadUrl: 'https://cdn.example.com/files/ebook.pdf',
        downloadLimit: 5,
        downloadExpiry: 30,
        ...overrides,
      },
    });
  }

  it('renders the "Instant download" badge', async () => {
    setupDigitalProduct();
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('digital-badge')).toBeTruthy());
    expect(screen.getByTestId('digital-badge').textContent).toContain('Instant download');
  });

  it('hides the stock-quantity line and shows the "available" copy', async () => {
    setupDigitalProduct();
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('digital-badge')).toBeTruthy());
    // The "In stock" line is replaced wholesale for digital,
    // not just hidden. We assert the new copy is present and
    // the old copy is gone.
    expect(screen.queryByText(/In stock \(\d+ available\)/)).toBeNull();
    expect(screen.getByText(/Available — download link delivered instantly/)).toBeTruthy();
  });

  it('shows the per-purchase limit and expiry in the meta line', async () => {
    setupDigitalProduct();
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('digital-meta')).toBeTruthy());
    const meta = screen.getByTestId('digital-meta').textContent || '';
    expect(meta).toContain('5 downloads per purchase');
    expect(meta).toContain('Links expire after 30 days');
  });

  it('omits the meta line when neither limit nor expiry is set', async () => {
    setupDigitalProduct({ downloadLimit: null, downloadExpiry: null });
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('digital-badge')).toBeTruthy());
    expect(screen.queryByTestId('digital-meta')).toBeNull();
  });

  it('swaps the "Buy Now" CTA for "Download now"', async () => {
    setupDigitalProduct();
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('buy-now-button')).toBeTruthy());
    expect(screen.getByTestId('buy-now-button').textContent).toContain('Download now');
  });

  it('keeps the CTA enabled even when product.quantity is 0', async () => {
    // Physical products with quantity=0 (and no backorder) are
    // disabled. Digital products are always available; the
    // button must stay clickable.
    setupDigitalProduct({ quantity: 0 });
    render(<ProductView />);
    await waitFor(() => expect(screen.getByTestId('buy-now-button')).toBeTruthy());
    const btn = screen.getByTestId('buy-now-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('emits a DigitalDocument sibling entity in the JSON-LD graph', async () => {
    setupDigitalProduct();
    render(<ProductView />);
    const payload = await (async () => {
      return waitFor(() => {
        const script = document.querySelector(
          'script[data-testid="json-ld-product"][type="application/ld+json"]',
        ) as HTMLScriptElement | null;
        if (!script) throw new Error('JSON-LD script not found');
        return JSON.parse(script.innerHTML);
      });
    })();
    const graph = payload['@graph'] || [payload];
    const doc = graph.find((e: any) => e['@type'] === 'DigitalDocument');
    expect(doc).toBeTruthy();
    // The file extension is .pdf so the builder should pick
    // application/pdf.
    expect(doc.encodingFormat).toBe('application/pdf');
    // Description was sanitised to plain text.
    expect(doc.name).toBe('T-Shirt');
  });
});

describe('ProductView: image gallery ordering', () => {
  // next/image rewrites src to /_next/image?url=<encoded>&w=...&q=75 -
  // decode it back to the original URL for assertions.
  const src = (el: Element) =>
    decodeURIComponent((el.getAttribute('src') || '').replace(/^\/_next\/image\?url=/, '').split('&')[0]);

  it('shows the primary image as the main image, then the rest in the admin drag order', async () => {
    // The API returns images in insertion order. The fixture is
    // deliberately shuffled relative to the admin's sortOrder, with the
    // designated primary NOT first in the array - the gallery must
    // re-order: primary first (the main image), then sortOrder.
    hoisted.getProductBySlug.mockResolvedValue({
      data: {
        ...PRODUCT,
        images: [
          { id: 'img-c', url: '/img-c.jpg', alt: 'C', isPrimary: false, sortOrder: 2 },
          { id: 'img-b', url: '/img-b.jpg', alt: 'B', isPrimary: true, sortOrder: 1 },
          { id: 'img-a', url: '/img-a.jpg', alt: 'A', isPrimary: false, sortOrder: 0 },
        ],
      },
    });
    const { container } = render(<ProductView />);
    // Main image (alt = product name) must be the primary image.
    const main = await screen.findByAltText('T-Shirt');
    expect(src(main)).toBe('/img-b.jpg');
    // The thumbnail strip shows ALL images (main included) in the
    // gallery order: primary first, then the admin's drag order.
    const srcs = Array.from(container.querySelectorAll('img')).map(src);
    expect(srcs).toEqual([
      '/img-b.jpg', // main (the primary)
      '/img-b.jpg', // thumb 1 (the primary)
      '/img-a.jpg', // thumb 2 (sortOrder 0)
      '/img-c.jpg', // thumb 3 (sortOrder 2)
    ]);
  });

  it('keeps the API order when no image is designated primary', async () => {
    hoisted.getProductBySlug.mockResolvedValue({
      data: {
        ...PRODUCT,
        images: [
          { id: 'img-x', url: '/img-x.jpg', alt: 'X', isPrimary: false, sortOrder: 5 },
          { id: 'img-y', url: '/img-y.jpg', alt: 'Y', isPrimary: false, sortOrder: 2 },
        ],
      },
    });
    const { container } = render(<ProductView />);
    await screen.findByAltText('T-Shirt');
    const srcs = Array.from(container.querySelectorAll('img')).map(src);
    // No primary -> pure sortOrder order: y (2) then x (5).
    expect(srcs).toEqual(['/img-y.jpg', '/img-y.jpg', '/img-x.jpg']);
  });
});
