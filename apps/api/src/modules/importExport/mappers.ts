/**
 * Bulk import mappers: turn raw CSV/JSON rows into validated, normalised
 * write plans for products and categories.
 *
 * The same function serves the PREVIEW (dry run: classify each row as
 * create / update / error) and the COMMIT (execute the valid rows). The
 * commit re-runs the mapper on the raw text - the client's preview is
 * never trusted as a source of truth, only the raw file is.
 *
 * Import semantics:
 *   - Products match existing rows by SKU (exact match). No match ->
 *     create, match -> update the provided fields.
 *   - Categories match by slug, then name (case-insensitive).
 *   - On update, empty cells are ignored (the field is left as-is), so a
 *     partial file can update a subset of fields. On create, empty cells
 *     fall back to the schema defaults.
 *   - `variants` / `images`, when present (even as an empty array),
 *     REPLACE the product's existing variants/images; when absent, they
 *     are left untouched.
 */
import slugify from 'slugify';
import { prisma } from '../../config/database';
import { parseCsv, serializeCsv } from '../../utils/csv';

export { serializeCsv as serializeCsvFile } from '../../utils/csv';

// ---------------------------------------------------------------------------
// limits
// ---------------------------------------------------------------------------
export const MAX_INPUT_CHARS = 1_000_000; // ~1MB of CSV text
export const MAX_ROWS = 2000;

export type Entity = 'products' | 'categories' | 'customers' | 'orders';
export type ImportFormat = 'csv' | 'json';
export type RowStatus = 'create' | 'update' | 'error';

/**
 * Resolves an uploaded-file token (from a product row's `@file:<name>`
 * image URL) to a real served URL. Supplied by the multipart import
 * endpoint, which uploads the attached image files before parsing.
 */
export type ImageUrlResolver = (token: string) => string | undefined;

export interface PreviewRow {
  /** 1-based position in the file (data rows only). */
  row: number;
  status: RowStatus;
  sku?: string;
  name?: string;
  category?: string;
  errors: string[];
}

export interface ImportResult {
  entity: Entity;
  total: number;
  summary: { create: number; update: number; error: number };
  rows: PreviewRow[];
}

// ---------------------------------------------------------------------------
// small coercion helpers
// ---------------------------------------------------------------------------

const BOOL_TRUE = new Set(['true', '1', 'yes', 'y', 'on']);
const BOOL_FALSE = new Set(['false', '0', 'no', 'n', 'off']);

/**
 * Coerce a cell to a boolean. Returns undefined for empty cells (the
 * caller treats that as "not provided") and throws for garbage.
 */
export function parseBool(v: unknown, field: string): boolean | undefined {
  // Already a boolean (JSON import) - use it as-is.
  if (v === true || v === false) return v;
  // Empty cell means "not provided" - the caller leaves the field as-is.
  if (v === null || v === undefined || v === '') return undefined;
  // Accept the common spreadsheet spellings (true/1/yes/y/on, ...).
  const s = String(v).trim().toLowerCase();
  if (BOOL_TRUE.has(s)) return true;
  if (BOOL_FALSE.has(s)) return false;
  throw new Error(`${field}: expected true/false, got "${v}"`);
}

/** Coerce a cell to a finite number or undefined for empty cells. */
export function parseNumber(v: unknown, field: string): number | undefined {
  // Empty cell means "not provided" - the caller leaves the field as-is.
  if (v === null || v === undefined || v === '') return undefined;
  // Already a number (JSON import) - must be finite to be usable.
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`${field}: not a number`);
    return v;
  }
  // CSV cells are strings; trim and parse. NaN (e.g. "12abc") is rejected.
  const s = String(v).trim();
  if (s === '') return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`${field}: expected a number, got "${v}"`);
  return n;
}

/** Parse an ISO date string or Date; empty -> undefined. */
export function parseDate(v: unknown, field: string): Date | undefined {
  // Empty cell means "not provided" - the caller leaves the field as-is.
  if (v === null || v === undefined || v === '') return undefined;
  // A real Date (JSON import) - accept it if it's a valid timestamp.
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new Error(`${field}: invalid date`);
    return v;
  }
  // CSV cell: parse as a date string; NaN means it wasn't a valid date.
  const d = new Date(String(v).trim());
  if (Number.isNaN(d.getTime())) throw new Error(`${field}: expected a date (e.g. 2026-12-01), got "${v}"`);
  return d;
}

