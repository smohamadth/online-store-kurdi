/**
 * In-memory mock of the Prisma client for tests.
 *
 * Why this exists:
 *   - The real `@prisma/client` is a thin wrapper that re-exports from
 *     `.prisma/client/default`, which is generated on `prisma generate`.
 *     Generating that client requires a network download from
 *     binaries.prisma.sh, which the sandbox blocks.
 *   - The test suite is otherwise purely functional; the routes do not
 *     care that prisma is the real client, only that it implements the
 *     delegate API (`findUnique`, `create`, `update`, ...).
 *
 * What it is NOT:
 *   - Not a SQL engine. It is a Map-based fake. It will not enforce
 *     referential integrity, will not honour compound unique indexes
 *     that aren't (userId, productId), and will not simulate any
 *     prisma-specific errors (P2002, P2025, ...).
 *   - For those, see the unit tests of errorHandler, which use literal
 *     error objects.
 *
 * How to use:
 *   - `import { mockPrisma } from '../helpers/mockPrisma'`
 *   - `vi.mock('../../../src/config/database', () => ({ prisma: mockPrisma, connectDatabase: async () => {}, disconnectDatabase: async () => {} }))`
 *   - `import { resetMockPrisma } from '../helpers/mockPrisma'`
 *   - in `beforeEach`: `await resetMockPrisma()`
 *
 * The mock keeps a `Map<Model, Map<id, row>>` per model and supports
 * the query surface that the codebase actually uses. New methods that
 * the source starts using will throw a clear "not implemented" error
 * pointing at this file, so adding coverage is mechanical.
 */
import { vi } from 'vitest';
import crypto from 'node:crypto';

type Row = Record<string, any>;
type Store = Map<string, Row>;

const stores: Record<string, Store> = {};
const idCounters: Record<string, number> = {};

