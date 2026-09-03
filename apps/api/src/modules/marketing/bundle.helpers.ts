/**
 * Bundle pricing.
 *
 * The recommendation data ("frequently bought together") already existed but
 * was not monetisable: there was no bundle entity and no bundle price.
 *
 * Pure, because pricing errors are the expensive kind - a rounding slip or an
 * unclamped percentage sells stock below cost.
 */

export type BundleLine = { price: number; quantity: number };

export type BundlePricing = {
  /** Sum of the individual items at list price. */
  itemsTotal: number;
  /** What the customer pays for the set. */
  bundlePrice: number;
  /** itemsTotal - bundlePrice. */
  savings: number;
  /** Savings as a share of itemsTotal, 0..1. */
  savingsPercent: number;
};

/** Round to cents. Float arithmetic on money otherwise leaks 0.005 errors. */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function sumItems(lines: BundleLine[]): number {
  return round2(
    (lines || []).reduce(
      (sum, l) => sum + (Number(l.price) || 0) * Math.max(0, Math.floor(Number(l.quantity) || 0)),
      0,
    ),
  );
}

/**
 * Price a bundle.
 *
 * - 'percentage': discountValue is a percent off the summed list price,
 *   clamped to 0..100 so a bad admin entry cannot produce a negative price
 *   (i.e. paying the customer to take the goods).
 * - 'fixed': discountValue IS the total price of the set, clamped to
 *   [0, itemsTotal] so a bundle can never cost MORE than buying the items
 *   separately - which would be a worse deal presented as a saving.
 */
export function priceBundle(
  lines: BundleLine[],
  discountType: string,
  discountValue: number,
): BundlePricing {
  const itemsTotal = sumItems(lines);
  const value = Number(discountValue) || 0;

  let bundlePrice: number;
  if (discountType === 'fixed') {
    bundlePrice = round2(Math.min(Math.max(value, 0), itemsTotal));
  } else {
    const pct = Math.min(Math.max(value, 0), 100);
    bundlePrice = round2(itemsTotal * (1 - pct / 100));
  }

  const savings = round2(itemsTotal - bundlePrice);
  return {
    itemsTotal,
    bundlePrice,
    savings,
    savingsPercent: itemsTotal > 0 ? Number((savings / itemsTotal).toFixed(4)) : 0,
  };
}

/**
 * A bundle is purchasable only if every component is in stock for the
 * quantity the bundle requires. Partial availability must block the whole
 * set - otherwise checkout accepts an order it cannot fulfil.
 */
export function bundleAvailable(
  items: Array<{ quantity: number; product?: { quantity?: number; status?: string } | null }>,
): boolean {
  if (!items || items.length === 0) return false;
  return items.every((i) => {
    const p = i.product;
    if (!p) return false;
    if (p.status && p.status !== 'active') return false;
    return Number(p.quantity ?? 0) >= Number(i.quantity ?? 0);
  });
}
