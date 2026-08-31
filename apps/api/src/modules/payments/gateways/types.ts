// ---------------------------------------------------------------------------
// Payment gateway contracts.
//
// Every gateway (Zarinpal, IDPay, ZainCash, FIB, PayPal, Stripe) implements
// the same two async functions:
//
//   createPayment(ctx)   -> { checkoutUrl, reference }
//     Called at order placement. Creates a hosted-payment session at the
//     gateway and returns the URL to send the customer to, plus a `reference`
//     (gateway authority / transaction id / order id) that is stored on the
//     order so a later callback can be matched back to it.
//
//   verifyPayment(ctx, params) -> { success, transactionId, message }
//     Called when the customer returns from the gateway (the gateway appends
//     its own query params to the returnUrl we gave it). The gateway is asked
//     server-to-server to confirm the payment; if `success` is true the order
//     is settled.
//
// Credentials for a gateway live in StoreSettings.paymentGateways[gatewayId]
// and are passed in `ctx.config` at call time. Definitions of the admin
// form fields live in the registry (GATEWAYS[].fields).
// ---------------------------------------------------------------------------

export type GatewayCountry = 'IR' | 'IQ' | 'global';

/** A single admin-configurable credential field on a gateway. */
export interface GatewayField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'boolean' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  /** Shown in the admin form but never in any public response. */
  secret?: boolean;
}

export interface GatewayOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  description?: string;
}

export interface GatewayContext {
  order: GatewayOrder;
  /** Base return URL (without gateway params): the gateway appends its own. */
  returnUrl: string;
  cancelUrl: string;
  /** The gateway's credential config (secrets included). */
  config: Record<string, string | boolean>;
  /** Store display currency symbol (for human-readable descriptions). */
  currencySymbol?: string;
  /** Base URL of the payment-gateway host (env overridable per gateway). */
  baseUrl?: string;
  /** Injectable network layer (defaults to global fetch). Tests stub this. */
  http: import('./helpers').GatewayHttp;
  /** The gateway-side reference stored on the order (authority / txn id). */
  reference?: string | null;
}

export interface CreatePaymentResult {
  /** URL to redirect the customer to. */
  checkoutUrl: string;
  /** Gateway-side reference stored on the order (authority / txn id / order id). */
  reference: string;
  /** Optional metadata to persist in the payment row's gatewayResponse. */
  extra?: Record<string, unknown>;
}

export interface VerifyPaymentResult {
  success: boolean;
  transactionId?: string | null;
  message?: string;
  reference?: string | null;
  raw?: unknown;
}

export interface GatewayDefinition {
  id: string;
  name: string;
  label: string;
  country: GatewayCountry;
  description: string;
  /** Admin form fields (the keys these map to live in ctx.config). */
  fields: GatewayField[];
  /** What currency the gateway charges in (used for display/hints). */
  currencyHint?: string;
  createPayment: (ctx: GatewayContext) => Promise<CreatePaymentResult>;
  verifyPayment: (ctx: GatewayContext, params: Record<string, string>) => Promise<VerifyPaymentResult>;
}

export type GatewayConfig = Record<string, string | boolean>;