/** Parse a JSON cell (object/array) or pass through an object; empty -> undefined. */
export function parseJsonCell(v: unknown, field: string): any {
  // Empty cell means "not provided" - the caller leaves the field as-is.
  if (v === null || v === undefined || v === '') return undefined;
  // Already an object/array (JSON import) - use it directly.
  if (typeof v === 'object') return v;
  // CSV cell: a JSON-encoded string (e.g. the variants/images columns).
  const s = String(v).trim();
  if (s === '') return undefined;
  try {
    return JSON.parse(s);
  } catch {
    throw new Error(`${field}: expected JSON (e.g. [{"url":"/x.jpg"}])`);
  }
}

/**
 * metaKeywords accepts a JSON array (`["a","b"]`), a native array, or a
 * plain comma-separated string (`a, b` - what a spreadsheet column
 * usually holds). Empty -> undefined. Throws on anything else; the
 * caller records it as a row error.
 */
export function parseKeywords(v: unknown): string[] | undefined {
  // Empty cell means "not provided" - the caller leaves the field as-is.
  if (v === null || v === undefined || v === '') return undefined;
  // Already an array (JSON import) - normalise each entry to a trimmed string.
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    throw new Error('metaKeywords: expected a JSON array or comma-separated list');
  }
  const s = String(v).trim();
  if (s === '') return undefined;
  // Starts with '[' -> treat as a JSON array string; otherwise fall back to a
  // plain comma-separated list (what a spreadsheet column usually holds).
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch {
      // invalid JSON array - fall through to the error below
    }
    throw new Error('metaKeywords: expected a JSON array like ["a","b"]');
  }
  // Plain comma-separated string (the common spreadsheet case).
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// product row
// ---------------------------------------------------------------------------

