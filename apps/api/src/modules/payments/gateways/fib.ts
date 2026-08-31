// ---------------------------------------------------------------------------
// FIB — First Iraqi Bank (a popular modern bank in Iraq and Iraqi Kurdistan).
//
//   auth:   POST /auth/realms/fib-online-shop/protocol/openid-connect/token
//   create: POST /protected/v1/payments -> { paymentId, personalAppLink, ... }
//   verify: GET  /protected/v1/payments/:id -> { status }
//
// The customer pays on FIB's hosted page / app (we redirect to the personal
// app link FIB returns). FIB calls `statusCallbackUrl` on status changes and
// we check status by id when the storefront verifies. Currency is IQD.
// ---------------------------------------------------------------------------
import type { GatewayDefinition, GatewayContext } from './types';
import { postForm, postJson, getJson, formatAmount2 } from './helpers';

const TEST_BASE = 'https://fib.stage.fib.iq';
const TOKEN_PATH = '/auth/realms/fib-online-shop/protocol/openid-connect/token';

const SUCCESS_STATUSES = new Set(['COMPLETED', 'PAID', 'SUCCESS', 'APPROVED']);

export const fib: GatewayDefinition = {
  id: 'fib',
  name: 'FIB (First Iraqi Bank)',
  label: 'FIB',
  country: 'IQ',
  description:
    'First Iraqi Bank online payments — popular in Iraqi Kurdistan. Charges in IQD. Enter the client_id / client_secret FIB issued for your web shop.',
  currencyHint: 'IQD',
  fields: [
    { key: 'clientId', label: 'Client ID', type: 'text', required: true, secret: true, help: 'Issued by FIB.' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, secret: true, help: 'Issued by FIB.' },
    {
      key: 'baseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: TEST_BASE,
      help: 'Sandbox: fib.stage.fib.iq. Production URL is issued by FIB.',
    },
    {
      key: 'currency',
      label: 'Currency',
      type: 'select',
      options: [
        { value: 'IQD', label: 'IQD — Iraqi Dinar' },
        { value: 'USD', label: 'USD — US Dollar' },
      ],
    },
    { key: 'sandbox', label: 'Sandbox / test environment', type: 'boolean', help: 'Use the FIB stage API.' },
  ],
  async createPayment(ctx: GatewayContext) {
    const clientId = String(ctx.config.clientId || '');
    const clientSecret = String(ctx.config.clientSecret || '');
    if (!clientId || !clientSecret) throw new Error('FIB client credentials are not configured');
    const base = String(ctx.config.baseUrl || TEST_BASE).replace(/\/$/, '');
    const currency = String(ctx.config.currency || 'IQD');

    const tokenRes = await postForm(ctx.http, `${base}${TOKEN_PATH}`,
      `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`);
    const accessToken = tokenRes?.access_token;
    if (!accessToken) throw new Error('FIB authentication failed (no access token).');

    const res = await postJson(
      ctx.http,
      `${base}/protected/v1/payments`,
      {
        monetaryValue: { amount: formatAmount2(ctx.order.totalAmount), currency },
        statusCallbackUrl: ctx.returnUrl,
        description: ctx.order.description || `Order ${ctx.order.orderNumber}`,
      },
      { Authorization: `Bearer ${accessToken}` },
    );
    const paymentId = res?.paymentId;
    if (!paymentId) {
      throw new Error(`FIB create payment failed: ${res?.message || JSON.stringify(res) || 'no paymentId'}`);
    }
    const checkoutUrl = String(res?.personalAppLink || res?.businessAppLink || '');
    if (!checkoutUrl) {
      throw new Error('FIB did not return a payment link.');
    }
    return { checkoutUrl, reference: paymentId, extra: { readableCode: res?.readableCode } };
  },
  async verifyPayment(ctx: GatewayContext, params: Record<string, string>) {
    const clientId = String(ctx.config.clientId || '');
    const clientSecret = String(ctx.config.clientSecret || '');
    const base = String(ctx.config.baseUrl || TEST_BASE).replace(/\/$/, '');
    const paymentId = params.paymentId || ctx.reference;
    if (!paymentId) return { success: false, message: 'Missing FIB payment id.' };

    const tokenRes = await postForm(ctx.http, `${base}${TOKEN_PATH}`,
      `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`);
    const accessToken = tokenRes?.access_token;
    if (!accessToken) return { success: false, message: 'FIB authentication failed.' };

    const res = await getJson(ctx.http, `${base}/protected/v1/payments/${encodeURIComponent(paymentId)}`, {
      Authorization: `Bearer ${accessToken}`,
    });
    const status = String(res?.status || '');
    if (SUCCESS_STATUSES.has(status.toUpperCase())) {
      return { success: true, transactionId: paymentId, reference: paymentId, raw: res };
    }
    return { success: false, message: `FIB payment status: ${status || 'unknown'}.`, reference: paymentId, raw: res };
  },
};