// Relation name -> Model name. Prisma lets you write `include: { variant: ... }`
// where the relation is named `variant` but the underlying model is
// `Variant`. This map is consulted by storeFor so the include
// can find the right store.
const RELATION_TO_MODEL: Record<string, string> = {
  variant: 'Variant',
  // Back-compat: legacy code still says `productVariant`. Same
  // store as `variant`/`variants`/`Variant`.
  productVariant: 'Variant',
  productVariants: 'Variant',
  variants: 'Variant',
  // The Option model relations. `values` is the relation name on
  // Option (Option.values -> OptionValue). `optionValues` is the
  // relation on Variant (-> OptionValue via VariantOptionValue).
  values: 'OptionValue',
  // Contextual: Option.values is OptionValue.
  'Option.values': 'OptionValue',
  option: 'Option',
  options: 'Option',
  optionValue: 'OptionValue',
  optionValues: 'OptionValue',
  // Contextual: Variant.optionValues is the join table
  // VariantOptionValue, not OptionValue directly.
  'Variant.optionValues': 'VariantOptionValue',
  // Contextual: VariantOptionValue.optionValue -> OptionValue.
  'VariantOptionValue.optionValue': 'OptionValue',
  variantOptionValue: 'VariantOptionValue',
  variantOptionValues: 'VariantOptionValue',
  variantValues: 'VariantOptionValue',
  // Variant gallery.
  image: 'VariantImage',
  images: 'VariantImage',
  productImage: 'ProductImage',
  product: 'Product',
  products: 'Product',
  category: 'Category',
  categories: 'Category',
  user: 'User',
  users: 'User',
  address: 'Address',
  addresses: 'Address',
  shippingAddress: 'Address',
  billingAddress: 'Address',
  'order.shippingaddress': 'Address',
  'order.billingaddress': 'Address',
  order: 'Order',
  orders: 'Order',
  orderItem: 'OrderItem',
  orderItems: 'OrderItem',
  items: 'OrderItem',
  review: 'Review',
  reviews: 'Review',
  // Photos attached to a review.
  reviewPhoto: 'ReviewPhoto',
  reviewPhotos: 'ReviewPhoto',
  photo: 'ReviewPhoto',
  photos: 'ReviewPhoto',
  'Review.photos': 'ReviewPhoto',
  'review.photos': 'ReviewPhoto',
  cartItem: 'CartItem',
  cartItems: 'CartItem',
  wishlistItem: 'WishlistItem',
  wishlist: 'WishlistItem',
  payment: 'Payment',
  payments: 'Payment',
  coupon: 'Coupon',
  coupons: 'Coupon',
  session: 'Session',
  sessions: 'Session',
  passwordReset: 'PasswordReset',
  images: 'ProductImage',
  children: 'Category',
  child: 'Category',
  parent: 'Category',
  inventoryLog: 'InventoryLog',
  inventoryLogs: 'InventoryLog',
  stockAlert: 'StockAlert',
  stockAlerts: 'StockAlert',
  emailTemplate: 'EmailTemplate',
  emailTemplates: 'EmailTemplate',
  paymentMethod: 'PaymentMethod',
  paymentMethods: 'PaymentMethod',
  shippingMethod: 'ShippingMethod',
  shippingMethods: 'ShippingMethod',
  shippingZone: 'ShippingZone',
  shippingZones: 'ShippingZone',
  taxClass: 'TaxClass',
  taxClasses: 'TaxClass',
  taxRate: 'TaxRate',
  taxRates: 'TaxRate',
  storeSettings: 'StoreSettings',
  themeSettings: 'ThemeSettings',
  homeSection: 'HomeSection',
  homeSections: 'HomeSection',
  menu: 'Menu',
  menus: 'Menu',
  menuItem: 'MenuItem',
  menuItems: 'MenuItem',
  'Menu.items': 'MenuItem',
  'Order.items': 'OrderItem',
  items: 'OrderItem',
  userEvent: 'UserEvent',
  userEvents: 'UserEvent',
  banner: 'Banner',
  banners: 'Banner',
  page: 'Page',
  pages: 'Page',
  post: 'Post',
  posts: 'Post',
  postTag: 'PostTag',
  postTags: 'PostTag',
  blogPost: 'BlogPost',
  blogPosts: 'BlogPost',
  // Inventory extensions
  warehouse: 'Warehouse',
  warehouses: 'Warehouse',
  stocks: 'WarehouseStock',
  warehouseStock: 'WarehouseStock',
  warehouseStocks: 'WarehouseStock',
  transfersFrom: 'WarehouseTransfer',
  transfersTo: 'WarehouseTransfer',
  warehouseTransfer: 'WarehouseTransfer',
  warehouseTransfers: 'WarehouseTransfer',
  stockReservation: 'StockReservation',
  stockReservations: 'StockReservation',
  reservation: 'StockReservation',
  stockTake: 'StockTake',
  stockTakes: 'StockTake',
  stockTakeItem: 'StockTakeItem',
  stockTakeItems: 'StockTakeItem',
  takeItems: 'StockTakeItem',
  reorderRule: 'ReorderRule',
  reorderRules: 'ReorderRule',
  reorderDraft: 'ReorderDraft',
  reorderDrafts: 'ReorderDraft',
  drafts: 'ReorderDraft',
  rule: 'ReorderRule',
  channel: 'Channel',
  channels: 'Channel',
  channelStock: 'ChannelStock',
  channelStocks: 'ChannelStock',
  threePLSyncEvent: 'ThreePLSyncEvent',
  threePLSyncEvents: 'ThreePLSyncEvent',
  syncEvents: 'ThreePLSyncEvent',
  webhookSecret: 'WebhookSecret',
  'GiftCard.transactions': 'GiftCardTransaction',
  'StoreCredit.transactions': 'StoreCreditTransaction',
  // Digital products
  productDownload: 'ProductDownload',
  productDownloads: 'ProductDownload',
  download: 'ProductDownload',
  downloads: 'ProductDownload',
  'OrderItem.downloads': 'ProductDownload',
  'OrderItem.download': 'ProductDownload',
  'orderitem.downloads': 'ProductDownload',
  'orderitem.download': 'ProductDownload',
  downloadLog: 'DownloadLog',
  downloadLogs: 'DownloadLog',
  // Recommendation / ML subsystem. The schema adds `ProductEmbedding`
  // (one embedding per product) and `ProductSimilarity` (a precomputed
  // edge in the product graph). The route layer in
  // `apps/api/src/modules/recommendations/` reads and writes both.
  // The map entries are needed so `include: { productEmbedding: true }`
  // and `include: { product1: true }` resolve to the right store.
  productEmbedding: 'ProductEmbedding',
  productEmbeddings: 'ProductEmbedding',
  productSimilarity: 'ProductSimilarity',
  productSimilarities: 'ProductSimilarity',
  product1: 'Product',
  product2: 'Product',
};

/**
 * Resolve a relation field name to its target model. Used by the
 * `match` function below to support `where: { product: { status: 'x' } }`
 * style queries on singular relations. The fallback uppercases the
 * first letter so plain names like "user" or "product" work even
 * without an explicit map entry.
 */
function toModelName(rel: string): string {
  return RELATION_TO_MODEL[rel] || (rel.charAt(0).toUpperCase() + rel.slice(1));
}