export interface VariantInput {
  name: string;
  sku: string;
  slug?: string | null;
  price: number;
  compareAtPrice?: number | null;
  quantity?: number;
  attributes?: Record<string, string>;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ImageInput {
  url: string;
  alt?: string | null;
  isPrimary?: boolean;
}

export interface ProductPlan {
  /** Match key. */
  sku: string;
  /** Fields to write (validated, non-empty). */
  data: Record<string, any>;
  /** Replace product images when present (array, possibly empty). */
  images?: ImageInput[];
  /** Replace product variants when present (array, possibly empty). */
  variants?: VariantInput[];
  name?: string;
  slug?: string;
  errors: string[];
}

const TYPE_VALUES = ['physical', 'digital'];
const STATUS_VALUES = ['draft', 'active', 'inactive', 'archived'];
const WEIGHT_UNITS = ['kg', 'lb', 'oz', 'g'];

export const PRODUCT_CSV_HEADERS = [
  'name', 'sku', 'slug', 'description', 'shortDescription', 'type', 'status',
  'price', 'compareAtPrice', 'costPrice', 'trackInventory', 'quantity',
  'lowStockThreshold', 'allowBackorder', 'backorderLimit', 'expectedRestockAt',
  'downloadUrl', 'downloadLimit', 'downloadExpiry', 'weight', 'weightUnit',
  'dimensions', 'category', 'metaTitle', 'metaDescription', 'metaKeywords',
  'images', 'options', 'variants',
  'variantSkus', 'variantNames', 'variantPrices', 'variantQuantities', 'variantOptions',
];

/**
 * Validate one raw product row (object of string values from CSV, or
 * native values from JSON) into a write plan. Never throws - every
 * problem lands in plan.errors so a bad row can't sink the file.
 *
 * The coercion helpers (parseNumber, parseDate, parseJsonCell, ...)
 * throw on garbage; the wrapper below catches them and turns the
 * message into a row error instead of a 500.
 */
export function mapProductRow(
  raw: Record<string, unknown>,
  existing: { sku: string }[] | null,
  opts: { resolveImage?: ImageUrlResolver } = {},
): ProductPlan {
  const plan: ProductPlan = { sku: '', data: {}, errors: [] };
  try {
    buildProductPlan(plan, raw, opts);
  } catch (e) {
    plan.errors.push(e instanceof Error ? e.message : String(e));
  }
  return plan;
}

// Fill `plan` by reading/validating each cell of `raw`. Throws on a
/**
 * Read a cell as a trimmed string; empty/missing -> undefined ("not provided").
 * Also strips the protective apostrophe the CSV exporter adds to cells that
 * would otherwise read as spreadsheet formulas, so export -> import round
 * trips preserve the original value ("=1+1" stays "=1+1", not "'=1+1").
 */
export function readStrCell(raw: Record<string, unknown>, k: string): string | undefined {
  const v = raw[k];
  if (v === null || v === undefined) return undefined;
  let s = String(v).trim();
  if (s === '') return undefined;
  if (s.length > 1 && s[0] === "'" && /^[=+@\t\r]|^-[^0-9.]/.test(s.slice(1))) {
    s = s.slice(1);
  }
  return s;
}

// malformed cell (the parseNumber/parseBool/... helpers throw on garbage);
// mapProductRow catches it and records it as a row error instead of a 500.
function buildProductPlan(
  plan: ProductPlan,
  raw: Record<string, unknown>,
  opts: { resolveImage?: ImageUrlResolver } = {},
): void {
  const err = (msg: string) => plan.errors.push(msg);

  // Read a cell as a trimmed string; empty/missing -> undefined ("not provided").
  const str = (k: string): string | undefined => readStrCell(raw, k);

  // --- required identity -------------------------------------------------
  const name = str('name');
  const sku = str('sku');
  const price = parseNumber(raw['price'], 'price');

  if (!sku) {
    err('sku is required (it is the import match key)');
  } else {
    plan.sku = sku;
    if (sku.length > 100) err('sku is longer than 100 characters');
  }
  if (!name) {
    err('name is required');
  } else {
    if (name.length > 255) err('name is longer than 255 characters');
    plan.name = name;
    plan.data.name = name;
  }
  if (price === undefined) {
    err('price is required and must be a number');
  } else if (price <= 0) {
    err(`price must be positive, got ${price}`);
  } else {
    plan.data.price = price;
  }

  const description = str('description');
  const shortDescription = str('shortDescription');
  plan.data.description = description ?? shortDescription ?? plan.name ?? '';

  if (shortDescription !== undefined) plan.data.shortDescription = shortDescription;

  // --- enums -------------------------------------------------------------
  const type = str('type')?.toLowerCase();
  if (type !== undefined) {
    if (!TYPE_VALUES.includes(type)) err(`type must be one of ${TYPE_VALUES.join(', ')} - got "${type}"`);
    else plan.data.type = type;
  }
  const status = str('status')?.toLowerCase();
  if (status !== undefined) {
    if (!STATUS_VALUES.includes(status)) err(`status must be one of ${STATUS_VALUES.join(', ')} - got "${status}"`);
    else plan.data.status = status;
  }
  const weightUnit = str('weightUnit')?.toLowerCase();
  if (weightUnit !== undefined) {
    if (!WEIGHT_UNITS.includes(weightUnit)) err(`weightUnit must be one of ${WEIGHT_UNITS.join(', ')} - got "${weightUnit}"`);
    else plan.data.weightUnit = weightUnit;
  }

  // --- numbers -----------------------------------------------------------
  const numField = (k: string, opts: { min?: number; int?: boolean; max?: number } = {}) => {
    const v = parseNumber(raw[k], k);
    if (v === undefined) return;
    if (opts.min !== undefined && v < opts.min) err(`${k} must be >= ${opts.min}, got ${v}`);
    if (opts.max !== undefined && v > opts.max) err(`${k} must be <= ${opts.max}, got ${v}`);
    if (opts.int && !Number.isInteger(v)) err(`${k} must be a whole number, got ${v}`);
    plan.data[k] = v;
  };
  numField('compareAtPrice', { min: 0 });
  numField('costPrice', { min: 0 });
  numField('quantity', { min: 0, int: true });
  numField('lowStockThreshold', { min: 0, int: true });
  numField('backorderLimit', { min: 0, int: true });
  numField('downloadLimit', { min: 1, int: true });
  numField('downloadExpiry', { min: 1, int: true });
  numField('weight', { min: 0 });

  // --- booleans ----------------------------------------------------------
  const boolField = (k: string) => {
    const v = parseBool(raw[k], k);
    if (v !== undefined) plan.data[k] = v;
  };
  boolField('trackInventory');
  boolField('allowBackorder');

  // --- date --------------------------------------------------------------
  const restock = parseDate(raw['expectedRestockAt'], 'expectedRestockAt');
  if (restock !== undefined) plan.data.expectedRestockAt = restock;

  // --- strings -----------------------------------------------------------
  const strField = (k: string, max?: number) => {
    const v = str(k);
    if (v === undefined) return;
    if (max && v.length > max) err(`${k} is longer than ${max} characters`);
    plan.data[k] = v;
  };
  strField('slug', 255);
  strField('downloadUrl');
  strField('metaTitle', 255);
  strField('metaDescription', 500);

  const keywords = parseKeywords(raw['metaKeywords']);
  if (keywords !== undefined) plan.data.metaKeywords = JSON.stringify(keywords);

  // --- dimensions (JSON object or plain text) -----------------------------
  const dims = parseJsonCell(raw['dimensions'], 'dimensions');
  if (dims !== undefined) {
    if (typeof dims === 'object' && !Array.isArray(dims)) {
      plan.data.dimensions = dims;
    } else if (typeof dims === 'string') {
      plan.data.dimensions = dims;
    } else {
      err('dimensions: expected an object like {"length":10,"width":5,"height":2,"unit":"cm"}');
    }
  }

  // --- category (resolved at execution time; keep the raw reference) ------
  const category = str('category');
  if (category !== undefined) plan.data.__category = category;

  // --- variants ------------------------------------------------------------
  // The variants column holds a JSON array (as a string in CSV, a native
  // array in JSON). When present it REPLACES the product's variants; when
  // absent the product's existing variants are left untouched.
  const variantsRaw = parseJsonCell(raw['variants'], 'variants');
  if (variantsRaw !== undefined) {
    if (!Array.isArray(variantsRaw)) {
      err('variants: expected a JSON array');
    } else {
      const seen = new Set<string>(); // catch duplicate variant SKUs in this row
      const variants: VariantInput[] = [];
      for (let i = 0; i < variantsRaw.length; i++) {
        const v = variantsRaw[i] as Record<string, unknown>;
        const name2 = v?.name != null ? String(v.name).trim() : '';
        const sku2 = v?.sku != null ? String(v.sku).trim() : '';
        const price2 = parseNumber(v?.price, `variants[${i}].price`);
        // A variant is identified by name + sku + a positive price.
        if (!name2) { err(`variants[${i}]: name is required`); continue; }
        if (!sku2) { err(`variants[${i}]: sku is required (variant match key)`); continue; }
        if (seen.has(sku2)) { err(`variants[${i}]: duplicate variant sku "${sku2}"`); continue; }
        seen.add(sku2);
        if (price2 === undefined || price2 <= 0) {
          err(`variants[${i}]: price is required and must be positive`);
          continue;
        }
        const item: VariantInput = { name: name2, sku: sku2, price: price2 };
        // Optional variant fields - only set when provided.
        const vslug = v?.slug != null && String(v.slug).trim() !== '' ? String(v.slug).trim() : null;
        if (vslug) item.slug = vslug;
        const vprice = parseNumber(v?.compareAtPrice, `variants[${i}].compareAtPrice`);
        if (vprice !== undefined) item.compareAtPrice = vprice;
        const vqty = parseNumber(v?.quantity, `variants[${i}].quantity`);
        if (vqty !== undefined) item.quantity = vqty;
        const attrs = parseJsonCell(v?.attributes, `variants[${i}].attributes`);
        if (attrs !== undefined) {
          if (typeof attrs === 'object' && !Array.isArray(attrs)) item.attributes = attrs as Record<string, string>;
          else err(`variants[${i}]: attributes must be a JSON object`);
        }
        const va = parseBool(v?.isActive, `variants[${i}].isActive`);
        if (va !== undefined) item.isActive = va;
        const vsort = parseNumber(v?.sortOrder, `variants[${i}].sortOrder`);
        if (vsort !== undefined) item.sortOrder = vsort;
        variants.push(item);
      }
      plan.variants = variants;
    }
  }

  // --- images ---------------------------------------------------------------
  // The images column holds a JSON array (string in CSV, array in JSON).
  // When present it REPLACES the product's images; when absent the product's
  // existing images are left untouched. Each entry needs a url.
  const imagesRaw = parseJsonCell(raw['images'], 'images');
  if (imagesRaw !== undefined) {
    if (!Array.isArray(imagesRaw)) {
      err('images: expected a JSON array');
    } else {
      const images: ImageInput[] = [];
      for (let i = 0; i < imagesRaw.length; i++) {
        const im = imagesRaw[i] as Record<string, unknown>;
        const url = im?.url != null ? String(im.url).trim() : '';
        if (!url) { err(`images[${i}]: url is required`); continue; }
        let resolvedUrl = url;
        // `@file:<name>` references an image file attached to the import
        // (the multipart endpoint uploads them first and passes the map in).
        // A placeholder that can't be resolved is a hard row error so the
        // admin sees exactly which file is missing.
        if (url.startsWith('@file:')) {
          const token = url.slice(6);
          const hit = opts.resolveImage ? opts.resolveImage(token) : undefined;
          if (!hit) {
            err(`images[${i}]: referenced file "@file:${token}" was not uploaded`);
            continue;
          }
          resolvedUrl = hit;
        }
        const item: ImageInput = { url: resolvedUrl };
        // Optional alt text and primary flag - only set when provided.
        if (im.alt != null && String(im.alt).trim() !== '') item.alt = String(im.alt).trim();
        const primary = parseBool(im?.isPrimary, `images[${i}].isPrimary`);
        if (primary !== undefined) item.isPrimary = primary;
        images.push(item);
      }
      plan.images = images;
    }
  }
}

// ---------------------------------------------------------------------------
// category row
// ---------------------------------------------------------------------------

export interface CategoryPlan {
  /** Match key: slug when provided, else name. */
  matchKey: string;
  bySlug: boolean;
  data: Record<string, any>;
  name?: string;
  slug?: string;
  parentRef?: string;
  errors: string[];
}

export const CATEGORY_CSV_HEADERS = ['name', 'slug', 'description', 'image', 'parent', 'isActive', 'sortOrder'];

/**
 * Validate one raw category row into a write plan. Like
 * mapProductRow this never throws - bad cells become row errors.
 */
export function mapCategoryRow(raw: Record<string, unknown>): CategoryPlan {
  const plan: CategoryPlan = { matchKey: '', bySlug: false, data: {}, errors: [] };
  try {
    buildCategoryPlan(plan, raw);
  } catch (e) {
    plan.errors.push(e instanceof Error ? e.message : String(e));
  }
  return plan;
}

// Fill `plan` by reading/validating each cell of `raw`. Like
// buildProductPlan this throws on a malformed cell; mapCategoryRow catches
// it and records it as a row error instead of a 500.
function buildCategoryPlan(plan: CategoryPlan, raw: Record<string, unknown>): void {
  const err = (msg: string) => plan.errors.push(msg);
  // Read a cell as a trimmed string; empty/missing -> undefined ("not provided").
  const str = (k: string): string | undefined => readStrCell(raw, k);

  const name = str('name');
  const slug = str('slug');
  if (!name && !slug) {
    err('name (or at least slug) is required');
  }
  if (name) {
    if (name.length > 255) err('name is longer than 255 characters');
    plan.name = name;
    plan.data.name = name;
  }
  if (slug) {
    if (slug.length > 255) err('slug is longer than 255 characters');
    plan.slug = slug;
    plan.data.slug = slug;
  }

  const description = str('description');
  if (description !== undefined) plan.data.description = description;
  const image = str('image');
  if (image !== undefined) plan.data.image = image;
  const parent = str('parent');
  if (parent !== undefined) plan.parentRef = parent;

  const active = parseBool(raw['isActive'], 'isActive');
  if (active !== undefined) plan.data.isActive = active;
  const sort = parseNumber(raw['sortOrder'], 'sortOrder');
  if (sort !== undefined) {
    if (!Number.isInteger(sort)) err('sortOrder must be a whole number');
    else plan.data.sortOrder = sort;
  }

  plan.matchKey = slug ?? name ?? '';
  plan.bySlug = !!slug;
}

// ---------------------------------------------------------------------------
// customer row
// ---------------------------------------------------------------------------

export interface AddressInput {
  firstName?: string;
  lastName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  type?: string;
}

export interface CustomerPlan {
  /** Match key: email, lowercased. */
  email: string;
  data: Record<string, any>;
  addresses?: AddressInput[];
  errors: string[];
}

export const CUSTOMER_CSV_HEADERS = ['email', 'firstName', 'lastName', 'phone', 'isActive', 'addresses'];

/**
 * Validate one raw customer row. Customers match by email (case-insensitive);
 * on create the caller supplies a placeholder password (customer import is
 * about onboarding account data, not credentials).
 */
export function mapCustomerRow(raw: Record<string, unknown>): CustomerPlan {
  const plan: CustomerPlan = { email: '', data: {}, errors: [] };
  try {
    buildCustomerPlan(plan, raw);
  } catch (e) {
    plan.errors.push(e instanceof Error ? e.message : String(e));
  }
  return plan;
}

function buildCustomerPlan(plan: CustomerPlan, raw: Record<string, unknown>): void {
  const err = (msg: string) => plan.errors.push(msg);
  const str = (k: string): string | undefined => readStrCell(raw, k);

  const email = str('email')?.toLowerCase();
  if (!email) {
    err('email is required (it is the import match key)');
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err(`email "${email}" is not a valid address`);
    if (email.length > 255) err('email is longer than 255 characters');
    plan.email = email;
  }

  const firstName = str('firstName');
  const lastName = str('lastName');
  if (firstName !== undefined) {
    if (firstName.length > 100) err('firstName is longer than 100 characters');
    plan.data.firstName = firstName;
  }
  if (lastName !== undefined) {
    if (lastName.length > 100) err('lastName is longer than 100 characters');
    plan.data.lastName = lastName;
  }
  const phone = str('phone');
  if (phone !== undefined) {
    if (phone.length > 50) err('phone is longer than 50 characters');
    plan.data.phone = phone;
  }
  const active = parseBool(raw['isActive'], 'isActive');
  if (active !== undefined) plan.data.isActive = active;

  // Optional `addresses` column: a JSON array of address objects.
  const addrsRaw = parseJsonCell(raw['addresses'], 'addresses');
  if (addrsRaw !== undefined) {
    if (!Array.isArray(addrsRaw)) {
      err('addresses: expected a JSON array');
    } else {
      const addrs: AddressInput[] = [];
      for (let i = 0; i < addrsRaw.length; i++) {
        const a = (addrsRaw[i] || {}) as Record<string, unknown>;
        const item: AddressInput = {};
        const f = (k: string) => {
          const v = a[k];
          if (v === null || v === undefined || String(v).trim() === '') return undefined;
          return String(v).trim();
        };
        item.firstName = f('firstName');
        item.lastName = f('lastName');
        item.address1 = f('address1') ?? f('address');
        item.city = f('city');
        item.state = f('state');
        item.postalCode = f('postalCode') ?? f('zipCode');
        item.country = f('country');
        item.phone = f('phone');
        item.type = f('type');
        if (!item.address1) { err(`addresses[${i}]: address1 is required`); continue; }
        addrs.push(item);
      }
      plan.addresses = addrs;
    }
  }
}

// ---------------------------------------------------------------------------
// order row
// ---------------------------------------------------------------------------

export interface OrderItemInput {
  /** Product match key (exact SKU). */
  sku: string;
  /** Optional variant SKU for a specific line. */
  variantSku?: string;
  quantity: number;
  unitPrice?: number;
}

export interface OrderPlan {
  orderNumber?: string;
  /** Customer match key (email). */
  customerEmail: string;
  data: Record<string, any>;
  items?: OrderItemInput[];
  shippingAddress?: AddressInput;
  errors: string[];
}

const ORDER_STATUS_VALUES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PAYMENT_STATUS_VALUES = ['pending', 'completed', 'failed', 'refunded'];

export const ORDER_CSV_HEADERS = [
  'orderNumber', 'customerEmail', 'status', 'subtotal', 'taxAmount',
  'shippingAmount', 'discountAmount', 'totalAmount', 'paymentMethod',
  'paymentStatus', 'notes', 'items',
  'shippingFirstName', 'shippingLastName', 'shippingAddress1', 'shippingCity',
  'shippingState', 'shippingPostalCode', 'shippingCountry', 'shippingPhone',
  'createdAt',
];

/**
 * Validate one raw order row. Orders match by orderNumber (if present and
 * found) or are created. The customer email is required and is resolved to
 * an existing user at execution time (created if missing).
 */
export function mapOrderRow(raw: Record<string, unknown>): OrderPlan {
  const plan: OrderPlan = { customerEmail: '', data: {}, errors: [] };
  try {
    buildOrderPlan(plan, raw);
  } catch (e) {
    plan.errors.push(e instanceof Error ? e.message : String(e));
  }
  return plan;
}

function buildOrderPlan(plan: OrderPlan, raw: Record<string, unknown>): void {
  const err = (msg: string) => plan.errors.push(msg);
  const str = (k: string): string | undefined => readStrCell(raw, k);

  const orderNumber = str('orderNumber');
  if (orderNumber) {
    if (orderNumber.length > 64) err('orderNumber is longer than 64 characters');
    else plan.orderNumber = orderNumber;
  }

  const customerEmail = str('customerEmail')?.toLowerCase();
  if (!customerEmail) {
    err('customerEmail is required (resolved to a customer by email)');
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) err(`customerEmail "${customerEmail}" is not a valid address`);
    plan.customerEmail = customerEmail;
  }

