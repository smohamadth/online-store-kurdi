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

export const MANIFEST_VERSION = 2;

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
    ],
  },
  {
    method: 'GET',
    path: '/api/theme',
    tag: 'Storefront',
    auth: 'none',
    summary:
      'The active storefront theme: the ThemeSettings row (active theme ' +
      'key, brand colours, typography, announcement bar, custom CSS) plus ' +
      'the active theme’s full validated config — the tokens a headless ' +
      'client needs to match the store’s brand.',
  },
  {
    method: 'GET',
    path: '/api/themes',
    tag: 'Storefront',
    auth: 'none',
    summary:
      'Every theme available on this server (bundled + installed) with its ' +
      'full theme.json config: tokens, fonts, section overrides, layouts.',
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
      { name: 'page', type: 'number', optional: true, description: '1-based page (default 1).' },
      { name: 'limit', type: 'number', optional: true, description: 'Page size (default 20, max 100).' },
      { name: 'category', type: 'string', optional: true, description: 'Category slug(s), comma-separated.' },
      { name: 'type', type: 'string', optional: true, description: 'Product kind: physical or digital.' },
      { name: 'search', type: 'string', optional: true, description: 'Free-text search term.' },
      {
        name: 'sort',
        type: 'enum',
        values: ['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'rating_desc', 'popular', 'relevance'],
        optional: true,
        description: 'Sort order (default newest).',
      },
      { name: 'minPrice', type: 'number', optional: true, description: 'Lowest price.' },
      { name: 'maxPrice', type: 'number', optional: true, description: 'Highest price.' },
      { name: 'inStock', type: 'boolean', optional: true, description: 'Only in-stock items.' },
      { name: 'onSale', type: 'boolean', optional: true, description: 'Only discounted items.' },
      { name: 'minRating', type: 'number', optional: true, description: 'Minimum average rating (0–5).' },
      { name: 'optionValueId', type: 'string', optional: true, description: 'Variant option value id(s), comma-separated.' },
      { name: 'attr.<name>', type: 'string', optional: true, description: 'Attribute filter, e.g. attr.size=M,L.' },
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
  {
    method: 'GET',
    path: '/api/products/:productId/variants',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'Every variant of a product (sku, price, attributes, stock).',
  },
  {
    method: 'GET',
    path: '/api/products/:productId/options',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'A product’s option tree (e.g. size/colour) for the PDP selector.',
  },
  {
    method: 'GET',
    path: '/api/variants/:idOrSlug',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'One variant by UUID or slug.',
  },
  {
    method: 'GET',
    path: '/api/variants/:id/options',
    tag: 'Catalog',
    auth: 'optional',
    summary: 'The option values a variant chooses.',
  },

  // ------------------------------------------------------ recommendations
  {
    method: 'GET',
    path: '/api/recommendations/trending',
    tag: 'Recommendations',
    auth: 'none',
    summary: 'Trending products (storefront widgets).',
    params: [{ name: 'limit', type: 'number', optional: true, description: 'How many (default 10).' }],
  },
  {
    method: 'GET',
    path: '/api/recommendations/new-arrivals',
    tag: 'Recommendations',
    auth: 'none',
    summary: 'Newest products for “new arrivals” rows.',
    params: [{ name: 'limit', type: 'number', optional: true, description: 'How many (default 10).' }],
  },
  {
    method: 'GET',
    path: '/api/recommendations/also-bought/:productId',
    tag: 'Recommendations',
    auth: 'none',
    summary: '“Customers also bought” for a product.',
  },
  {
    method: 'GET',
    path: '/api/recommendations/bought-together/:productId',
    tag: 'Recommendations',
    auth: 'none',
    summary: '“Frequently bought together” for a product.',
  },
  {
    method: 'GET',
    path: '/api/recommendations/personalized',
    tag: 'Recommendations',
    auth: 'optional',
    summary: 'Personalized feed; anonymous requests get the generic fallback.',
  },
  {
    method: 'GET',
    path: '/api/recommendations/history',
    tag: 'Recommendations',
    auth: 'customer',
    summary: 'Recommendations based on the customer’s browsing history.',
  },
  {
    method: 'POST',
    path: '/api/recommendations/click',
    tag: 'Recommendations',
    auth: 'none',
    summary: 'Log a recommendation click (fired by storefront widgets).',
  },
  {
    method: 'POST',
    path: '/api/recommendations/purchase',
    tag: 'Recommendations',
    auth: 'customer',
    summary: 'Log that a recommended product was purchased.',
  },

  // -------------------------------------------------------------- checkout
  {
    method: 'POST',
    path: '/api/coupons/validate',
    tag: 'Checkout',
    auth: 'none',
    summary:
      'Advisory coupon check for the cart page — order placement recomputes ' +
      'the same rules server-side, so the shown discount is the one applied.',
    params: [
      { name: 'code', type: 'string', description: 'Coupon code.' },
      { name: 'subtotal', type: 'number', optional: true, description: 'Cart subtotal the rules evaluate against.' },
    ],
  },
  {
    method: 'POST',
    path: '/api/shipping/calculate',
    tag: 'Checkout',
    auth: 'none',
    summary:
      'Estimate shipping methods for an address (advisory — the order ' +
      'recomputes the same numbers server-side).',
    params: [
      { name: 'country', type: 'string', description: 'Country code (required).' },
      { name: 'state', type: 'string', optional: true, description: 'State/province code.' },
      { name: 'zipCode', type: 'string', optional: true, description: 'Postal code.' },
      { name: 'subtotal', type: 'number', optional: true, description: 'Cart subtotal.' },
      { name: 'weight', type: 'number', optional: true, description: 'Total weight.' },
      { name: 'itemCount', type: 'number', optional: true, description: 'Number of items.' },
    ],
  },
  {
    method: 'POST',
    path: '/api/shipping/zones/lookup',
    tag: 'Checkout',
    auth: 'none',
    summary: 'Find the active shipping zones matching an address.',
    params: [
      { name: 'country', type: 'string', description: 'Country code (required).' },
      { name: 'state', type: 'string', optional: true, description: 'State/province code.' },
      { name: 'zipCode', type: 'string', optional: true, description: 'Postal code.' },
    ],
  },

  // --------------------------------------------------------------- content
  {
    method: 'GET',
    path: '/api/pages',
    tag: 'Content',
    auth: 'none',
    summary:
      'Published pages in admin order (id, slug, title, excerpt, pageType, ' +
      'footer visibility).',
    params: [
      { name: 'lang', type: 'string', optional: true, description: 'Language code for localised fields.' },
    ],
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
    summary:
      'Enabled currencies with symbols and rates to the store base — the ' +
      'base currency is always included, even without a Currency row.',
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
    method: 'GET',
    path: '/api/account/downloads',
    tag: 'Customer',
    auth: 'customer',
    summary: 'The digital downloads the signed-in customer purchased.',
  },
  {
    method: 'GET',
    path: '/api/account/downloads/:id',
    tag: 'Customer',
    auth: 'customer',
    summary: 'One of the customer’s downloads.',
  },
  {
    method: 'GET',
    path: '/api/downloads/:token',
    tag: 'Customer',
    auth: 'optional',
    summary:
      'Resolve a one-time download token (from the order email) to its file.',
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
  {
    method: 'DELETE',
    path: '/api/stock-alerts/:productId',
    tag: 'Engagement',
    auth: 'none',
    summary:
      'Cancel a stock alert. Signed-in customers are matched by account; ' +
      'guests pass their email (unsubscribe links in the alert emails).',
    params: [
      { name: 'email', type: 'string', optional: true, description: 'Guest email that subscribed.' },
      { name: 'variantId', type: 'string', optional: true, description: 'Alert for a specific variant.' },
    ],
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
