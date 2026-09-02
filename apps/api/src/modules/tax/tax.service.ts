// ---------------------------------------------------------------------------
// Tax calculation (shared).
//
// Single implementation of the tax-matching + per-item tax-class rules, used
// by BOTH the public POST /api/tax/calculate endpoint (advisory, drives the
// checkout display) and order placement (authoritative — order.routes.ts
// recomputes the tax server-side instead of trusting the client's number).
//
// Kept as a pure function over prisma reads so the two call sites can never
// drift: whatever the customer saw in the checkout is what the order is
// charged, and a tampered taxAmount in the order body is ignored.
// ---------------------------------------------------------------------------
import { prisma } from '../../config/database';

export interface TaxLineItem {
  productId?: string;
  price: number;
  quantity: number;
  /** Product tax-class name ('standard', 'zero', 'digital', or a custom class). */
  taxClass?: string | null;
}

export interface TaxCalculation {
  taxRate: number;
  taxName: string;
  taxAmount: number;
  subtotal: number;
  totalWithTax: number;
  itemTaxes: {
    productId?: string;
    price: number;
    quantity: number;
    taxClass: string;
    taxRate: number;
    taxAmount: number;
    taxName: string;
  }[];
  location: { country: string; state?: string; city?: string; zipCode?: string };
}

/**
 * Compute the tax for an order/location exactly as the checkout's advisory
 * endpoint does (rate matching per country/state/city/zip, then per-item
 * tax-class refinement).
 */
export async function calculateTaxForOrder(params: {
  country: string;
  state?: string;
  city?: string;
  zipCode?: string;
  subtotal: number;
  items?: TaxLineItem[];
}): Promise<TaxCalculation> {
  const { country, state, city, zipCode } = params;
  // Defensive parsing, same contract as shipping: the advisory endpoint
  // accepts client JSON, and Number('abc') = NaN would poison every
  // computation below (NaN * rate = NaN). Non-finite/negative -> 0.
  const asNonNegative = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const subtotal = asNonNegative(params.subtotal);

  // All active rates for the country, highest priority first.
  const taxRates = await prisma.taxRate.findMany({
    where: { isActive: true, country },
    orderBy: { priority: 'desc' },
  });

  // Best matching rate for a location (state/city/zip specificity).
  const findTaxRate = (targetState?: string, targetCity?: string, targetZip?: string) => {
    for (const rate of taxRates) {
      if (rate.state && rate.state !== targetState) continue;
      if (rate.city && rate.city !== targetCity) continue;
      if (rate.zipCode && targetZip && !targetZip.startsWith(rate.zipCode)) continue;
      return rate;
    }
    // Fallback: a general rate for the country.
    return taxRates.find((r: any) => !r.state && !r.city && !r.zipCode) || null;
  };

  const baseTaxRate = findTaxRate(state, city, zipCode);
  const baseRate = baseTaxRate ? Number(baseTaxRate.rate) : 0;
  const baseTaxName = baseTaxRate?.name || 'Tax';

  const items = Array.isArray(params.items) ? params.items : [];
  let totalTax = 0;
  let itemTaxes: TaxCalculation['itemTaxes'] = [];

  if (items.length > 0) {
    for (const item of items) {
      let itemRate = baseRate;
      let itemTaxName = baseTaxName;

      if (item.taxClass && item.taxClass !== 'standard') {
        const classRate = taxRates.find(
          (r: any) =>
            r.taxClass === item.taxClass &&
            (!r.state || r.state === state) &&
            (!r.city || r.city === city)
        );
        if (classRate) {
          itemRate = Number(classRate.rate);
          itemTaxName = classRate.name;
        } else {
          // No specific rate: check whether the class itself is a zero-tax
          // class (digital products, reduced-rate items).
          const taxClassInfo = await prisma.taxClass.findUnique({
            where: { name: item.taxClass },
          });
          if (taxClassInfo && (taxClassInfo.name === 'zero' || taxClassInfo.name === 'digital')) {
            itemRate = 0;
            itemTaxName = `${taxClassInfo.name} tax`;
          }
        }
      }

      // A hostile item (price: 'abc', quantity: null, negative numbers)
      // must not NaN the whole calculation.
      const itemPrice = asNonNegative(item.price);
      const itemQty = asNonNegative(item.quantity);
      const itemTaxAmount = itemPrice * itemQty * itemRate;
      totalTax += itemTaxAmount;

      itemTaxes.push({
        productId: item.productId,
        price: itemPrice,
        quantity: itemQty,
        taxClass: item.taxClass || 'standard',
        taxRate: itemRate,
        taxAmount: Math.round(itemTaxAmount * 100) / 100,
        taxName: itemTaxName,
      });
    }
  } else {
    // No items provided: calculate on the subtotal alone.
    totalTax = subtotal * baseRate;
  }

  const roundedTotalTax = Math.round(totalTax * 100) / 100;

  return {
    taxRate: baseRate,
    taxName: baseTaxName,
    taxAmount: roundedTotalTax,
    subtotal: subtotal || 0,
    totalWithTax: Math.round(((subtotal || 0) + roundedTotalTax) * 100) / 100,
    itemTaxes,
    location: { country, state, city, zipCode },
  };
}