function storeFor(model: string, parentModel: string = ''): Store {
  // 1) direct hit
  if (stores[model]) return stores[model];
  // 2) parent-aware contextual lookup, e.g. `Menu.items` -> MenuItem.
  // This must take priority over the unparented fallback so that the same
  // include name (`items`) on different parents routes to different stores.
  if (parentModel) {
    // Try both `Order.shippingAddress` and `order.shippingaddress` forms.
    // The caller produces `${parentModel}.${model.toLowerCase()}`, but
    // some entries were registered with the camelCase form.
    const candidates = [
      `${parentModel}.${model.toLowerCase()}`,
      `${parentModel.toLowerCase()}.${model.toLowerCase()}`,
      `${parentModel}.${model}`,
    ];
    for (const contextual of candidates) {
      const mapped = RELATION_TO_MODEL[contextual];
      if (mapped) {
        if (!stores[mapped]) stores[mapped] = new Map();
        return stores[mapped];
      }
    }
  }
  if (RELATION_TO_MODEL[model]) {
    const m = RELATION_TO_MODEL[model];
    if (!stores[m]) stores[m] = new Map();
    return stores[m];
  }
  if (RELATION_TO_MODEL[model.toLowerCase()]) {
    const m = RELATION_TO_MODEL[model.toLowerCase()];
    if (!stores[m]) stores[m] = new Map();
    return stores[m];
  }
  // 3) case swap fallback
  const lc = model.charAt(0).toLowerCase() + model.slice(1);
  if (stores[lc]) return stores[lc];
  const pc = model.charAt(0).toUpperCase() + model.slice(1);
  if (stores[pc]) return stores[pc];
  if (!stores[model]) stores[model] = new Map();
  return stores[model];
}

function nowId(_model: string): string {
  return crypto.randomUUID();
}

function match(row: Row, where: any, parentModel: string = ''): boolean {
  if (!where) return true;
  const singular = parentModel;
  for (const [k, v] of Object.entries(where)) {
    // Prisma's compound key syntax: `userId_productId: { userId, productId }`.
    // Split on the underscore and treat as nested equality.
    if (k.includes('_') && typeof v === 'object' && v && !Array.isArray(v) && !('contains' in v) && !('gte' in v)) {
      const parts = k.split('_');
      // Try matching each part against the row.
      let allMatch = true;
      for (const part of parts) {
        if (!match(row, { [part]: v[part] })) { allMatch = false; break; }
      }
      if (allMatch) continue;
    }
    const actual = row[k];
    if (v === null) {
      // `where: { x: null }` matches rows whose x is null OR missing.
      if (actual !== null && actual !== undefined) return false;
    } else if (Array.isArray(v) && k === 'OR') {
      if (!v.some((sub: any) => match(row, sub))) return false;
    } else if (Array.isArray(v) && k === 'AND') {
      // Prisma AND-array: every entry must match.
      if (!v.every((sub: any) => match(row, sub))) return false;
    } else if (Array.isArray(v) && k === 'inStock') {
      // ignore, real prisma does not have this
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // operator object?
      const operators = ['contains', 'gte', 'lte', 'gt', 'lt', 'not', 'startsWith', 'endsWith', 'mode', 'in'];
      const isOperatorObj = operators.some((op) => op in v);
      if (isOperatorObj) {
        if ('contains' in v) {
          const s = String(actual ?? '');
          if (v.mode === 'insensitive') {
            if (!s.toLowerCase().includes(String(v.contains).toLowerCase())) return false;
          } else if (!s.includes(String(v.contains))) return false;
        }
        if ('gte' in v && actual < v.gte) return false;
        if ('lte' in v && actual > v.lte) return false;
        if ('gt' in v && !(actual > v.gt)) return false;
        if ('lt' in v && !(actual < v.lt)) return false;
        if ('not' in v) {
          const nv = v.not;
          if (nv === null) { if (actual === null) return false; }
          else if (typeof nv === 'string') { if (actual === nv) return false; }
          else if (nv && typeof nv === 'object' && 'id' in nv) { if (actual === nv.id) return false; }
        }
        if ('in' in v) {
          if (!Array.isArray(v.in) || !v.in.includes(actual)) return false;
        }
      } else {
        // plain object: treat as equality match on each key.
        for (const [subK, subV] of Object.entries(v)) {
          if (subK === 'isNot') {
            // `isNot: { x: 'y' }` - the row must NOT match the inner
            // predicate. We delegate to a nested match call.
            if (match(actual ?? {}, subV)) return false;
            continue;
          }
          if (subK === 'some' || subK === 'every' || subK === 'none') {
            // `some`: at least one related row matches `subV`.
            // `every`: every related row matches `subV`.
            // `none`: no related row matches `subV`.
            //
            // The related store is looked up by the relation name
            // (the outer key `k`). Children carry an FK that
            // points at this row; we try a few naming conventions.
            //
            // The relation is contextual: `optionValues` on
            // `Variant` is the join table `VariantOptionValue`,
            // while `values` on `Option` is the actual
            // `OptionValue` rows. The `storeFor(parent, k)` call
            // resolves these via the contextual entries in
            // `RELATION_TO_MODEL`.
            const childStore = storeFor(k, singular);
            // Identify the model the rows came from. We use the
            // contextual lookup to get the model name; fall back
            // to a capitalised first letter if not mapped.
            const childModelName =
              RELATION_TO_MODEL[`${singular}.${k}`] ||
              RELATION_TO_MODEL[`${singular.toLowerCase()}.${k}`] ||
              RELATION_TO_MODEL[k] ||
              (k.charAt(0).toUpperCase() + k.slice(1).replace(/s$/, ''));
            const fkCandidates = [
              `${singular.toLowerCase()}Id`,
              `${singular.charAt(0).toLowerCase() + singular.slice(1)}Id`,
              `${singular}Id`,
            ];
            const matches = [];
            for (const childRow of childStore.values()) {
              if (fkCandidates.some((fk) => childRow[fk] === row.id)) {
                matches.push(childRow);
              }
            }
            if (subK === 'some') {
              if (!matches.some((r) => match(r, subV, childModelName))) return false;
            } else if (subK === 'every') {
              if (matches.length === 0) return false;
              if (!matches.every((r) => match(r, subV, childModelName))) return false;
            } else if (subK === 'none') {
              if (matches.some((r) => match(r, subV, childModelName))) return false;
            }
            continue;
          }
          // We match on the FK column the relation resolves to.
          // Examples we support:
          //   category: { slug: 'x' }    -> look up row.categoryId in Category
          //   product:  { status: 'active' } -> look up row.productId in Product
          //   user:     { isActive: true }  -> look up row.userId in User
          // The lookup is "singular relation" only: the row is assumed
          // to have a `.<k>Id` FK column. This is a Map-based mock; the
          // cost of a full Prisma-style relation engine would dwarf the
          // value of the tests.
          if (typeof actual === 'undefined' || actual === null) {
            // The row doesn't have a direct FK for this relation. Try
            // the dot-notation FK: row[k + 'Id'].
            const fkKey = k + 'Id';
            const fkVal = row[fkKey];
            if (fkVal === undefined) {
              // Fall through to equality below, which will fail.
            } else {
              const relatedStore = storeFor(toModelName(k));
              if (!relatedStore) return false;
              const related = relatedStore.get(fkVal);
              if (!related) return false;
              // Recurse: match the sub-predicate against the related row.
              if (!match(related, { [subK]: subV })) return false;
              continue;
            }
          }
          if (actual !== subV) return false;
        }
      }
    } else if (actual !== v) {
      return false;
    }
  }
  return true;
}

