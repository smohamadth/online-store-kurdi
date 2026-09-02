// ---------------------------------------------------------------------------
// Public API manifest — the single source of truth for the storefront's
// developer-facing HTTP surface.
//
// This list is what powers:
//   - GET /api/developers          (this manifest, as JSON)
//   - GET /api/developers/bootstrap (a ready-made storefront bundle)
//   - the in-app developer reference at /developers (renders this JSON)
//
// RULES FOR EDITING
//   - Only endpoints reachable WITHOUT an admin token belong here.
//   - `auth` describes the token the endpoint accepts:
//       none     - anyone (no token)
//       optional - works anonymous; a customer token adds per-user data
//       customer - requires a customer/account Bearer token (401 without)
//   - Keep `summary` short and behavioural; never copy secrets or schema
//     dumps here. Query/body params are documented as names + hints, not
//     full zod schemas.
//   - The integration test (tests/integration/developers.test.ts) walks
//     every `auth: 'none'` GET entry and fails if the route 404s, so a
//     stale path here is caught in CI.
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface EndpointParam {
  name: string;
  /** string | number | boolean | enum | uuid */
  type: string;
  /** For enum params: the accepted values. */
  values?: string[];
  optional?: boolean;
  description: string;
}

export interface PublicEndpoint {
  method: HttpMethod;
  /** Route pattern including the /api prefix; ':x' segments are placeholders. */
  path: string;
  /** Grouping used by the reference UI. */
  tag: string;
  auth: 'none' | 'optional' | 'customer';
  summary: string;
  params?: EndpointParam[];
}

export const MANIFEST_VERSION = 1;

