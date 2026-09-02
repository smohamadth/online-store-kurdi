// ---------------------------------------------------------------------------
// Payment gateway registry.
//
// GATEWAYS is the single ordered source of truth for the payment methods the
// store can offer. It drives:
//   - the admin Payments page (fields, labels, country, hints),
//   - the checkout listing (enabled gateways, via gatewayConfig.ts),
//   - the order-placement dispatch (createPayment/verifyPayment).
//
// Stripe's `id` is 'stripe'; the checkout/order code also accepts the legacy
// method id 'card' as an alias so existing orders and tests keep working.
// ---------------------------------------------------------------------------
import type { GatewayDefinition } from './types';
import { zarinpal } from './zarinpal';
import { idpay } from './idpay';
import { zaincash } from './zaincash';
import { fib } from './fib';
import { paypal } from './paypal';
import { stripe } from './stripe';

/** All gateway definitions, in display order. */
export const GATEWAYS: GatewayDefinition[] = [
  zarinpal,
  idpay,
  zaincash,
  fib,
  paypal,
  stripe,
];

export const GATEWAY_BY_ID: Record<string, GatewayDefinition> = Object.fromEntries(
  GATEWAYS.map((g) => [g.id, g]),
);

/** Legacy method id aliases -> canonical gateway id (e.g. 'card' -> 'stripe'). */
export const GATEWAY_ID_ALIASES: Record<string, string> = {
  card: 'stripe',
  credit_card: 'stripe',
};

/** Resolve a paymentMethod string to a canonical gateway id, or null. */
export function resolveGatewayId(paymentMethod: string | undefined | null): string | null {
  if (!paymentMethod) return null;
  if (GATEWAY_BY_ID[paymentMethod]) return paymentMethod;
  return GATEWAY_ID_ALIASES[paymentMethod] ?? null;
}

export function getGatewayById(id: string | undefined | null): GatewayDefinition | null {
  const resolved = resolveGatewayId(id);
  return resolved ? GATEWAY_BY_ID[resolved] : null;
}

/** Whether a paymentMethod string is one of the gateway-backed methods. */
export function isGatewayMethod(paymentMethod: string | undefined | null): boolean {
  return resolveGatewayId(paymentMethod) !== null;
}