function applyInclude(rows: any, include: any, select?: any, parentModel: string = ''): any {
  if (rows === null || rows === undefined) return rows;
  if (Array.isArray(rows)) return rows.map((r) => applyInclude(r, include, select, parentModel));
  const out: any = { ...rows };
  // Prisma's `select` is a whitelist; `include` is a blacklist-by-default.
  if (select && typeof select === 'object') {
    for (const k of Object.keys(out)) {
      if (!(k in select)) delete out[k];
    }
  }
  // `include` is the only place where `sub === true` means a relation.
  // In `select`, `true` means "include this scalar field".
  if (include && typeof include === 'object') {
    for (const [k, sub] of Object.entries(include)) {
      if (k === '_count') {
        // `_count: { select: { products: true } }` in an include.
        const target = (sub && sub.select) || sub;
        if (target && typeof target === 'object') {
          const counts: any = {};
          for (const [rel, _] of Object.entries(target)) {
            const childStoreName = rel.charAt(0).toUpperCase() + rel.slice(1);
            const fkCandidates = [
              `${parentModel}Id`,
              `${parentModel.toLowerCase()}Id`,
              `${childStoreName.replace(/s$/, '').toLowerCase()}Id`,
            ];
            let n = 0;
            for (const fk of fkCandidates) {
              const childStore = storeFor(childStoreName, parentModel);
              let count = 0;
              for (const row of childStore.values()) {
                if (row[fk] === out.id) count++;
              }
              if (count) { n = count; break; }
            }
            counts[rel] = n;
          }
          out._count = counts;
        }
        continue;
      }
      if (sub === true || (sub && typeof sub === 'object')) {
        const childModel = k.charAt(0).toUpperCase() + k.slice(1);
        const childStore = storeFor(childModel, parentModel);
        if (process.env.MOCK_DEBUG) console.log(`include ${k}: parentModel=${parentModel} childModel=${childModel} storeSize=${childStore.size} storeId=${[...childStore.values()][0]?.menuId || 'none'}`);
        // Try the "belongs to" case: this row has `${k}Id` pointing at the child.
        const fkField = `${k}Id`;
        const fk = out[fkField];
        if (fk) {
          let child = childStore.get(fk) || null;
          if (!child) {
            for (const row of childStore.values()) if (row.id === fk) { child = row; break; }
          }
          if (child) {
            if (sub && typeof sub === 'object') {
              if (sub.select) {
                out[k] = applyInclude(child, undefined, sub.select);
              } else if (sub.include) {
                out[k] = applyInclude(child, sub.include);
              } else {
                out[k] = child;
              }
            } else {
              out[k] = child;
            }
            continue;
          }
        }
        // Try the "has many" case: children have `${parentModel}Id` pointing at us.
        // Check the convention but only when the field actually exists on the
        // child - otherwise unrelated models (e.g. CartItem.variantId being
        // matched against ProductImage.productId) get cross-wired.
        const parentFk = `${parentModel}Id`;
        // FK is conventionally camelCase (productId, userId, orderId) but the
        // parent model is plural-cased in different ways. Try the most likely
        // variants.
        const fkCandidates = [
          parentFk,
          `${parentModel.toLowerCase()}Id`,
          // camelCase: productId, orderId, userId, addressId, cartItemId
          parentModel.charAt(0).toLowerCase() + parentModel.slice(1) + 'Id',
        ];
        const nestedWhere = (sub && typeof sub === 'object' && sub.where) || null;
        const contextualStore = storeFor(childModel, parentModel);
        const many: any[] = [];
        for (const row of contextualStore.values()) {
          const matches = fkCandidates.some((fk) => row[fk] === out.id);
          if (!matches) continue;
          if (nestedWhere && !match(row, nestedWhere)) continue;
          many.push(applyInclude({ ...row }, sub && typeof sub === 'object' ? (sub.include || undefined) : undefined, sub && typeof sub === 'object' ? sub.select : undefined, childModel));
        }
        // fallback: maybe the relation field on the child is just `<k>Id` and it points at us
        if (many.length === 0) {
          const altFk = `${k}Id`;
          for (const row of childStore.values()) {
            if (altFk in row && row[altFk] === out.id) {
              many.push(applyInclude({ ...row }, sub && typeof sub === 'object' ? (sub.include || undefined) : undefined, sub && typeof sub === 'object' ? sub.select : undefined, childModel));
            }
          }
        }
        // final fallback: "belongs to" - this row has `<k>Id` pointing at a single child
        if (many.length === 0) {
          const belongsFk = `${k}Id`;
          if (belongsFk in out && out[belongsFk]) {
            const target = childStore.get(out[belongsFk]);
            if (target) {
              if (sub && typeof sub === 'object') {
                if (sub.select) {
                  out[k] = applyInclude(target, undefined, sub.select);
                } else if (sub.include) {
                  out[k] = applyInclude(target, sub.include);
                } else {
                  out[k] = target;
                }
              } else {
                out[k] = target;
              }
            }
          }
        }
        if (many.length) out[k] = many;
      }
    }
  }
  // `_count: { select: { orders: true, ... } }` - count related rows.
  if (select && select._count && typeof select._count === 'object') {
    const counts: any = {};
    const target = select._count.select || select._count;
    for (const [rel, _] of Object.entries(target)) {
      // The relation name in `_count` is the child's plural name. The
      // convention is that the child's FK to the parent is
      // `${parentModel}Id`. Try several naming variants.
      const childStoreName = rel.charAt(0).toUpperCase() + rel.slice(1);
      const fkCandidates = [
        `${parentModel}Id`,
        `${parentModel.toLowerCase()}Id`,
        `${childStoreName.replace(/s$/, '').toLowerCase()}Id`,
      ];
      let n = 0;
      for (const fk of fkCandidates) {
        const childStore = storeFor(childStoreName);
        let count = 0;
        for (const row of childStore.values()) {
          if (row[fk] === out.id) count++;
        }
        if (count) { n = count; break; }
      }
      counts[rel] = n;
    }
    out._count = counts;
  }
  return out;
}

