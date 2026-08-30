/**
 * /deals - the new ItemList structured data.
 *
 * The deal grid is client-side (it fetches /products and filters for
 * on-sale items), so the JSON-LD is emitted as a <script> once the
 * products arrive. This test proves that script is well-formed
 * JSON-LD with @type ItemList and one entry per visible deal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DealsView from './DealsView';

const deal = (slug: string, price: number, compare: number) => ({
  id: `id-${slug}`,
  name: `Deal ${slug}`,
  slug,
  price,
  compareAtPrice: compare,
  quantity: 5,
  images: [{ id: `img-${slug}`, url: `/images/${slug}.jpg`, alt: null, isPrimary: true, sortOrder: 0 }],
  category: { name: 'Test Cat', slug: 'test-cat' },
});

vi.mock('@/lib/api', () => ({
  api: {
    getProducts: vi.fn(async () => ({ data: [deal('a', 10, 20), deal('b', 5, 9)] })),
  },
  getImageUrl: (u: string) => u,
  getCategoryEmoji: () => '📦',
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currencySymbol: '$' }, loading: false }),
  formatPrice: (p: number, s = '$') => `${s}${p}`,
}));

// next/image renders an <img>; keep the test focused on the JSON-LD
// by swapping it for a plain tag (no optimizer URL in the test DOM).
vi.mock('next/image', () => ({
  default: (props: any) => <img src={props.src} alt={props.alt} />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function readJsonLd(testId: string): any {
  const el = document.querySelector(`script[data-testid="${testId}"]`);
  expect(el).not.toBeNull();
  return JSON.parse(el!.textContent || 'null');
}

describe('/deals structured data', () => {
  it('emits an ItemList with one entry per visible deal', async () => {
    render(<DealsView />);
    await waitFor(() => document.querySelector('script[data-testid="json-ld-deals"]'));

    const graph = readJsonLd('json-ld-deals');
    const list = graph['@graph'].find((e: any) => e['@type'] === 'ItemList');
    expect(list).toBeDefined();
    expect(list.name).toBe('Deals & Sales');
    expect(list.itemListElement).toHaveLength(2);
    expect(list.itemListElement[0].name).toBe('Deal a');
    expect(list.itemListElement[0].position).toBe(1);
    expect(list.itemListElement[1].name).toBe('Deal b');
  });

  it('renders both deals in the grid', async () => {
    render(<DealsView />);
    expect(await screen.findByText('Deal a')).toBeInTheDocument();
    expect(screen.getByText('Deal b')).toBeInTheDocument();
  });

  it('omits the ItemList when there are no deals', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.getProducts).mockResolvedValueOnce({ data: [] });
    render(<DealsView />);
    await screen.findByText(/No deals right now/);
    expect(document.querySelector('script[data-testid="json-ld-deals"]')).toBeNull();
  });
});