  const status = str('status')?.toLowerCase();
  if (status !== undefined) {
    if (!ORDER_STATUS_VALUES.includes(status)) err(`status must be one of ${ORDER_STATUS_VALUES.join(', ')} - got "${status}"`);
    else plan.data.status = status;
  }
  const paymentStatus = str('paymentStatus')?.toLowerCase();
  if (paymentStatus !== undefined) {
    if (!PAYMENT_STATUS_VALUES.includes(paymentStatus)) err(`paymentStatus must be one of ${PAYMENT_STATUS_VALUES.join(', ')} - got "${paymentStatus}"`);
    else plan.data.paymentStatus = paymentStatus;
  }
  const paymentMethod = str('paymentMethod');
  if (paymentMethod !== undefined) plan.data.paymentMethod = paymentMethod;
  const notes = str('notes');
  if (notes !== undefined) plan.data.notes = notes;

  const numField = (k: string, opts: { min?: number } = {}) => {
    const v = parseNumber(raw[k], k);
    if (v === undefined) return;
    if (opts.min !== undefined && v < opts.min) err(`${k} must be >= ${opts.min}, got ${v}`);
    plan.data[k] = v;
  };
  numField('subtotal', { min: 0 });
  numField('taxAmount', { min: 0 });
  numField('shippingAmount', { min: 0 });
  numField('discountAmount', { min: 0 });
  numField('totalAmount', { min: 0 });