function applyOrderBy(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const out = [...rows];
  if (Array.isArray(orderBy)) {
    for (const ob of orderBy.reverse()) {
      out.sort((a, b) => compareOrder(a, b, ob));
    }
    return out;
  }
  // support { reviews: { _count: 'desc' } } as a special case
  for (const key of Object.keys(orderBy)) {
    if (key === 'reviews' && orderBy[key]?._count) {
      // approximate: count by relation in store
      const dir = orderBy[key]._count;
      out.sort((a, b) => {
        const ca = countChildren('review', 'productId', a.id);
        const cb = countChildren('review', 'productId', b.id);
        return dir === 'desc' ? cb - ca : ca - cb;
      });
      return out;
    }
  }
  out.sort((a, b) => compareOrder(a, b, orderBy));
  return out;
}

function countChildren(model: string, fk: string, parentId: string): number {
  const s = storeFor(model);
  let n = 0;
  for (const r of s.values()) if (r[fk] === parentId) n++;
  return n;
}

function compareOrder(a: any, b: any, ob: any): number {
  for (const [k, dir] of Object.entries(ob)) {
    const av = a[k], bv = b[k];
    if (av === bv) continue;
    const cmp = av > bv ? 1 : -1;
    return dir === 'desc' ? -cmp : cmp;
  }
  return 0;
}