export const PUBLIC_ENDPOINTS: PublicEndpoint[] = [
  // ------------------------------------------------------------- storefront
  {
    method: 'GET',
    path: '/api/settings',
    tag: 'Storefront',
    auth: 'none',
    summary:
      'Store settings every storefront shell needs: name, logo, currency, ' +
      'socials, contact details, SEO defaults, maintenance mode — plus the ' +
      'secret-free payment-gateway status the checkout renders from.',
  },
  {
    method: 'GET',
    path: '/api/home-sections',
    tag: 'Storefront',
    auth: 'none',
    summary:
      'Home page builder rows in render order. Each row carries its type ' +
      '(hero, featured, categories, promo, …), title/subtitle and a `config` ' +
      'JSON block — the per-section design contract (e.g. the hero layout, ' +
      'height and autoplay options).',
  },
  {
    method: 'GET',
    path: '/api/banners',
    tag: 'Storefront',
    auth: 'none',
    summary:
      'Active banners inside their schedule window, sorted by the admin ' +
      'order. `position` narrows to one home placement.',
    params: [
      {
        name: 'position',
        type: 'enum',
        values: ['hero', 'promo', 'strip'],
        optional: true,
        description: 'Only banners for this home-page placement.',
      },
      {
        name: 'lang',
        type: 'string',
        optional: true,
        description: 'Language code (e.g. en, ku, ar) for localised fields.',
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/menus/location/:location',
    tag: 'Storefront',
    auth: 'none',
    summary:
      'The active navigation menu for a location, with its nested items. ' +
      'Returns `data: null` when no active menu exists there yet.',
    params: [
      {
        name: 'location',
        type: 'enum',
        values: ['header', 'footer', 'sidebar'],
        description: 'Which menu to load.',
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/categories',
    tag: 'Catalog',
    auth: 'none',
    summary:
      'All categories with their product counts and child categories — ' +
      'what the category nav and home category tiles render from.',
  },
  {
    method: 'GET',
    path: '/api/categories/:idOrSlug',
    tag: 'Catalog',
    auth: 'none',
    summary: 'One category, looked up by UUID or slug.',
    params: [
      {
        name: 'idOrSlug',
        type: 'string',
        description: 'Category UUID or slug (storefront URLs use the slug).',
      },
    ],
  },

  // --------------------------------------------------------------- catalog
  {
    method: 'GET',
    path: '/api/products',
    tag: 'Catalog',
    auth: 'optional',
    summary:
      'Paginated product listing with facets, sorting and attribute ' +
      'filters. Response: `{ data, pagination, applied }`.',
    params: [
      { name: 'page', type: 'number', optional: true, description: '1-based page.' },
      { name: 'limit', type: 'number', optional: true, description: 'Page size (default 24).' },
      { name: 'category', type: 'string', optional: true, description: 'Category slug.' },
      { name: 'type', type: 'string', optional: true, description: 'Product type.' },
      { name: 'q', type: 'string', optional: true, description: 'Full-text search term.' },
      { name: 'sort', type: 'string', optional: true, description: 'e.g. newest, price-asc, price-desc, rating.' },
      { name: 'minPrice', type: 'number', optional: true, description: 'Lowest price.' },
      { name: 'maxPrice', type: 'number', optional: true, description: 'Highest price.' },
      { name: 'inStock', type: 'boolean', optional: true, description: 'Only in-stock items.' },
      { name: 'onSale', type: 'boolean', optional: true, description: 'Only discounted items.' },
      { name: 'minRating', type: 'number', optional: true, description: 'Minimum average rating.' },
      { name: 'attr.<name>', type: 'string', optional: true, description: 'Attribute filter, e.g. attr.size=M.' },
      { name: 'lang', type: 'string', optional: true, description: 'Language code for localised fields.' },
    ],
  },
  {
    method: 'GET',
    path: '/api/products/featured',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'Newest active products — the home page “featured” list.',
    params: [
      { name: 'limit', type: 'number', optional: true, description: 'How many (default 10).' },
    ],
  },
  {
    method: 'GET',
    path: '/api/products/search',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'Keyword search with the same product response shape.',
    params: [
      { name: 'q', type: 'string', description: 'Search term.' },
      { name: 'limit', type: 'number', optional: true, description: 'How many (default 10).' },
    ],
  },
  {
    method: 'GET',
    path: '/api/products/facets',
    tag: 'Catalog',
    auth: 'none',
    summary:
      'Facet counts for the filter sidebar: for each candidate value, how ' +
      'many products would match given the current filters.',
  },
  {
    method: 'GET',
    path: '/api/products/:id',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'One product by UUID.',
    params: [{ name: 'id', type: 'uuid', description: 'Product UUID.' }],
  },
  {
    method: 'GET',
    path: '/api/products/slug/:slug',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'One product by slug — how product pages are addressed.',
    params: [{ name: 'slug', type: 'string', description: 'Product slug.' }],
  },
  {
    method: 'GET',
    path: '/api/products/:id/related',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'Related products for a product detail page.',
  },
  {
    method: 'GET',
    path: '/api/products/:productId/reviews',
    tag: 'Catalog',
    auth: 'none',
    summary: 'Approved reviews for a product (public).',
  },

  // --------------------------------------------------------------- content
  {
    method: 'GET',
    path: '/api/pages',
    tag: 'Content',
    auth: 'none',
    summary: 'Published pages (info/legal/help), newest first.',
  },
  {
    method: 'GET',
    path: '/api/pages/slug/:slug',
    tag: 'Content',
    auth: 'none',
    summary: 'A published page by slug (404 for drafts/unknown).',
  },
  {
    method: 'GET',
    path: '/api/pages/by-type/:type/slug/:slug',
    tag: 'Content',
    auth: 'none',
    summary: 'A published page by its type-aware address (the canonical URL).',
    params: [
      {
        name: 'type',
        type: 'enum',
        values: ['info', 'legal', 'help'],
        description: 'Page type.',
      },
      { name: 'slug', type: 'string', description: 'Page slug.' },
    ],
  },
  {
    method: 'GET',
    path: '/api/blog',
    tag: 'Content',
    auth: 'none',
    summary: 'Published blog posts.',
  },
  {
    method: 'GET',
    path: '/api/blog/tags',
    tag: 'Content',
    auth: 'none',
    summary: 'Blog tags with post counts.',
  },
  {
    method: 'GET',
    path: '/api/blog/slug/:slug',
    tag: 'Content',
    auth: 'none',
    summary: 'One published post by slug (404 for drafts/unknown).',
  },
  {
    method: 'POST',
    path: '/api/blog/slug/:slug/view',
    tag: 'Content',
    auth: 'none',
    summary: 'Registers a view on a post (called by the blog page).',
  },
  {
    method: 'GET',
    path: '/api/currencies',
    tag: 'Content',
    auth: 'none',
    summary: 'Enabled currencies with symbols and rates.',
  },

  // --------------------------------------------------------------- accounts
  {
    method: 'POST',
    path: '/api/auth/register',
    tag: 'Accounts',
    auth: 'none',
    summary: 'Create a customer account. Registration counts as verification.',
    params: [
      { name: 'email', type: 'string', description: 'Email address.' },
      { name: 'password', type: 'string', description: 'At least 8 characters.' },
      { name: 'firstName', type: 'string', description: 'Required.' },
      { name: 'lastName', type: 'string', description: 'Required.' },
      { name: 'phone', type: 'string', optional: true, description: 'Optional.' },
    ],
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    tag: 'Accounts',
    auth: 'none',
    summary:
      'Sign in with email + password. Returns access + refresh tokens and ' +
      'the user profile; send the access token as `Authorization: Bearer …`.',
    params: [
      { name: 'email', type: 'string', description: 'Email address.' },
      { name: 'password', type: 'string', description: 'Password.' },
    ],
  },
  {
    method: 'POST',
    path: '/api/auth/refresh',
    tag: 'Accounts',
    auth: 'none',
    summary: 'Rotate a refresh token into a fresh access + refresh pair.',
    params: [{ name: 'refreshToken', type: 'string', description: 'Refresh token from login/register.' }],
  },
  {
    method: 'POST',
    path: '/api/auth/forgot-password',
    tag: 'Accounts',
    auth: 'none',
    summary: 'Request a password-reset email.',
    params: [{ name: 'email', type: 'string', description: 'Account email.' }],
  },
  {
    method: 'POST',
    path: '/api/auth/reset-password',
    tag: 'Accounts',
    auth: 'none',
    summary: 'Set a new password with the token from the reset email.',
  },

  // ------------------------------------------- customer (Bearer token scope)
  {
    method: 'GET',
    path: '/api/cart',
    tag: 'Customer',
    auth: 'customer',
    summary: 'The signed-in customer’s cart with items and totals.',
  },
  {
    method: 'POST',
    path: '/api/cart',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Add an item to the cart.',
  },
  {
    method: 'PUT',
    path: '/api/cart/:id',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Change an item quantity.',
  },
  {
    method: 'DELETE',
    path: '/api/cart/:id',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Remove one item.',
  },
  {
    method: 'DELETE',
    path: '/api/cart',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Clear the cart.',
  },
  {
    method: 'POST',
    path: '/api/cart/sync',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Merge a guest cart into the signed-in cart.',
  },
  {
    method: 'GET',
    path: '/api/wishlist',
    tag: 'Customer',
    auth: 'customer',
    summary: 'The customer’s wishlist.',
  },
  {
    method: 'POST',
    path: '/api/wishlist',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Add a product to the wishlist.',
  },
  {
    method: 'DELETE',
    path: '/api/wishlist/:productId',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Remove a product from the wishlist.',
  },
  {
    method: 'GET',
    path: '/api/orders',
    tag: 'Customer',
    auth: 'customer',
    summary: 'The customer’s order history.',
  },
  {
    method: 'POST',
    path: '/api/orders',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Place an order (checkout).',
  },
  {
    method: 'GET',
    path: '/api/orders/:id',
    tag: 'Customer',
    auth: 'customer',
    summary: 'One of the customer’s orders.',
  },
  {
    method: 'POST',
    path: '/api/orders/:id/pay',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Pay an order (card/other gateway).',
  },
  {
    method: 'GET',
    path: '/api/orders/:id/tracking',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Shipping tracking events for an order.',
  },
  {
    method: 'POST',
    path: '/api/orders/:id/cancel',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Request a cancellation (subject to order state).',
  },
  {
    method: 'POST',
    path: '/api/products/:productId/reviews',
    tag: 'Customer',
    auth: 'customer',
    summary: 'Submit a review for a purchased product.',
  },

  // ------------------------------------------------------------- engagement
  {
    method: 'POST',
    path: '/api/contact',
    tag: 'Engagement',
    auth: 'none',
    summary: 'Send the contact form message to the store email.',
  },
  {
    method: 'POST',
    path: '/api/newsletter/subscribe',
    tag: 'Engagement',
    auth: 'none',
    summary: 'Subscribe an email to the newsletter.',
  },
  {
    method: 'POST',
    path: '/api/stock-alerts',
    tag: 'Engagement',
    auth: 'none',
    summary: 'Request a notification when a product is back in stock.',
  },
  {
    method: 'GET',
    path: '/api/stock-alerts/check/:productId',
    tag: 'Engagement',
    auth: 'none',
    summary: 'Whether a stock alert already exists for a product.',
  },

  // ------------------------------------------------------------- developer
  {
    method: 'GET',
    path: '/api/developers',
    tag: 'Developer',
    auth: 'none',
    summary: 'This manifest: every documented public endpoint.',
  },
  {
    method: 'GET',
    path: '/api/developers/manifest',
    tag: 'Developer',
    auth: 'none',
    summary: 'Alias of GET /api/developers.',
  },
  {
    method: 'GET',
    path: '/api/developers/bootstrap',
    tag: 'Developer',
    auth: 'none',
    summary:
      'One-call storefront bundle: settings + home sections (with their ' +
      'design config) + active banners + categories + header/footer menus. ' +
      'Everything a headless home page needs before it starts calling the ' +
      'catalog endpoints.',
  },
];
