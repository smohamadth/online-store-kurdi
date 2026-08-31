// ---------------------------------------------------------------------------
// IDPay — Iranian payment gateway (REST v1.1).
//
//   createPayment: POST /v1.1/payment   -> { id, link }
//   verifyPayment: POST /v1.1/payment/verify -> { status, track_id }
//
// Auth is the merchant's API key in the X-API-KEY header; sandbox mode sends
// X-SANDBOX: 1. Amounts are in Rial (IRR). The customer is redirected to
// `link`, and returns to our returnUrl with `id`, `order_id` and `status`
// appended.
// ---------------------------------------------------------------------------
import type { GatewayDefinition, GatewayContext } from './types';
import { postJson, roundAmount } from './helpers';

const API = 'https://api.idpay.ir/v1.1';

export const idpay: GatewayDefinition = {
  id: 'idpay',
  name: 'IDPay',
  label: 'IDPay',
  country: 'IR',
  description:
    'Iranian payment gateway (supports many banks/cards). Charges in Rial (IRR) — set your store currency to IRR. Enter your IDPay API key.',
  currencyHint: 'IRR (Rial)',
  fields: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      secret: true,
      help: 'API key from your IDPay dashboard.',
    },
    {
      key: 'sandbox',
      label: 'Sandbox mode',
      type: 'boolean',
      help: 'Use the IDPay test environment (X-SANDBOX).',
    },
  ],
  async createPayment(ctx: GatewayContext) {
    const apiKey = String(ctx.config.apiKey || '');
    if (!apiKey) throw new Error('IDPay API key is not configured');
    const sandbox = Boolean(ctx.config.sandbox);
    const headers: Record<string, string> = { 'X-API-KEY': apiKey };
    if (sandbox) headers['X-SANDBOX'] = '1';

    const res = await postJson(
      ctx.http,
      `${API}/payment`,
      {
        order_id: ctx.order.orderNumber,
        amount: roundAmount(ctx.order.totalAmount),
        name: ctx.order.customerEmail || undefined,
        mail: ctx.order.customerEmail || undefined,
        phone: ctx.order.customerPhone || undefined,
        desc: ctx.order.description || `Order ${ctx.order.orderNumber}`,
        callback: ctx.returnUrl,
      },
      headers,
    );
    const link = res?.link;
    const id = res?.id;
    if (!link || !id) {
      throw new Error(`IDPay request failed: ${res?.error_message || res?.message || 'unknown error'}`);
    }
    return { checkoutUrl: link, reference: id, extra: { order_id: ctx.order.orderNumber } };
  },
  async verifyPayment(ctx: GatewayContext, params: Record<string, string>) {
    const apiKey = String(ctx.config.apiKey || '');
    if (!apiKey) throw new Error('IDPay API key is not configured');
    const sandbox = Boolean(ctx.config.sandbox);
    const headers: Record<string, string> = { 'X-API-KEY': apiKey };
    if (sandbox) headers['X-SANDBOX'] = '1';

    const id = params.id || ctx.reference;
    const orderId = params.order_id || ctx.order.orderNumber;
    if (!id) return { success: false, message: 'Missing IDPay transaction id.' };
    // Callback status 10 = "payment made, verify it"; 100/200 = already verified.
    if (params.status && params.status !== '10' && params.status !== '100' && params.status !== '200') {
      return { success: false, message: `IDPay payment status ${params.status}.` };
    }

    const res = await postJson(ctx.http, `${API}/payment/verify`, { id, order_id: orderId }, headers);
    const status = String(res?.status ?? '');
    if (status === '100' || status === '200') {
      return {
        success: true,
        transactionId: String(res?.track_id ?? ''),
        reference: id,
        raw: res,
      };
    }
    return { success: false, message: `IDPay verification failed (status ${status}).`, reference: id, raw: res };
  },
};
