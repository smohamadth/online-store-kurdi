/**
 * Unit tests for the structured-data (JSON-LD) builders.
 *
 * The builders are pure functions: they take a typed input and
 * return a JSON-serialisable object that matches the schema.org
 * spec. We pin the exact shape so any change to Google's
 * supported fields is a deliberate edit here, not a regression
 * hiding in a UI file.
 *
 * Why per-builder tests instead of a single round-trip:
 *   - The Product JSON-LD has many optional branches (rating,
 *     backorder, brand, variant sku). Each one is a small test
 *     so the failure message is "Backorder produces PreOrder",
 *     not "the whole Product shape is wrong".
 */
import { describe, it, expect } from 'vitest';
import {
  SCHEMA_CONTEXT,
  asGraph,
  buildProductJsonLd,
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildBlogPostingJsonLd,
  buildDigitalDocumentJsonLd,
  buildFaqJsonLd,
  type JsonLdObject,
} from './structured-data';

describe('SCHEMA_CONTEXT', () => {
  it('is the schema.org URL', () => {
    expect(SCHEMA_CONTEXT).toBe('https://schema.org');
  });
});

describe('asGraph', () => {
  it('wraps multiple objects in a single @graph', () => {
    const a: JsonLdObject = { '@context': SCHEMA_CONTEXT, '@type': 'Product', name: 'X' };
    const b: JsonLdObject = { '@context': SCHEMA_CONTEXT, '@type': 'BreadcrumbList' };
    const g = asGraph([a, b]);
    expect(g['@type']).toBe('ItemList');
    expect((g as any)['@graph']).toEqual([a, b]);
  });

  it('handles a single-element graph', () => {
    const only: JsonLdObject = { '@context': SCHEMA_CONTEXT, '@type': 'Product', name: 'Y' };
    const g = asGraph([only]);
    expect((g as any)['@graph']).toEqual([only]);
  });
});