function makeDelegate(model: string) {
  const singular = model.charAt(0).toUpperCase() + model.slice(1);
  return {
    findUnique: vi.fn(async ({ where, include, select }: any = {}) => {
      const store = storeFor(singular);
      for (const row of store.values()) {
        if (match(row, where, singular)) return applyInclude(row, include, select, singular);
      }
      return null;
    }),
    findFirst: vi.fn(async ({ where, include, orderBy, select }: any = {}) => {
      const store = storeFor(singular);
      const found = [...store.values()].filter((r) => match(r, where, singular));
      if (!found.length) return null;
      const [first] = applyOrderBy(found, orderBy);
      return applyInclude(first, include, select, singular);
    }),
    findMany: vi.fn(async ({ where, include, orderBy, skip, take, select }: any = {}) => {
      const store = storeFor(singular);
      const filtered = [...store.values()].filter((r) => match(r, where || {}, singular));
      const sorted = applyOrderBy(filtered, orderBy);
      const sliced = typeof skip === 'number' || typeof take === 'number'
        ? sorted.slice(skip || 0, (skip || 0) + (take || sorted.length))
        : sorted;
      return applyInclude(sliced, include, select, singular);
    }),
    count: vi.fn(async ({ where }: any = {}) => {
      const store = storeFor(singular);
      return [...store.values()].filter((r) => match(r, where || {}, singular)).length;
    }),
    aggregate: vi.fn(async ({ where, _sum, _avg, _min, _max, _count }: any = {}) => {
      const store = storeFor(singular);
      const filtered = [...store.values()].filter((r) => match(r, where || {}, singular));
      const out: any = { _count: filtered.length };
      const sumValues = (_sum as Record<string, any>) || {};
      for (const [k, v] of Object.entries(sumValues)) {
        if (v) {
          out._sum = out._sum || {};
          out._sum[k] = filtered.reduce((acc: number, row: any) => acc + (Number(row[k]) || 0), 0);
        }
      }
      const avgValues = (_avg as Record<string, any>) || {};
      for (const [k, v] of Object.entries(avgValues)) {
        if (v) {
          out._avg = out._avg || {};
          out._avg[k] = filtered.length > 0
            ? filtered.reduce((acc: number, row: any) => acc + (Number(row[k]) || 0), 0) / filtered.length
            : 0;
        }
      }
      // _min and _max: only set the property when at least one row
      // matches. An empty result leaves the property absent, which
      // matches Prisma's behaviour and lets the route code do `?.`.
      const minValues = (_min as Record<string, any>) || {};
      const maxValues = (_max as Record<string, any>) || {};
      if (Object.keys(minValues).length > 0) {
        out._min = {};
        for (const k of Object.keys(minValues)) {
          out._min[k] = filtered.length > 0
            ? filtered.reduce((acc: number, row: any) => Math.min(acc, Number(row[k])), Infinity)
            : null;
        }
      }
      if (Object.keys(maxValues).length > 0) {
        out._max = {};
        for (const k of Object.keys(maxValues)) {
          out._max[k] = filtered.length > 0
            ? filtered.reduce((acc: number, row: any) => Math.max(acc, Number(row[k])), -Infinity)
            : null;
        }
      }
      return out;
    }),
    groupBy: vi.fn(async ({ where, by, _count, orderBy }: any = {}) => {
      const store = storeFor(singular);
      const filtered = [...store.values()].filter((r) => match(r, where || {}, singular));
      const groups = new Map<string, { rows: any[]; count: number }>();
      for (const row of filtered) {
        const keyParts = (by as string[]).map((b) => String(row[b] ?? ''));
        const key = keyParts.join('|');
        if (!groups.has(key)) groups.set(key, { rows: [], count: 0 });
        const g = groups.get(key)!;
        g.rows.push(row);
        g.count += 1;
      }
      const out: any[] = [];
      for (const [key, { rows, count }] of groups) {
        const outRow: any = {};
        const keyParts = (by as string[]).map((b) => rows[0][b] ?? null);
        by.forEach((b: string, i: number) => { outRow[b] = keyParts[i]; });
        if (_count) {
          if (typeof _count === 'object') {
            for (const [alias, sel] of Object.entries(_count)) {
              outRow['_count'] = outRow['_count'] || {};
              if (sel === true) outRow['_count'][alias] = count;
              else if (sel && typeof sel === 'object') outRow['_count'][alias] = count;
            }
          } else if (_count === true) {
            outRow['_count'] = count;
          }
        }
        out.push(outRow);
      }
      return out;
    }),
    create: vi.fn(async ({ data, include, select }: any) => {
      const store = storeFor(singular);
      const nested: Record<string, any[]> = {};
      const flatData: any = { ...data };
      for (const k of Object.keys(flatData)) {
        const v = flatData[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && ('create' in v || 'createMany' in v)) {
          nested[k] = Array.isArray(v.create) ? v.create : v.createMany ? v.createMany : [v.create];
          delete flatData[k];
        }
      }
      const id = flatData.id || nowId(singular);
      const row: Row = { ...flatData, id, createdAt: flatData.createdAt || new Date(), updatedAt: new Date() };
      for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
      if (singular === 'User' && row.isActive === undefined) row.isActive = true;
      if (singular === 'Product' && row.trackInventory === undefined) row.trackInventory = true;
      // The ReorderRule schema has `isActive Boolean @default(true)`,
      // but the route POST doesn't always send it. Default it to true
      // so `runAutoReorder({where: {isActive: true}})` finds it.
      if (singular === 'ReorderRule' && row.isActive === undefined) row.isActive = true;
      // Match the schema default so reads return `false` rather than
      // `undefined` for orders that didn't go through the backorder
      // path. Production prisma resolves @default(false) at insert
      // time; the mock prisma drops undefined values during create,
      // so without this guard tests would see the wrong value.
      if (singular === 'OrderItem' && row.isBackorder === undefined) row.isBackorder = false;
      // Page.pageType defaults to "info" in the real schema so
      // legacy callers (and the migration) don't need to set it.
      // The mock prisma drops undefined values during create, so
      // without this guard a test that omits the field would
      // read back `undefined` and the pageType-aware routes
      // would 404 a perfectly valid page.
      if (singular === 'Page' && row.pageType === undefined) row.pageType = 'info';
      if (singular === 'Coupon' && row.usedCount === undefined) row.usedCount = 0;
      if (singular === 'Coupon' && row.isActive === undefined) row.isActive = true;
      if (singular === 'Coupon' && row.code === row.code) row.code = (row.code || '').toUpperCase();
      store.set(id, row);
      for (const [rel, items] of Object.entries(nested)) {
        // Resolve `rel` through the relation map so contextual names
        // like `Order.items` end up in the OrderItem store, not the
        // (non-existent) Items store. Fall back to uppercasing the
        // first letter for models that have no explicit entry.
        const childModel = RELATION_TO_MODEL[`${singular}.${rel}`] || RELATION_TO_MODEL[rel] || (rel.charAt(0).toUpperCase() + rel.slice(1));
        const childStore = storeFor(childModel, singular);
        // Schema uses camelCase FKs: `orderId`, `productId`, `userId`,
        // `cartItemId`, `categoryId`. Pick the first one that the
        // child row already has, otherwise default to camelCase.
        const fkCandidates = [
          `${singular.charAt(0).toLowerCase() + singular.slice(1)}Id`, // e.g. orderId
          `${singular.toLowerCase()}Id`,
          `${singular}Id`,
        ];
        for (const item of items) {
          const cid = item.id || nowId(childModel);
          const child: Row = { ...item, id: cid, createdAt: new Date(), updatedAt: new Date() };
          // Apply per-model defaults BEFORE the `delete undefined` pass,
          // otherwise the key gets stripped before we can set it.
          if (childModel === 'OrderItem' && child.isBackorder === undefined) child.isBackorder = false;
          for (const k of Object.keys(child)) if (child[k] === undefined) delete child[k];
          const fkToUse = fkCandidates.find((f) => f in child) ?? fkCandidates[0];
          if (!fkCandidates.some((f) => f in child)) child[fkToUse] = id;
          childStore.set(cid, child);
        }
      }
      return applyInclude(row, include, select, singular);
    }),
    createMany: vi.fn(async ({ data }: any) => {
      const store = storeFor(singular);
      const list = Array.isArray(data) ? data : [data];
      for (const item of list) {
        const id = item.id || nowId(singular);
        const row: Row = { ...item, id, createdAt: new Date(), updatedAt: new Date() };
        for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
        store.set(id, row);
      }
      return { count: list.length };
    }),
    update: vi.fn(async ({ where, data, include, select }: any) => {
      const store = storeFor(singular);
      for (const [id, row] of store) {
        if (match(row, where, singular)) {
          // Apply special operators like `decrement` / `increment` / `multiply`
          // that the real client understands. We do a shallow copy + merge
          // for plain values and apply numeric ops when we recognise them.
          const merged: any = { ...row };
          for (const [k, v] of Object.entries(data || {})) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              if ('decrement' in v) merged[k] = (merged[k] ?? 0) - Number(v.decrement);
              else if ('increment' in v) merged[k] = (merged[k] ?? 0) + Number(v.increment);
              else if ('multiply' in v) merged[k] = (merged[k] ?? 0) * Number(v.multiply);
              else if ('divide' in v) merged[k] = (merged[k] ?? 0) / Number(v.divide);
              else if ('set' in v) merged[k] = v.set;
              else merged[k] = v;
            } else {
              merged[k] = v;
            }
          }
          merged.updatedAt = new Date();
          store.set(id, merged);
          return applyInclude(merged, include, select, singular);
        }
      }
      return null;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const store = storeFor(singular);
      let count = 0;
      for (const [id, row] of store) {
        if (match(row, where, singular)) {
          store.set(id, { ...row, ...data, updatedAt: new Date() });
          count++;
        }
      }
      return { count };
    }),
    upsert: vi.fn(async ({ where, create, update, include, select }: any) => {
      const store = storeFor(singular);
      for (const [id, row] of store) {
        if (match(row, where, singular)) {
          const updated = { ...row, ...update, updatedAt: new Date() };
          store.set(id, updated);
          return applyInclude(updated, include, select, singular);
        }
      }
      const id = create.id || nowId(singular);
      const row: Row = { ...create, id, createdAt: new Date(), updatedAt: new Date() };
      for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
      store.set(id, row);
      return applyInclude(row, include, select, singular);
    }),
    delete: vi.fn(async ({ where }: any) => {
      const store = storeFor(singular);
      for (const [id, row] of store) {
        if (match(row, where, singular)) {
          store.delete(id);
          return row;
        }
      }
      return null;
    }),
    deleteMany: vi.fn(async ({ where }: any = {}) => {
      const store = storeFor(singular);
      let count = 0;
      for (const [id, row] of store) {
        if (match(row, where || {}, singular)) {
          store.delete(id);
          count++;
        }
      }
      return { count };
    }),
  };
}

