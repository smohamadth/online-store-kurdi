/**
 * render.tsx — LayoutRenderer component tests.
 *
 * The LayoutRenderer is the single presentational component that draws a
 * PageLayout as a CSS grid. It is used both by the storefront and by the Theme
 * Studio preview, so its behaviour is load-bearing:
 *   - empty / no-block layouts render nothing
 *   - each block is positioned via explicit gridColumn / gridRow
 *   - unknown block types are skipped without crashing the page
 *   - config payloads reach the rendered output (headline, custom html, counts)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutRenderer, LayoutData, responsiveGrid } from './render';
import { PageLayout, BLOCK_TYPES, BlockType } from './types';

function sampleLayout(overrides: Partial<PageLayout> = {}): PageLayout {
  return {
    columns: 12,
    gap: 24,
    blocks: [
      { id: 'h', type: 'hero', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: { title: 'Big Sale', subtitle: 'Up to 50% off' } },
      { id: 'f', type: 'featured', colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 1, config: { title: 'Favourites', limit: 2 } },
      { id: 'u', type: 'unknownType' as any, colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 1, config: {} },
    ],
    ...overrides,
  };
}

describe('LayoutRenderer', () => {
  it('renders nothing for an empty or missing layout', () => {
    const { container } = render(<LayoutRenderer layout={{ columns: 12, gap: 24, blocks: [] }} data={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one grid cell per known block', () => {
    const { container } = render(<LayoutRenderer layout={sampleLayout()} data={{ products: [] }} />);
    const cells = container.querySelectorAll('[data-block-type]');
    // hero + featured = 2 known; the unknown type is skipped.
    expect(cells).toHaveLength(2);
  });

  it('positions blocks with explicit grid coordinates', () => {
    const { container } = render(<LayoutRenderer layout={sampleLayout()} data={{ products: [] }} />);
    const hero = container.querySelector('[data-block-type="hero"]') as HTMLElement;
    const featured = container.querySelector('[data-block-type="featured"]') as HTMLElement;
    expect(hero.style.gridColumn).toContain('1');
    expect(hero.style.gridColumn).toContain('span 12');
    expect(featured.style.gridColumn).toContain('span 6');
  });

  it('renders config payloads into the output', () => {
    render(
      <LayoutRenderer
        layout={sampleLayout()}
        data={{ products: [{ id: 'p1', name: 'One' }] }}
      />,
    );
    expect(screen.getByText('Big Sale')).toBeTruthy();
    expect(screen.getByText('Favourites')).toBeTruthy();
  });

  it('passes page data to blocks that need it', () => {
    const layout: PageLayout = {
      columns: 12,
      gap: 24,
      blocks: [
        { id: 'f', type: 'featured', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: { title: 'Top' } },
      ],
    };
    render(
      <LayoutRenderer
        layout={layout}
        data={{ products: [{ id: 'p1', name: 'Product One' }, { id: 'p2', name: 'Product Two' }] }}
      />,
    );
    expect(screen.getByText('Product One')).toBeTruthy();
    expect(screen.getByText('Product Two')).toBeTruthy();
  });
});

describe('LayoutRenderer page-native blocks', () => {
  it('renders a productList block from page products', () => {
    const layout: PageLayout = {
      columns: 12, gap: 24,
      blocks: [{ id: 'pl', type: 'productList', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: { title: 'Shop' } }],
    };
    render(<LayoutRenderer layout={layout} data={{ products: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] }} />);
    expect(screen.getByText('Shop')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('renders a productDetail block from page product data', () => {
    const layout: PageLayout = {
      columns: 12, gap: 24,
      blocks: [{ id: 'pd', type: 'productDetail', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} }],
    };
    render(<LayoutRenderer layout={layout} data={{ product: { name: 'Widget', price: '19.99', description: 'A widget' } }} />);
    expect(screen.getByText('Widget')).toBeTruthy();
    expect(screen.getByText('19.99')).toBeTruthy();
  });

  it('renders a blogList block from page posts', () => {
    const layout: PageLayout = {
      columns: 12, gap: 24,
      blocks: [{ id: 'bl', type: 'blogList', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} }],
    };
    render(<LayoutRenderer layout={layout} data={{ posts: [{ slug: 'p1', title: 'Hello', excerpt: 'Intro' }] }} />);
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('renders pageContent from page html', () => {
    const layout: PageLayout = {
      columns: 12, gap: 24,
      blocks: [{ id: 'pc', type: 'pageContent', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} }],
    };
    render(<LayoutRenderer layout={layout} data={{ html: '<p>Custom page body</p>' }} />);
    expect(screen.getByText('Custom page body')).toBeTruthy();
  });


  it('renders nothing for a productDetail block when no product data', () => {
    const layout: PageLayout = {
      columns: 12, gap: 24,
      blocks: [{ id: 'pd', type: 'productDetail', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} }],
    };
    const { container } = render(<LayoutRenderer layout={layout} data={{}} />);
    const cell = container.querySelector('[data-block-type="productDetail"]');
    // The wrapper cell still exists, but it must contain no rendered content.
    expect(cell).toBeTruthy();
    expect(cell?.textContent?.trim() ?? '').toBe('');
  });
});

function renderBlock(type: BlockType, config: Record<string, unknown> = {}, data: LayoutData = {}) {
  const layout: PageLayout = {
    columns: 12, gap: 24,
    blocks: [{ id: `b-${type}`, type, colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config }],
  };
  return render(<LayoutRenderer layout={layout} data={data} />);
}

describe('LayoutRenderer rich blocks', () => {
  it('renders every registered block type without throwing', () => {
    for (const type of BLOCK_TYPES) {
      const { container } = renderBlock(type, {});
      const cell = container.querySelector(`[data-block-type="${type}"]`);
      expect(cell, `expected a cell for ${type}`).toBeTruthy();
    }
  });

  it('renders a call-to-action with title, subtitle and button', () => {
    renderBlock('cta', { title: 'Join now', subtitle: 'Free shipping', buttonText: 'Shop', buttonHref: '/shop' });
    expect(screen.getByText('Join now')).toBeTruthy();
    expect(screen.getByText('Free shipping')).toBeTruthy();
    const btn = screen.getByRole('link', { name: 'Shop' }) as HTMLAnchorElement;
    expect(btn.href).toContain('/shop');
  });

  it('renders a YouTube embed for a video block', () => {
    const { container } = renderBlock('video', { src: 'https://youtu.be/dQw4w9WgXcQ' });
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.src).toContain('/embed/dQw4w9WgXcQ');
  });

  it('renders a native <video> for a direct file', () => {
    const { container } = renderBlock('video', { src: '/clip.mp4' });
    expect(container.querySelector('video')).toBeTruthy();
  });

  it('renders an image with src and alt', () => {
    const { container } = renderBlock('image', { src: '/a.jpg', alt: 'A photo' });
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/a.jpg');
    expect(img.getAttribute('alt')).toBe('A photo');
  });

  it('renders a text + image split', () => {
    const { container } = renderBlock('textImage', { heading: 'Why us', body: 'Because quality.', image: '/x.jpg', imageOnRight: 'right' });
    expect(screen.getByText('Why us')).toBeTruthy();
    expect(screen.getByText('Because quality.')).toBeTruthy();
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('renders an FAQ list from items', () => {
    renderBlock('faq', { title: 'Help', items: [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }] });
    expect(screen.getByText('Help')).toBeTruthy();
    expect(screen.getByText('Q1')).toBeTruthy();
    expect(screen.getByText('A2')).toBeTruthy();
  });

  it('renders numbered steps from items', () => {
    renderBlock('steps', { items: [{ title: 'Pick' }, { title: 'Pay' }, { title: 'Get' }] });
    expect(screen.getByText('Pick')).toBeTruthy();
    expect(screen.getByText('Pay')).toBeTruthy();
    expect(screen.getByText('Get')).toBeTruthy();
  });

  it('renders a logo strip from items', () => {
    renderBlock('logoStrip', { items: [{ name: 'Acme' }, { name: 'Globex' }] });
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Globex')).toBeTruthy();
  });

  it('renders pricing tiers with a highlighted plan', () => {
    renderBlock('pricing', {
      items: [
        { name: 'Basic', price: '9', features: ['1 seat', 'Email'] },
        { name: 'Pro', price: '29', highlighted: true, features: ['Unlimited seats'] },
      ],
    });
    expect(screen.getByText('Basic')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText(/29/)).toBeTruthy();
    expect(screen.getAllByText(/✓/).length).toBeGreaterThan(0);
  });

  it('renders a single quote with author and role', () => {
    renderBlock('quote', { text: 'Love it', author: 'Sara', role: 'CEO' });
    expect(screen.getByText(/Love it/)).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText(/CEO/)).toBeTruthy();
  });

  it('renders an icon grid from items', () => {
    renderBlock('iconsGrid', { items: [{ icon: '🚀', title: 'Fast', text: 'Quick delivery' }] });
    expect(screen.getByText('Fast')).toBeTruthy();
    expect(screen.getByText('Quick delivery')).toBeTruthy();
    expect(screen.getByText('🚀')).toBeTruthy();
  });

  it('renders a divider', () => {
    const { container } = renderBlock('divider', {});
    const cell = container.querySelector('[data-block-type="divider"]') as HTMLElement;
    expect(cell).toBeTruthy();
    expect(cell.textContent?.trim() ?? '').toBe('');
  });
});

describe('LayoutRenderer marketing blocks', () => {
  it('renders a promo card with title, subtitle and image', () => {
    const { container } = renderBlock('promo', { title: 'Deal', subtitle: 'Save now', image: '/p.jpg' });
    expect(screen.getByText('Deal')).toBeTruthy();
    expect(screen.getByText('Save now')).toBeTruthy();
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('renders a banner strip with a custom background', () => {
    const { container } = renderBlock('bannerStrip', { title: 'Free shipping', background: '#123456' });
    expect(screen.getByText('Free shipping')).toBeTruthy();
    const cell = container.querySelector('[data-block-type="bannerStrip"]');
    expect((cell as HTMLElement).textContent).toContain('Free shipping');
  });

  it('renders feature tiles from items', () => {
    renderBlock('features', { items: [{ icon: '🚚', title: 'Fast', text: '2-day delivery' }] });
    expect(screen.getByText('Fast')).toBeTruthy();
    expect(screen.getByText('2-day delivery')).toBeTruthy();
  });

  it('renders new arrivals / trending from page products', () => {
    const data = { products: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] };
    renderBlock('newArrivals', {}, data);
    expect(screen.getByText('New Arrivals')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    renderBlock('trending', {}, data);
    expect(screen.getByText('Trending Now')).toBeTruthy();
  });

  it('renders a deal countdown with a button', () => {
    renderBlock('dealCountdown', { title: 'Flash sale', subtitle: '24h only', buttonText: 'Shop now' });
    expect(screen.getByText('Flash sale')).toBeTruthy();
    expect(screen.getByText('Shop now')).toBeTruthy();
  });

  it('renders testimonials from items', () => {
    renderBlock('testimonials', { items: [{ text: 'Great', author: 'Ali' }, { text: 'Nice', author: 'Sara' }] });
    expect(screen.getByText(/Great/)).toBeTruthy();
    expect(screen.getByText('Ali')).toBeTruthy();
    expect(screen.getByText(/Nice/)).toBeTruthy();
  });

  it('renders a gallery of images from items', () => {
    const { container } = renderBlock('gallery', { items: [{ src: '/g1.jpg' }, { src: '/g2.jpg' }] });
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('shows a helpful placeholder when a block has no content yet', () => {
    renderBlock('faq', {});
    expect(screen.getByText(/FAQ items go here/)).toBeTruthy();
    renderBlock('pricing', {});
    expect(screen.getByText(/Pricing tiers go here/)).toBeTruthy();
  });
});

describe('LayoutRenderer responsive grids', () => {
  /** Find the first inner content grid (auto-fit based) inside a block cell. */
  function contentGrid(container: HTMLElement, type: BlockType): HTMLElement | undefined {
    const cell = container.querySelector(`[data-block-type="${type}"]`);
    return Array.from(cell?.querySelectorAll('div') ?? []).find(
      (d) => (d as HTMLElement).style.gridTemplateColumns.includes('auto-fit'),
    ) as HTMLElement | undefined;
  }

  it('derives a reflowable auto-fit column template for N desktop columns', () => {
    // 4 cols / 16px gap over a 1280px design width: min width = (1280-48)/4 = 308.
    expect(responsiveGrid(4)).toBe('repeat(auto-fit, minmax(min(100%, 308px), 1fr))');
    // 2 cols / 24px gap stacks to a single column on narrow phones: min = (1280-24)/2.
    expect(responsiveGrid(2, 24)).toBe('repeat(auto-fit, minmax(min(100%, 628px), 1fr))');
  });

  it('clamps per-row counts to a sane range and never produces a zero width', () => {
    expect(responsiveGrid(0)).toContain('repeat(auto-fit');
    expect(responsiveGrid(99)).toBe('repeat(auto-fit, minmax(min(100%, 120px), 1fr))');
  });

  it('product grids collapse to a single column on narrow screens', () => {
    const products = [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }, { id: 'p3', name: 'Three' }, { id: 'p4', name: 'Four' }];
    const { container } = renderBlock('featured', { perRow: 4, limit: 8 }, { products });
    const grid = contentGrid(container, 'featured');
    expect(grid).toBeTruthy();
    expect(grid?.style.gridTemplateColumns).toBe(responsiveGrid(4));
    // A 360px phone cell (min 308px) is narrower than 2×308+gaps, so auto-fit
    // renders a single column instead of four cramped ones.
    expect(grid?.style.gridTemplateColumns).not.toContain('repeat(4, 1fr)');
  });

  it('category and blog grids use the responsive template too', () => {
    const { container: c1 } = renderBlock('categories', { perRow: 4 }, { categories: [{ slug: 'a', name: 'A' }] });
    expect(contentGrid(c1, 'categories')?.style.gridTemplateColumns).toBe(responsiveGrid(4));
    const { container: c2 } = renderBlock('blogList', { perRow: 3 }, { posts: [{ slug: 'p', title: 'Post' }] });
    expect(contentGrid(c2, 'blogList')?.style.gridTemplateColumns).toBe(responsiveGrid(3));
  });

  it('text + image splits stack to one column on narrow screens', () => {
    const { container } = renderBlock('textImage', { heading: 'About', text: 'Hello', image: '/a.jpg' });
    const grid = contentGrid(container, 'textImage');
    expect(grid?.style.gridTemplateColumns).toBe(responsiveGrid(2, 24));
    expect(grid?.style.gridTemplateColumns).not.toBe('1fr 1fr');
  });

  it('pricing tiers collapse so cards no longer sit four-across on a phone', () => {
    const tiers = [1, 2, 3].map((i) => ({ name: `Tier ${i}`, price: i }));
    const { container } = renderBlock('pricing', { items: tiers });
    expect(contentGrid(container, 'pricing')?.style.gridTemplateColumns).toBe(responsiveGrid(3));
  });

  it('stats wrap instead of overflowing horizontally on narrow screens', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ value: i, label: `L${i}` }));
    const { container } = renderBlock('stats', { items });
    const stats = container.querySelector('[data-block-type="stats"] > div') as HTMLElement;
    expect(stats.style.flexWrap).toBe('wrap');
  });
});