  const createdAt = parseDate(raw['createdAt'], 'createdAt');
  if (createdAt !== undefined) plan.data.createdAt = createdAt;

  // --- items (JSON array of { sku, variantSku?, quantity, unitPrice? }) ----
  const itemsRaw = parseJsonCell(raw['items'], 'items');
  if (itemsRaw !== undefined) {
    if (!Array.isArray(itemsRaw)) {
      err('items: expected a JSON array');
    } else {
      const items: OrderItemInput[] = [];
      for (let i = 0; i < itemsRaw.length; i++) {
        const it = (itemsRaw[i] || {}) as Record<string, unknown>;
        const sku2 = str_of(it.sku);
        const qty = parseNumber(it.quantity, `items[${i}].quantity`);
        if (!sku2) { err(`items[${i}]: sku is required`); continue; }
        if (qty === undefined || qty <= 0 || !Number.isInteger(qty)) {
          err(`items[${i}]: quantity must be a positive whole number`);
          continue;
        }
        const item: OrderItemInput = { sku: sku2, quantity: qty };
        const variantSku = str_of(it.variantSku);
        if (variantSku) item.variantSku = variantSku;
        const unitPrice = parseNumber(it.unitPrice, `items[${i}].unitPrice`);
        if (unitPrice !== undefined && unitPrice >= 0) item.unitPrice = unitPrice;
        items.push(item);
      }
      plan.items = items;
    }
  }