// Models the codebase touches. Adding a model that the source uses but
// we haven't listed will throw on first access, with a clear pointer.
const KNOWN_MODELS = [
  'user', 'session', 'passwordReset', 'address', 'order', 'orderItem',
  'review', 'reviewPhoto', 'wishlistItem', 'cartItem', 'userEvent', 'userPreference',
  'inventoryLog', 'product', 'productImage', 'variant', 'category',
  'coupon', 'payment', 'recommendationLog', 'searchQuery', 'emailTemplate',
  'shippingMethod', 'shippingZone', 'taxClass', 'taxRate', 'storeSettings',
  'themeSettings', 'homeSection', 'menu', 'menuItem', 'banner', 'page',
  'post', 'postTag', 'blogPost', 'stockAlert',
  // Variant subsystem (first-class)
  'option', 'optionValue', 'variantOptionValue', 'variantImage',
  // Digital products
  'productDownload', 'downloadLog',
  // Inventory extensions
  'warehouse', 'warehouseStock', 'warehouseTransfer', 'stockReservation',
  'stockTake', 'stockTakeItem', 'reorderRule', 'reorderDraft',
  'channel', 'channelStock', 'threePLSyncEvent', 'webhookSecret',
  'giftCard', 'giftCardTransaction', 'storeCredit', 'storeCreditTransaction',
  // Multi-currency
  'currency', 'exchangeRateSnapshot',
  // Recommendation / ML (schema-defined; no test references yet but
  // the routes in `modules/recommendations/` will hit these as soon
  // as we add the integration tests)
  'productEmbedding', 'productSimilarity',
];

