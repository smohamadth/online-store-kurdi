/**
 * Component test for the JSON-LD script wrapper.
 *
 * The wrapper's job is to:
 *   1. Render a <script type="application/ld+json"> element.
 *   2. Serialise the object into the script body.
 *   3. Use a default testid that component tests can target
 *      without poking at dangerouslySetInnerHTML.
 *
 * We also pin the array form (`@graph` wrapping) since that's
 * the multi-entity mode used by the PDP and the search page.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JsonLdScript } from '@/components/JsonLdScript';
import {
  buildProductJsonLd,
  buildBreadcrumbJsonLd,
  type JsonLdObject,
} from '@/lib/structured-data';

describe('JsonLdScript', () => {
  it('renders a script tag with the application/ld+json type', () => {
    render(
      <JsonLdScript
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Widget',
        }}
      />,
    );
    const script = screen.getByTestId('json-ld');
    expect(script.tagName).toBe('SCRIPT');
    expect(script.getAttribute('type')).toBe('application/ld+json');
  });

  it('serialises the data into the script body as JSON', () => {
    const data: JsonLdObject = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Widget',
      description: 'A useful widget.',
    };
    render(<JsonLdScript data={data} />);
    const script = screen.getByTestId('json-ld');
    const html = script.innerHTML;
    // dangerouslySetInnerHTML escapes < as \u003c which is fine for
    // a JSON payload. The point of the assertion is the JSON
    // round-trips: anything Google reads back is the same shape
    // we passed in.
    const parsed = JSON.parse(html);
    expect(parsed).toEqual(data);
  });

  it('uses a custom testId when supplied', () => {
    render(
      <JsonLdScript
        data={{ '@context': 'https://schema.org', '@type': 'Thing' }}
        testId="my-jsonld"
      />,
    );
    expect(screen.getByTestId('my-jsonld')).toBeTruthy();
    expect(screen.queryByTestId('json-ld')).toBeNull();
  });

  it('wraps an array of objects in an @graph', () => {
    const product = buildProductJsonLd({
      url: 'https://example.com/p/widget',
      name: 'Widget',
      description: 'A useful widget.',
      images: [],
      sku: 'WID-001',
      price: 19.99,
      currency: 'USD',
      inStock: true,
    });
    const breadcrumb = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://example.com/' },
      { name: 'Widget', url: 'https://example.com/p/widget' },
    ]);
    render(<JsonLdScript data={[product, breadcrumb]} />);
    const script = screen.getByTestId('json-ld');
    const parsed = JSON.parse(script.innerHTML);
    expect(parsed['@type']).toBe('ItemList'); // placeholder; see below
    expect(Array.isArray(parsed['@graph'])).toBe(true);
    expect(parsed['@graph']).toHaveLength(2);
    expect(parsed['@graph'][0]).toEqual(product);
    expect(parsed['@graph'][1]).toEqual(breadcrumb);
  });
});
