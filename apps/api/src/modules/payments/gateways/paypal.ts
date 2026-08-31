// ---------------------------------------------------------------------------
// PayPal — Orders API v2 (hosted approve flow).
//
//   auth:   POST /v1/oauth2/token (Basic clientId:clientSecret)
//   create: POST /v2/checkout/orders (intent CAPTURE) -> approve link
//   verify: POST /v2/checkout/orders/:id/capture -> status COMPLETED
//
// The customer approves on PayPal and returns to our returnUrl with
// `token` (PayPal order id) and `PayerID`; we capture to settle.
// ---------------------------------------------------------------------------
import type { GatewayDefinition, GatewayContext } from './types';
import { postForm, postJson, formatAmount2 } from './helpers';

const PROD = 'https://api-m.paypal.com';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

export const paypal: GatewayDefinition = {
  id: 'paypal',
  name: 'PayPal',
  label: 'PayPal',
  country: 'global',
  description:
    'International card & PayPal-balance payments. Charges in the store currency. Enter your PayPal REST app client ID and secret.',
  fields: [
    { key: 'clientId', label: 'Client ID', type: 'text', required: true, secret: true, help: 'From your PayPal developer app.' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, secret: true, help: 'From your PayPal developer app.' },
    { key: 'sandbox', label: 'Sandbox mode', type: 'boolean', help: 'Use the PayPal sandbox API.' },
  ],
  async createPayment(ctx: GatewayContext) {
    const clientId = String(ctx.config.clientId || '');
    const clientSecret = String(ctx.config.clientSecret || '');
    if (!clientId || !clientSecret) throw new Error('PayPal client credentials are not configured');
    const base = Boolean(ctx.config.sandbox) ? SANDBOX : PROD;

    const tokenRes = await postForm(
      ctx.http,
      `${base}/v1/oauth2/token`,
      'grant_type=client_credentials',
      { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
    );
    const accessToken = tokenRes?.access_token;
    if (!accessToken) throw new Error('PayPal authentication failed (no access token).');

    const res = await postJson(
      ctx.http,
      `${base}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: ctx.order.id,
            description: ctx.order.description || `Order ${ctx.order.orderNumber}`,
            amount: { currency_code: ctx.order.currency || 'USD', value: formatAmount2(ctx.order.totalAmount) },
          },
        ],
        application_context: {
          return_url: ctx.returnUrl,
          cancel_url: ctx.cancelUrl,
          brand_name: 'Store',
          user_action: 'PAY_NOW',
        },
      },
      { Authorization: `Bearer ${accessToken}`, 'PayPal-Request-Id': ctx.order.id },
    );
    const orderId = res?.id;
    const approve = Array.isArray(res?.links)
      ? res.links.find((l: any) => l && l.rel === 'approve')
      : undefined;
    if (!orderId || !approve?.href) {
      throw new Error(`PayPal create order failed: ${res?.message || JSON.stringify(res) || 'no approve link'}`);
    }
    return { checkoutUrl: approve.href, reference: orderId, extra: { paypalStatus: res?.status } };
  },
  async verifyPayment(ctx: GatewayContext, params: Record<string, string>) {
    const clientId = String(ctx.config.clientId || '');
    const clientSecret = String(ctx.config.clientSecret || '');
    const base = Boolean(ctx.config.sandbox) ? SANDBOX : PROD;
    const orderId = params.token || params.orderId || ctx.reference;
    if (!orderId) return { success: false, message: 'Missing PayPal order id.' };

    const tokenRes = await postForm(
      ctx.http,
      `${base}/v1/oauth2/token`,
      'grant_type=client_credentials',
      { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
    );
    const accessToken = tokenRes?.access_token;
    if (!accessToken) return { success: false, message: 'PayPal authentication failed.' };

    const res = await postJson(ctx.http, `${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    });
    const status = String(res?.status || '');
    if (status === 'COMPLETED') {
      const captureId = res?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      return { success: true, transactionId: String(captureId || orderId), reference: orderId, raw: res };
    }
    return { success: false, message: `PayPal capture status: ${status}.`, reference: orderId, raw: res };
  },
};
