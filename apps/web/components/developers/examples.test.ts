/**
 * Example-code generators (components/developers/examples.ts).
 *
 * Every documented endpoint gets copy-paste snippets derived from its own
 * docs: path params resolve to enum values/placeholders, query/body params
 * come from the defaults table (optional noise is dropped), and customer
 * endpoints carry the Authorization header.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCurl,
  buildFetch,
  buildPython,
  EXAMPLE_BASE,
  type ExampleEndpoint,
} from './examples';

const GET_BANNERS: ExampleEndpoint = {
  method: 'GET',
  path: '/api/banners',
  auth: 'none',
  params: [
    {
      name: 'position',
      type: 'enum',
      values: ['hero', 'promo', 'strip'],
      optional: true,
      description: 'Only banners for this home-page placement.',
    },
  ],
};

const GET_MENU: ExampleEndpoint = {
  method: 'GET',
  path: '/api/menus/location/:location',
  auth: 'none',
  params: [
    {
      name: 'location',
      type: 'enum',
      values: ['header', 'footer', 'sidebar'],
      description: 'Which menu to load.',
    },
  ],
};

const LOGIN: ExampleEndpoint = {
  method: 'POST',
  path: '/api/auth/login',
  auth: 'none',
  params: [
    { name: 'email', type: 'string', description: 'Email address.' },
    { name: 'password', type: 'string', description: 'Password.' },
  ],
};

const CART: ExampleEndpoint = {
  method: 'GET',
  path: '/api/cart',
  auth: 'customer',
};

const PRODUCTS: ExampleEndpoint = {
  method: 'GET',
  path: '/api/products',
  auth: 'optional',
  params: [
    { name: 'category', type: 'string', optional: true, description: 'Category slug(s).' },
    { name: 'sort', type: 'enum', values: ['newest', 'oldest', 'price_asc'], optional: true, description: 'Sort.' },
    { name: 'minPrice', type: 'number', optional: true, description: 'Lowest price.' },
  ],
};

describe('buildCurl', () => {
  it('appends enum query params to the URL', () => {
    expect(buildCurl(GET_BANNERS)).toContain(
      `${EXAMPLE_BASE}/api/banners?position=hero`
    );
  });

  it('resolves path params from the documented enum values', () => {
    const out = buildCurl(GET_MENU);
    expect(out).toContain(`${EXAMPLE_BASE}/api/menus/location/header`);
    expect(out).not.toContain('?');
  });

  it('builds POST bodies from the documented fields', () => {
    const out = buildCurl(LOGIN);
    expect(out).toContain('curl -X POST');
    expect(out).toContain(
      `-d '{"email":"customer@example.com","password":"your-password"}'`
    );
  });

  it('adds the bearer header for customer endpoints', () => {
    const out = buildCurl(CART);
    expect(out).toContain('-H "Authorization: Bearer $ACCESS_TOKEN"');
  });

  it('omits optional params without a sensible default', () => {
    const out = buildCurl(PRODUCTS);
    expect(out).not.toContain('minPrice');
    expect(out).toContain('category=clothing');
    expect(out).toContain('sort=newest');
  });
});

describe('buildFetch', () => {
  it('produces a fetch call with the query string', () => {
    const out = buildFetch(GET_BANNERS);
    expect(out).toContain(`await fetch("${EXAMPLE_BASE}/api/banners?position=hero"`);
    expect(out).toContain('const { data } = await res.json();');
  });

  it('POSTs a JSON body and sets the content-type', () => {
    const out = buildFetch(LOGIN);
    expect(out).toContain('method: "POST"');
    expect(out).toContain('"content-type": "application/json"');
    expect(out).toContain('"email":"customer@example.com"');
  });

  it('adds the authorization header for customer endpoints', () => {
    expect(buildFetch(CART)).toContain('authorization: `Bearer ${ACCESS_TOKEN}`');
  });
});

describe('buildPython', () => {
  it('uses params= for GETs', () => {
    const out = buildPython(GET_BANNERS);
    expect(out).toContain('import requests');
    expect(out).toContain('params={"position":"hero"}');
    expect(out).toContain('data = res.json()["data"]');
  });

  it('uses json= for POSTs', () => {
    const out = buildPython(LOGIN);
    expect(out).toContain('requests.post(');
    expect(out).toContain('json={"email":"customer@example.com","password":"your-password"}');
  });

  it('adds the authorization header for customer endpoints', () => {
    expect(buildPython(CART)).toContain(
      'headers={"authorization": f"Bearer {ACCESS_TOKEN}"}'
    );
  });
});