describe('buildProductJsonLd', () => {
  const base = {
    url: 'https://example.com/products/widget',
    name: 'Widget',
    description: 'A useful widget.',
    images: ['https://cdn.example.com/widget-1.jpg'],
    sku: 'WID-001',
    price: 19.99,
    currency: 'USD',
    inStock: true,
  };

  it('emits a Product with the basic shape', () => {
    const out = buildProductJsonLd(base);
    expect(out['@type']).toBe('Product');
    expect(out.name).toBe('Widget');
    expect(out.description).toBe('A useful widget.');
    expect(out.image).toEqual(['https://cdn.example.com/widget-1.jpg']);
    expect(out.sku).toBe('WID-001');
    expect((out as any).offers).toMatchObject({
      '@type': 'Offer',
      url: base.url,
      priceCurrency: 'USD',
      price: '19.99',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    });
  });

  it('serialises to valid JSON', () => {
    const out = buildProductJsonLd(base);
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
  });

  it('marks out-of-stock when not in stock and not on backorder', () => {
    const out = buildProductJsonLd({ ...base, inStock: false });
    expect((out as any).offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('marks PreOrder when allowBackorder is true and not in stock', () => {
    const out = buildProductJsonLd({ ...base, inStock: false, allowBackorder: true });
    expect((out as any).offers.availability).toBe('https://schema.org/PreOrder');
  });

  it('keeps InStock even when allowBackorder is true', () => {
    const out = buildProductJsonLd({ ...base, inStock: true, allowBackorder: true });
    expect((out as any).offers.availability).toBe('https://schema.org/InStock');
  });

  it('coerces a numeric price to a string', () => {
    const out = buildProductJsonLd({ ...base, price: 12 });
    expect((out as any).offers.price).toBe('12');
  });

  it('accepts a string price (e.g. "12.50")', () => {
    const out = buildProductJsonLd({ ...base, price: '12.50' });
    expect((out as any).offers.price).toBe('12.50');
  });

  it('omits the image key when there are no images', () => {
    const out = buildProductJsonLd({ ...base, images: [] });
    expect(out).not.toHaveProperty('image');
  });

  it('includes brand when supplied', () => {
    const out = buildProductJsonLd({ ...base, brand: 'Acme' });
    expect((out as any).brand).toEqual({ '@type': 'Brand', name: 'Acme' });
  });

  it('omits brand when not supplied', () => {
    const out = buildProductJsonLd(base);
    expect(out).not.toHaveProperty('brand');
  });

  it('uses variantSku over sku when supplied', () => {
    const out = buildProductJsonLd({ ...base, variantSku: 'WID-001-RED-M' });
    expect(out.sku).toBe('WID-001-RED-M');
  });

  describe('AggregateRating', () => {
    it('is included when reviewCount > 0', () => {
      const out = buildProductJsonLd({
        ...base,
        averageRating: 4.5,
        reviewCount: 12,
      });
      expect((out as any).aggregateRating).toEqual({
        '@type': 'AggregateRating',
        ratingValue: 4.5,
        reviewCount: 12,
      });
    });

    it('is omitted when reviewCount is 0', () => {
      const out = buildProductJsonLd({
        ...base,
        averageRating: 0,
        reviewCount: 0,
      });
      expect(out).not.toHaveProperty('aggregateRating');
    });

    it('is omitted when averageRating is missing', () => {
      const out = buildProductJsonLd({ ...base, reviewCount: 5 });
      expect(out).not.toHaveProperty('aggregateRating');
    });
  });
});

describe('buildBreadcrumbJsonLd', () => {
  it('numbers items from 1', () => {
    const out = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://example.com/' },
      { name: 'Products', url: 'https://example.com/products' },
      { name: 'Widget', url: 'https://example.com/products/widget' },
    ]);
    expect(out['@type']).toBe('BreadcrumbList');
    expect((out as any).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
      { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://example.com/products' },
      { '@type': 'ListItem', position: 3, name: 'Widget', item: 'https://example.com/products/widget' },
    ]);
  });

  it('handles a single-item breadcrumb', () => {
    const out = buildBreadcrumbJsonLd([{ name: 'Home', url: 'https://example.com/' }]);
    expect((out as any).itemListElement).toHaveLength(1);
    expect((out as any).itemListElement[0].position).toBe(1);
  });

  it('handles an empty list', () => {
    const out = buildBreadcrumbJsonLd([]);
    expect((out as any).itemListElement).toEqual([]);
  });
});

describe('buildItemListJsonLd', () => {
  it('numbers positions from 1 when not provided', () => {
    const out = buildItemListJsonLd(
      'Featured',
      [
        { url: 'https://example.com/p/1', name: 'One' },
        { url: 'https://example.com/p/2', name: 'Two' },
        { url: 'https://example.com/p/3', name: 'Three' },
      ],
      'https://example.com/products',
    );
    expect((out as any).itemListElement.map((it: any) => it.position)).toEqual([1, 2, 3]);
  });

  it('honours an explicit position', () => {
    const out = buildItemListJsonLd(
      'Featured',
      [
        { url: 'https://example.com/p/x', name: 'X', position: 5 },
      ],
      'https://example.com/products',
    );
    expect((out as any).itemListElement[0].position).toBe(5);
  });

  it('includes image only when supplied', () => {
    const out = buildItemListJsonLd(
      'Featured',
      [
        { url: 'https://example.com/p/1', name: 'With image', image: 'https://cdn/1.jpg' },
        { url: 'https://example.com/p/2', name: 'No image' },
      ],
      'https://example.com/products',
    );
    expect((out as any).itemListElement[0].image).toBe('https://cdn/1.jpg');
    expect((out as any).itemListElement[1].image).toBeUndefined();
  });

  it('reports the total count', () => {
    const out = buildItemListJsonLd(
      'Featured',
      [
        { url: 'a', name: 'A' },
        { url: 'b', name: 'B' },
      ],
      'https://example.com/products',
    );
    expect(out['@type']).toBe('ItemList');
    expect((out as any).numberOfItems).toBe(2);
    expect((out as any).name).toBe('Featured');
    expect((out as any).url).toBe('https://example.com/products');
  });
});

describe('buildOrganizationJsonLd', () => {
  it('emits the basic shape', () => {
    const out = buildOrganizationJsonLd({
      name: 'Acme',
      url: 'https://acme.example.com',
    });
    expect(out['@type']).toBe('Organization');
    expect(out.name).toBe('Acme');
    expect((out as any).url).toBe('https://acme.example.com');
  });

  it('includes logo when supplied', () => {
    const out = buildOrganizationJsonLd({
      name: 'Acme',
      url: 'https://acme.example.com',
      logoUrl: 'https://acme.example.com/logo.png',
    });
    expect((out as any).logo).toBe('https://acme.example.com/logo.png');
  });

  it('includes sameAs (social profiles) when supplied', () => {
    const out = buildOrganizationJsonLd({
      name: 'Acme',
      url: 'https://acme.example.com',
      sameAs: [
        'https://twitter.com/acme',
        'https://facebook.com/acme',
      ],
    });
    expect((out as any).sameAs).toEqual([
      'https://twitter.com/acme',
      'https://facebook.com/acme',
    ]);
  });

  it('omits sameAs when the array is empty', () => {
    const out = buildOrganizationJsonLd({
      name: 'Acme',
      url: 'https://acme.example.com',
      sameAs: [],
    });
    expect(out).not.toHaveProperty('sameAs');
  });

  it('builds a contact point when an email is supplied', () => {
    const out = buildOrganizationJsonLd({
      name: 'Acme',
      url: 'https://acme.example.com',
      contactEmail: 'help@acme.example.com',
    });
    expect((out as any).contactPoint).toEqual({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'help@acme.example.com',
    });
  });
});

describe('buildWebSiteJsonLd', () => {
  it('emits a WebSite with a SearchAction', () => {
    const out = buildWebSiteJsonLd({
      name: 'Acme',
      url: 'https://acme.example.com',
    });
    expect(out['@type']).toBe('WebSite');
    expect((out as any).potentialAction).toEqual({
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://acme.example.com/products?search={search_query}',
      },
      'query-input': 'required name=search_term_string',
    });
  });

  it('honours a custom search path', () => {
    const out = buildWebSiteJsonLd({
      name: 'Acme',
      url: 'https://acme.example.com',
      searchPath: '/search?q=',
    });
    expect((out as any).potentialAction.target.urlTemplate).toBe(
      'https://acme.example.com/search?q={search_query}',
    );
  });
});

