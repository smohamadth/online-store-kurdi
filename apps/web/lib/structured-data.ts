/**
 * Schema.org JSON-LD builders for the storefront.
 *
 * These are pure functions that take a typed input and return a
 * schema.org object. Pages render the result with the
 * `<JsonLdScript>` component (or inline, if they're server
 * components that already emit a `<script>`).
 *
 * Why pure helpers:
 *   - Unit tests assert the exact shape Google sees.
 *   - The same builder runs server-side (for crawlers) and
 *     client-side (for the PDP, which is a client component).
 *   - No hidden dependencies on `process.env`, fetch, or React
 *     state; the caller injects those.
 *
 * The functions all return `JsonLdObject` (a plain object literal
 * starting with `@context: 'https://schema.org'`). Serialise with
 * `JSON.stringify` and drop the result into a
 * `<script type="application/ld+json">` block. The schema.org
 * validators accept either a single object or an `@graph` array
 * of objects; we use the array form when a page wants to publish
 * more than one entity (Product + BreadcrumbList, etc.).
 */

export const SCHEMA_CONTEXT = 'https://schema.org';

export interface JsonLdObject {
  '@context': typeof SCHEMA_CONTEXT;
  '@type': string;
  [key: string]: unknown;
}

/** Build a single-object script body. */
export function asSingle(obj: JsonLdObject): JsonLdObject {
  return obj;
}

/**
 * Build a graph containing multiple entities. The graph is the
 * canonical way to publish >1 entity on a page (a Product and a
 * BreadcrumbList, say); Google's structured-data validator reads
 * each entry in `@graph` independently.
 */
export function asGraph(objs: JsonLdObject[]): JsonLdObject {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'ItemList', // placeholder; `@graph` overrides
    '@graph': objs as unknown as JsonLdObject,
  };
}

// ============================================================
// Product
// ============================================================

export interface ProductJsonLdInput {
  /** Canonical URL of the PDP. */
  url: string;
  name: string;
  description: string;
  /** Product images, already resolved to absolute URLs. */
  images: string[];
  sku: string;
  /** Brand or category display name. */
  brand?: string;
  /** Price + currency. */
  price: number | string;
  currency: string;
  /** Available for purchase. Backorder / preorder are separate states. */
  inStock: boolean;
  allowBackorder?: boolean;
  /** Reviews: average + count, both required for AggregateRating. */
  averageRating?: number;
  reviewCount?: number;
  /** Optional variant SKU when the page is rendering a specific variant. */
  variantSku?: string;
}

/**
 * Build the Product JSON-LD.
 *
 * The `availability` field follows Google's spec:
 *   - InStock / OutOfStock for the default case
 *   - PreOrder / BackOrder for preorder / backorder flows
 *   - Discontinued / LimitedAvailability when applicable
 *
 * When `reviewCount > 0` an `AggregateRating` is included; Google's
 * rich-result for Product requires both `ratingValue` and
 * `reviewCount`, so we omit the whole block when there are no
 * reviews rather than emitting `{ ratingValue: 0, reviewCount: 0 }`.
 */
export function buildProductJsonLd(input: ProductJsonLdInput): JsonLdObject {
  const availability = input.inStock
    ? 'https://schema.org/InStock'
    : input.allowBackorder
    ? 'https://schema.org/PreOrder'
    : 'https://schema.org/OutOfStock';

  const product: JsonLdObject = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Product',
    name: input.name,
    description: input.description,
    image: input.images.length > 0 ? input.images : undefined,
    sku: input.variantSku || input.sku,
    brand: input.brand ? { '@type': 'Brand', name: input.brand } : undefined,
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: input.currency,
      price: String(input.price),
      availability,
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  if (
    typeof input.averageRating === 'number' &&
    typeof input.reviewCount === 'number' &&
    input.reviewCount > 0
  ) {
    (product as any).aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.averageRating,
      reviewCount: input.reviewCount,
    };
  }

  // Drop undefined keys so the serialised object doesn't have
  // noisy "image": undefined entries.
  return stripUndefined(product);
}

// ============================================================
// BreadcrumbList
// ============================================================

export interface BreadcrumbJsonLdItem {
  name: string;
  url: string;
}

/**
 * Build a BreadcrumbList. `items` is rendered in order from
 * the home page outwards; the last item is the current page.
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbJsonLdItem[]): JsonLdObject {
  return stripUndefined({
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  });
}

// ============================================================
// ItemList (for /products and other catalog pages)
// ============================================================

export interface ItemListJsonLdItem {
  url: string;
  name: string;
  image?: string;
  /** Optional position; defaults to array index + 1. */
  position?: number;
}

/**
 * Build an ItemList for a catalog page (search results,
 * category pages, etc.). The Google spec treats ItemList as the
 * "this is a list of things" type; a Product-list carousel can
 * also use this with a more specific `@type` like `ProductCarousel`,
 * but `ItemList` is the safe, broadly-supported default.
 */
export function buildItemListJsonLd(
  listName: string,
  items: ItemListJsonLdItem[],
  listUrl: string,
): JsonLdObject {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'ItemList',
    name: listName,
    url: listUrl,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: it.position ?? i + 1,
      url: it.url,
      name: it.name,
      ...(it.image ? { image: it.image } : {}),
    })),
  };
}

// ============================================================
// Organization (site-wide identity card)
// ============================================================

export interface OrganizationJsonLdInput {
  name: string;
  url: string;
  logoUrl?: string;
  description?: string;
  /** SameAs: links to the brand's social profiles. */
  sameAs?: string[];
  contactEmail?: string;
}

