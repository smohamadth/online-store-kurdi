// ---------------------------------------------------------------------------
// Shipping calculation (shared).
//
// Single implementation of the zone/method matching + rate math, used by
// BOTH the public POST /api/shipping/calculate endpoint (advisory, drives the
// checkout display) and order placement (authoritative — order.routes.ts
// recomputes the rate for the chosen shippingMethodId server-side instead of
// trusting the client's shippingAmount).
// ---------------------------------------------------------------------------
import { prisma } from '../../config/database';

export interface ShippingRate {
  id: string;
  name: string;
  description: string | null;
  type: string;
  rate: number;
  isFree: boolean;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  zone: { id: string; name: string };
}

/**
 * Compute the shipping methods available for an order/address, exactly as
 * the checkout's advisory endpoint does. Returns methods sorted by rate
 * (cheapest first) — same order the checkout lists them in.
 */
export async function calculateShippingForOrder(params: {
  country: string;
  state?: string;
  zipCode?: string;
  subtotal: number;
  weight?: number;
  itemCount?: number;
}): Promise<ShippingRate[]> {
  const { country, state, zipCode, subtotal } = params;
  const weight = Number(params.weight || 0);
  const itemCount = Number(params.itemCount || 0);

  const zones = await prisma.shippingZone.findMany({
    where: { isActive: true },
    include: {
      methods: { where: { isActive: true } },
    },
  });

  const matchingMethods: ShippingRate[] = [];

  for (const zone of zones) {
    const countries = JSON.parse((zone.countries as string) || '[]');
    const states = JSON.parse((zone.states as string) || '[]');
    const zipCodes = JSON.parse((zone.zipCodes as string) || '[]');

    const countryMatch = countries.includes(country) || countries.includes('*');
    const stateMatch = states.length === 0 || states.includes(state) || states.includes('*');
    const zipMatch = zipCodes.length === 0 || zipCodes.some((z: string) => zipCode?.startsWith(z));

    if (!(countryMatch && stateMatch && zipMatch)) continue;

    for (const method of zone.methods) {
      // Availability gates apply to every method type, not just `price`:
      // a weight method with min/maxWeight is only offered when the cart's
      // total weight is inside that band, and any method with
      // min/maxOrderAmount is only offered when the subtotal fits.
      const sub = Number(subtotal || 0);
      if (method.minOrderAmount != null && sub < Number(method.minOrderAmount)) continue;
      if (method.maxOrderAmount != null && sub > Number(method.maxOrderAmount)) continue;
      if (method.minWeight != null && weight < Number(method.minWeight)) continue;
      if (method.maxWeight != null && weight > Number(method.maxWeight)) continue;

      let rate = Number(method.baseRate);
      let isFree = false;

      switch (method.type) {
        case 'flat':
          break;
        case 'weight':
          if (method.weightUnitRate && weight > 0) {
            rate = Number(method.baseRate) + weight * Number(method.weightUnitRate);
          }
          break;
        case 'price':
          if (method.pricePercentage && sub > 0) {
            rate = (sub * Number(method.pricePercentage)) / 100;
          }
          break;
        case 'item_count':
          if (method.itemCountRate && itemCount > 0) {
            rate = Number(method.baseRate) + itemCount * Number(method.itemCountRate);
          }
          break;
      }

      // Free-shipping threshold: at/above it, the method costs nothing.
      if (method.freeShippingThreshold != null && sub >= Number(method.freeShippingThreshold)) {
        rate = 0;
        isFree = true;
      }

      matchingMethods.push({
        id: method.id,
        name: method.name,
        description: method.description,
        type: method.type,
        rate: Math.round(rate * 100) / 100,
        isFree,
        minDeliveryDays: method.minDeliveryDays,
        maxDeliveryDays: method.maxDeliveryDays,
        zone: { id: zone.id, name: zone.name },
      });
    }
  }

  matchingMethods.sort((a, b) => a.rate - b.rate);
  return matchingMethods;
}