describe('buildBlogPostingJsonLd', () => {
  it('emits the full BlogPosting shape', () => {
    const out = buildBlogPostingJsonLd({
      url: 'https://example.com/blog/hello',
      headline: 'Hello world',
      description: 'A first post.',
      image: 'https://cdn.example.com/cover.jpg',
      datePublished: '2026-01-01',
      dateModified: '2026-01-15',
      author: 'Alice',
      publisherName: 'Acme',
      keywords: 'intro, hello',
    });
    expect(out['@type']).toBe('BlogPosting');
    expect(out.headline).toBe('Hello world');
    expect((out as any).image).toEqual(['https://cdn.example.com/cover.jpg']);
    expect((out as any).datePublished).toBe('2026-01-01');
    expect((out as any).dateModified).toBe('2026-01-15');
    expect((out as any).author).toEqual({ '@type': 'Person', name: 'Alice' });
    expect((out as any).publisher).toEqual({ '@type': 'Organization', name: 'Acme' });
    expect((out as any).mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://example.com/blog/hello',
    });
    expect((out as any).keywords).toBe('intro, hello');
  });

  it('omits the image key when no image is supplied', () => {
    const out = buildBlogPostingJsonLd({
      url: 'https://example.com/blog/x',
      headline: 'X',
      datePublished: '2026-01-01',
      dateModified: '2026-01-01',
      author: 'A',
      publisherName: 'B',
    });
    expect(out).not.toHaveProperty('image');
  });

  it('omits keywords when the string is empty', () => {
    const out = buildBlogPostingJsonLd({
      url: 'https://example.com/blog/x',
      headline: 'X',
      datePublished: '2026-01-01',
      dateModified: '2026-01-01',
      author: 'A',
      publisherName: 'B',
      keywords: '',
    });
    expect(out).not.toHaveProperty('keywords');
  });
});