  // --- shipping address (individual columns) --------------------------------
  const ship: AddressInput = {};
  const ss = (k: string): string | undefined => {
    const v = str(k);
    return v;
  };
  const fn = ss('shippingFirstName');
  const ln = ss('shippingLastName');
  const a1 = ss('shippingAddress1');
  const city = ss('shippingCity');
  const state = ss('shippingState');
  const zip = ss('shippingPostalCode');
  const country = ss('shippingCountry');
  const phone = ss('shippingPhone');
  if (fn) ship.firstName = fn;
  if (ln) ship.lastName = ln;
  if (a1) ship.address1 = a1;
  if (city) ship.city = city;
  if (state) ship.state = state;
  if (zip) ship.postalCode = zip;
  if (country) ship.country = country;
  if (phone) ship.phone = phone;
  ship.type = 'shipping';
  if (Object.keys(ship).some((k) => k !== 'type' && ship[k as keyof AddressInput])) {
    plan.shippingAddress = ship;
  }
}

function str_of(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

// ---------------------------------------------------------------------------
// file -> rows
// ---------------------------------------------------------------------------

// Turn the raw file text into an array of row objects (keyed by the header
// row for CSV, or the native object for JSON). Throws a ValidationError for
// a file that is too large / too many rows / malformed - the route catches
// it and returns a 400.
export function extractRows(
  entity: Entity,
  format: ImportFormat,
  text: string,
): Record<string, unknown>[] {
  // Reject oversized files up front (a 10 MB JSON body can still be a
  // manageable amount of rows, but a 1 MB CSV is already a lot).
  if (text.length > MAX_INPUT_CHARS) {
    throw new ValidationError(`File is too large (max ${MAX_INPUT_CHARS} characters)`);
  }
  let rows: Record<string, unknown>[];
  if (format === 'csv') {
    // First row is the header (the column keys); the rest are data rows.
    // Each data row becomes an object keyed by the (trimmed) header cells.
    const matrix = parseCsv(text);
    if (matrix.length === 0) throw new ValidationError('CSV file is empty');
    const [header, ...data] = matrix;
    const keys = header.map((h) => h.trim());
    if (!keys.length) throw new ValidationError('CSV file is missing a header row');
    rows = data.map((cells) => {
      const row: Record<string, unknown> = {};
      keys.forEach((k, i) => {
        if (k) row[k] = cells[i] ?? '';
      });
      return row;
    });
  } else {
    // JSON import: either a bare array of rows, or an object wrapping the
    // array under the entity key (e.g. { "products": [ ... ] }).
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ValidationError('Invalid JSON file');
    }
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed as any)?.[entity];
    if (!Array.isArray(arr)) {
      throw new ValidationError(`JSON must be an array of rows or an object with a "${entity}" array`);
    }
    rows = arr.map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}));
  }
  if (rows.length > MAX_ROWS) {
    throw new ValidationError(`Too many rows (max ${MAX_ROWS})`);
  }
  return rows;
}