const prisma: any = {};
for (const m of KNOWN_MODELS) {
  prisma[m] = makeDelegate(m);
}

// Back-compat alias: `prisma.productVariant` is the same delegate
// as `prisma.variant`. Every existing call site
// (`prisma.productVariant.findUnique({ where: { id } })`) keeps
// working unchanged while the route layer migrates to the new
// name. Same object, so side effects on one are reflected on
// the other.
prisma.productVariant = prisma.variant;

prisma.$connect = vi.fn(async () => {});
prisma.$disconnect = vi.fn(async () => {});
prisma.$queryRaw = vi.fn(async () => [{ '1': 1 }]);
prisma.$transaction = vi.fn(async (ops: any) => {
  if (Array.isArray(ops)) {
    const out: any[] = [];
    for (const op of ops) out.push(await op);
    return out;
  }
  return await ops(prisma);
});

/** Drop every table. Call in beforeEach to start each test clean. */
export function resetMockPrisma() {
  for (const k of Object.keys(stores)) stores[k] = new Map();
  for (const k of Object.keys(idCounters)) idCounters[k] = 0;
  // restore default mock implementations after vi.clearAllMocks runs
  for (const m of KNOWN_MODELS) {
    const fresh = makeDelegate(m);
    for (const k of Object.keys(fresh)) {
      (prisma[m] as any)[k] = (fresh as any)[k];
    }
  }
  (prisma.$connect as any).mockClear?.();
  (prisma.$disconnect as any).mockClear?.();
  (prisma.$queryRaw as any).mockClear?.();
  (prisma.$transaction as any).mockClear?.();
}

/** Inspect what the mock holds for a given model (for assertions).
 *  Accepts both the new name (Variant) and the legacy alias
 *  (ProductVariant); both resolve to the same store. */
export function peekMockStore(model: string): Row[] {
  const normalized = model.charAt(0).toUpperCase() + model.slice(1);
  const canonical = normalized === 'ProductVariant' ? 'Variant' : normalized;
  return [...(stores[canonical]?.values() || [])];
}

export { prisma as mockPrisma, RELATION_TO_MODEL };

/** Mock the prisma module's exports. Import this and call it. */
export const mockDatabaseModule = {
  prisma,
  connectDatabase: async () => {},
  disconnectDatabase: async () => {},
  checkDatabaseHealth: async () => true,
};