describe('buildDigitalDocumentJsonLd', () => {
  const base = {
    url: 'https://example.com/products/ebook',
    name: 'My eBook',
    description: 'A digital book.',
    images: ['https://cdn.example.com/ebook-cover.jpg'],
  };

  it('emits a DigitalDocument with the basic shape', () => {
    const out = buildDigitalDocumentJsonLd(base);
    expect(out['@type']).toBe('DigitalDocument');
    expect(out['@id']).toBe(base.url);
    expect(out.name).toBe('My eBook');
    expect(out.description).toBe('A digital book.');
    expect((out as any).image).toEqual(['https://cdn.example.com/ebook-cover.jpg']);
    expect(out.url).toBe(base.url);
  });

  it('omits image when no images are supplied', () => {
    const out = buildDigitalDocumentJsonLd({ ...base, images: [] });
    expect(out).not.toHaveProperty('image');
  });

  it('includes encodingFormat when supplied', () => {
    const out = buildDigitalDocumentJsonLd({ ...base, fileFormat: 'application/pdf' });
    expect((out as any).encodingFormat).toBe('application/pdf');
  });

  it('formats contentSize as "<n> bytes" when supplied', () => {
    const out = buildDigitalDocumentJsonLd({ ...base, contentSizeBytes: 1024 });
    expect((out as any).contentSize).toBe('1024 bytes');
  });

  it('omits contentSize when not a number', () => {
    const out = buildDigitalDocumentJsonLd(base);
    expect(out).not.toHaveProperty('contentSize');
  });

  it('passes through datePublished and inLanguage when supplied', () => {
    const out = buildDigitalDocumentJsonLd({
      ...base,
      datePublished: '2026-01-15',
      inLanguage: 'en',
    });
    expect((out as any).datePublished).toBe('2026-01-15');
    expect((out as any).inLanguage).toBe('en');
  });

  it('omits keywords when the string is empty', () => {
    const out = buildDigitalDocumentJsonLd({ ...base, keywords: '' });
    expect(out).not.toHaveProperty('keywords');
  });

  it('serialises to valid JSON', () => {
    const out = buildDigitalDocumentJsonLd(base);
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
  });
});

describe('buildFaqJsonLd', () => {
  it('builds a FAQPage with a Question/AcceptedAnswer per item', () => {
    const out = buildFaqJsonLd([
      { question: 'How long does shipping take?', answer: '3-7 business days.' },
      { question: 'What is your return policy?', answer: '30 days.' },
    ]);
    expect(out['@context']).toBe('https://schema.org');
    expect(out['@type']).toBe('FAQPage');
    const main = out.mainEntity as any[];
    expect(main).toHaveLength(2);
    expect(main[0]['@type']).toBe('Question');
    expect(main[0].name).toBe('How long does shipping take?');
    expect(main[0].acceptedAnswer['@type']).toBe('Answer');
    expect(main[0].acceptedAnswer.text).toBe('3-7 business days.');
    expect(main[1].name).toBe('What is your return policy?');
  });

  it('emits an empty mainEntity array for no FAQs', () => {
    const out = buildFaqJsonLd([]);
    expect(out['@type']).toBe('FAQPage');
    expect(out.mainEntity).toEqual([]);
  });

  it('serialises to valid JSON (the script tag stringifies it)', () => {
    const out = buildFaqJsonLd([{ question: 'Q', answer: 'A' }]);
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
  });
});