export class ValidationError extends Error {}

// ---------------------------------------------------------------------------
// preview: classify rows without writing
// ---------------------------------------------------------------------------

export async function previewImport(
  entity: Entity,
  format: ImportFormat,
  text: string,
  opts: { resolveImage?: ImageUrlResolver } = {},
): Promise<ImportResult> {
  const rows = extractRows(entity, format, text);
  const result: ImportResult = {
    entity,
    total: rows.length,
    summary: { create: 0, update: 0, error: 0 },
    rows: [],
  };

  // Preload match keys so row N doesn't re-query the DB per field.
  let existingSkus: Set<string> | null = null;
  let existingCategories: Map<string, string> | null = null; // lower(name|slug) -> true
  let existingEmails: Set<string> | null = null;
  let existingOrderNumbers: Set<string> | null = null;
  if (entity === 'products') {
    const skus = await prisma.product.findMany({ where: {}, select: { sku: true } });
    existingSkus = new Set(skus.map((s) => s.sku));
  } else if (entity === 'categories') {
    const cats = await prisma.category.findMany({ select: { name: true, slug: true } });
    existingCategories = new Map<string, string>();
    for (const c of cats) {
      existingCategories.set(c.name.toLowerCase(), 'name');
      existingCategories.set(c.slug.toLowerCase(), 'slug');
    }
  } else if (entity === 'customers') {
    const users = await prisma.user.findMany({ where: {}, select: { email: true } });
    existingEmails = new Set(users.map((u) => u.email.toLowerCase()));
  } else {
    const orders = await prisma.order.findMany({ where: {}, select: { orderNumber: true } });
    existingOrderNumbers = new Set(orders.map((o) => o.orderNumber));
  }

  const seenSkus = new Set<string>(); // catch duplicate SKUs / orderNumbers within the file
  const seenEmails = new Set<string>(); // duplicate emails within the file

  // Classify each row: a row with validation errors is an "error";
  // otherwise a product is an "update" if its SKU already exists, else a
  // "create". A category is an "update" if its slug/name already exists,
  // else a "create". Nothing is written - this is a pure dry run.
  rows.forEach((raw, i) => {
    const rowNo = i + 1;
    let row: PreviewRow;
    if (entity === 'products') {
      const plan = mapProductRow(raw, null, opts);
      row = { row: rowNo, status: 'error', errors: plan.errors, sku: plan.sku || undefined, name: plan.name };
      if (plan.errors.length === 0) {
        if (seenSkus.has(plan.sku)) {
          row.errors.push(`duplicate sku "${plan.sku}" in this file`);
        } else {
          seenSkus.add(plan.sku);
          row.status = existingSkus!.has(plan.sku) ? 'update' : 'create';
        }
      }
    } else if (entity === 'categories') {
      const plan = mapCategoryRow(raw);
      row = { row: rowNo, status: 'error', errors: plan.errors, name: plan.name };
      if (plan.errors.length === 0) {
        const key = plan.matchKey.toLowerCase();
        row.status = existingCategories!.has(key) ? 'update' : 'create';
      }
    } else if (entity === 'customers') {
      const plan = mapCustomerRow(raw);
      row = { row: rowNo, status: 'error', errors: plan.errors, name: plan.data.firstName || plan.email, sku: plan.email };
      if (plan.errors.length === 0) {
        if (seenEmails.has(plan.email)) {
          row.errors.push(`duplicate email \"${plan.email}\" in this file`);
        } else {
          seenEmails.add(plan.email);
          row.status = existingEmails!.has(plan.email) ? 'update' : 'create';
        }
      }
    } else {
      const plan = mapOrderRow(raw);
      row = { row: rowNo, status: 'error', errors: plan.errors, name: plan.customerEmail, sku: plan.orderNumber };
      if (plan.errors.length === 0) {
        if (plan.orderNumber) {
          if (seenSkus.has(plan.orderNumber)) {
            row.errors.push(`duplicate orderNumber \"${plan.orderNumber}\" in this file`);
          } else {
            seenSkus.add(plan.orderNumber);
            row.status = existingOrderNumbers!.has(plan.orderNumber) ? 'update' : 'create';
          }
        } else {
          row.status = 'create';
        }
      }
    }
    result.rows.push(row);
    result.summary[row.status]++;
  });

  return result;
}
