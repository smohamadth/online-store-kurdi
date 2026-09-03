/**
 * Match bundles against the lines of an order and total their discount.
 *
 * The storefront advertises a bundle saving and adds the components to the
 * cart at LIST price, on the understanding that checkout applies the
 * discount. Nothing did, so the customer saw "Save $25" and was charged the
 * undiscounted total - a price promise the store did not honour.
 *
 * Pure, because this is money: every branch here is worth exhausting in a
 * unit test, and none of it needs a database.
 */
import { priceBundle, round2 } from './bundle.helpers';

export type OrderLine = {
  productId: string;
  quantity: number;
  /** Unit price actually being charged for this line. */
  unitPrice: number;
};

export type MatchableBundle = {
  id: string;
  slug: string;
  discountType: string;
  discountValue: number;
  items: Array<{ productId: string; quantity: number }>;
};

export type BundleMatch = {
  bundleId: string;
  slug: string;
  /** How many complete sets the order contains. */
  sets: number;
  /** Total discount for this bundle across all its sets. */
  discount: number;
};

export type BundleDiscountResult = {
  matches: BundleMatch[];
  totalDiscount: number;
};

/**
 * How many complete copies of `bundle` the order contains.
 *
 * A bundle only discounts when EVERY component is present in at least the
 * required quantity: otherwise a shopper could buy the cheap half of a set at
 * bundle pricing. Two of everything is two sets, so the saving doubles.
 */
export function countCompleteSets(
  bundle: MatchableBundle,
  lines: OrderLine[],
): number {
  if (!bundle.items || bundle.items.length === 0) return 0;

  const have = new Map<string, number>();
  for (const l of lines) {
    have.set(l.productId, (have.get(l.productId) ?? 0) + Math.max(0, Number(l.quantity) || 0));
  }

  let sets = Infinity;
  for (const item of bundle.items) {
    const required = Math.max(0, Math.floor(Number(item.quantity) || 0));
    // A component requiring zero units is a malformed bundle; treat it as
    // unsatisfiable rather than dividing by zero into Infinity sets.
    if (required <= 0) return 0;
    const owned = have.get(item.productId) ?? 0;
    sets = Math.min(sets, Math.floor(owned / required));
    if (sets === 0) return 0;
  }

  return Number.isFinite(sets) ? sets : 0;
}

/**
 * Total discount for one bundle given the order's lines.
 *
 * Prices each set from the UNIT PRICES ON THE ORDER, not from the product
 * table: if a line is already discounted for another reason, the bundle
 * percentage must apply to what the customer is actually paying, or the two
 * discounts compound into more than either intended.
 */
export function bundleDiscountFor(
  bundle: MatchableBundle,
  lines: OrderLine[],
): BundleMatch | null {
  const sets = countCompleteSets(bundle, lines);
  if (sets <= 0) return null;

  const priceOf = new Map<string, number>();
  for (const l of lines) {
    if (!priceOf.has(l.productId)) priceOf.set(l.productId, Number(l.unitPrice) || 0);
  }

  const setLines = bundle.items.map((i) => ({
    price: priceOf.get(i.productId) ?? 0,
    quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)),
  }));

  const pricing = priceBundle(setLines, bundle.discountType, Number(bundle.discountValue ?? 0));
  const discount = round2(pricing.savings * sets);
  if (discount <= 0) return null;

  return { bundleId: bundle.id, slug: bundle.slug, sets, discount };
}

/**
 * Total bundle discount across every active bundle.
 *
 * Each product line is consumed by at most one bundle. Without that, two
 * overlapping bundles both claim the same items and the order is discounted
 * twice for goods bought once. Bundles are applied best-first (largest
 * discount) so the customer gets the better deal when they overlap.
 */
export function computeBundleDiscount(
  bundles: MatchableBundle[],
  lines: OrderLine[],
): BundleDiscountResult {
  // Remaining quantity available to be claimed, per product.
  const remaining = new Map<string, number>();
  for (const l of lines) {
    remaining.set(l.productId, (remaining.get(l.productId) ?? 0) + Math.max(0, Number(l.quantity) || 0));
  }

  const candidates = (bundles || [])
    .map((b) => ({ bundle: b, match: bundleDiscountFor(b, lines) }))
    .filter((c): c is { bundle: MatchableBundle; match: BundleMatch } => c.match !== null)
    // Best deal first. Ties broken by slug so the result is deterministic
    // rather than dependent on database row order.
    .sort((x, y) =>
      y.match.discount - x.match.discount || x.bundle.slug.localeCompare(y.bundle.slug));

  const matches: BundleMatch[] = [];
  for (const { bundle, match } of candidates) {
    // Re-check against what is still unclaimed, not the original lines.
    const availableLines: OrderLine[] = [...remaining.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
      unitPrice: lines.find((l) => l.productId === productId)?.unitPrice ?? 0,
    }));

    const recheck = bundleDiscountFor(bundle, availableLines);
    if (!recheck) continue;

    for (const item of bundle.items) {
      const used = item.quantity * recheck.sets;
      remaining.set(item.productId, (remaining.get(item.productId) ?? 0) - used);
    }
    matches.push(recheck);
    void match;
  }

  return {
    matches,
    totalDiscount: round2(matches.reduce((sum, m) => sum + m.discount, 0)),
  };
}