/**
 * Build the Organization entity. Emit on every page (or once in
 * the root layout) so search engines know which entity owns the
 * content. Google's Knowledge Graph pulls from here.
 */
export function buildOrganizationJsonLd(input: OrganizationJsonLdInput): JsonLdObject {
  return stripUndefined({
    '@context': SCHEMA_CONTEXT,
    '@type': 'Organization',
    name: input.name,
    url: input.url,
    logo: input.logoUrl,
    description: input.description,
    sameAs: input.sameAs && input.sameAs.length > 0 ? input.sameAs : undefined,
    contactPoint: input.contactEmail
      ? {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: input.contactEmail,
        }
      : undefined,
  });
}

// ============================================================
// WebSite (with SearchAction sitelinks searchbox)
// ============================================================

export interface WebSiteJsonLdInput {
  name: string;
  url: string;
  description?: string;
  /**
   * The URL the search box submits to. Defaults to
   * `<url>/products?search=`. The path can be overridden (e.g.
   * for a custom search route).
   */
  searchPath?: string;
}

/**
 * Build the WebSite entity. Includes a `potentialAction` of type
 * `SearchAction` so Google can show a sitelinks searchbox for
 * the site. The target template is `searchPath={searchQuery}` -
 * the literal string `{search_query}` is what Google looks for.
 */
export function buildWebSiteJsonLd(input: WebSiteJsonLdInput): JsonLdObject {
  const searchPath = input.searchPath || '/products?search=';
  return stripUndefined({
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    description: input.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${input.url}${searchPath}{search_query}`,
      },
      // The "query-input" is required and the placeholder
      // `search_term_string` is what Google documents in the
      // SearchAction reference.
      'query-input': 'required name=search_term_string',
    },
  });
}

// ============================================================
// BlogPosting
// ============================================================

export interface BlogPostingJsonLdInput {
  /** Canonical URL of the post. */
  url: string;
  headline: string;
  description?: string;
  /** Cover image, already resolved to an absolute URL. */
  image?: string;
  datePublished: string;
  dateModified: string;
  author: string;
  publisherName: string;
  /** Comma-separated keyword list, or empty for none. */
  keywords?: string;
}

/**
 * Build the BlogPosting entity. Google's "Article" rich result
 * wants `headline`, `image`, `datePublished`, and `author`;
 * `BlogPosting` (a subtype of Article) is what blog posts use.
 */
export function buildBlogPostingJsonLd(input: BlogPostingJsonLdInput): JsonLdObject {
  return stripUndefined({
    '@context': SCHEMA_CONTEXT,
    '@type': 'BlogPosting',
    headline: input.headline,
    description: input.description,
    image: input.image ? [input.image] : undefined,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: { '@type': 'Person', name: input.author },
    publisher: { '@type': 'Organization', name: input.publisherName },
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    keywords: input.keywords || undefined,
  });
}

// ============================================================
// DigitalDocument (digital-product variant of Product)
// ============================================================

export interface DigitalDocumentJsonLdInput {
  /** Canonical URL of the PDP. */
  url: string;
  name: string;
  description: string;
  /** Cover image(s), already resolved to absolute URLs. */
  images: string[];
  /** Format the digital file is delivered in. The Google spec
   *  accepts the file extension as a free-form string
   *  (`application/pdf`, `application/zip`, `application/epub+zip`,
   *  `audio/mpeg`, etc.). Falls back to "Download" if unknown. */
  fileFormat?: string;
  /** Total size in bytes; the schema.org spec lists this as
   *  `contentSize`. We expose the raw byte count. */
  contentSizeBytes?: number;
  /** ISO 8601 date this digital product was created / published.
   *  Optional; PDPs that don't have a separate publication date
   *  for the digital file can omit it. */
  datePublished?: string;
  /** In language code form (e.g. "en", "ckb"). */
  inLanguage?: string;
  /** Keywords: comma-separated. */
  keywords?: string;
}

/**
 * Build a `DigitalDocument` JSON-LD entity. Google's docs say a
 * digital product can be advertised as a `Product` with a
 * `DigitalDocumentPermission` Offer, OR as a standalone
 * `DigitalDocument` (a subtype of `CreativeWork`).
 *
 * We use the standalone `DigitalDocument` form because:
 *   1. It cleanly captures `fileFormat` and `contentSize` (no
 *      place to put them in `Product`).
 *   2. It can be combined with the sibling `Product` in the
 *      same `@graph`, so the rich result still surfaces price +
 *      availability from the Product entry.
 *
 * Output excludes undefined keys so the serialised JSON-LD
 * stays minimal.
 */
export function buildDigitalDocumentJsonLd(
  input: DigitalDocumentJsonLdInput,
): JsonLdObject {
  return stripUndefined({
    '@context': SCHEMA_CONTEXT,
    '@type': 'DigitalDocument',
    '@id': input.url,
    name: input.name,
    description: input.description,
    image: input.images.length > 0 ? input.images : undefined,
    encodingFormat: input.fileFormat,
    contentSize: typeof input.contentSizeBytes === 'number'
      ? `${input.contentSizeBytes} bytes`
      : undefined,
    datePublished: input.datePublished,
    inLanguage: input.inLanguage,
    keywords: input.keywords && input.keywords.length > 0 ? input.keywords : undefined,
    url: input.url,
  });
}

// ============================================================
// Helpers
// ============================================================

/**
 * Recursively drop `undefined` keys. JSON.stringify already
 * omits undefined values, but the structured-data validator we
 * unit-test against is the object itself; keeping the shape
 * minimal makes the diffs easy to read.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = stripUndefined(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
