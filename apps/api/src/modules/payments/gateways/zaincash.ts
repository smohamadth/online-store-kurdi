// ---------------------------------------------------------------------------
// ZainCash — Iraq's leading mobile-wallet payment network (heavily used in
// Iraqi Kurdistan). Uses ZainCash Payment Gateway v2 (OAuth2 + hosted page).
//
//   auth:   POST /oauth2/token (client_credentials) -> access_token
//   create: POST /api/v2/payment-gateway/transaction/init -> redirectUrl
//   verify: the gateway redirects back to our returnUrl with a signed JWT in
//           the query string. We verify that JWT (HS256 with the API key) and
//           treat a valid non-error payload as paid.
//
// Amounts are in Iraqi Dinar (IQD). Test base URL is pg-api-uat.zaincash.iq;
// production is issued during onboarding (override via the baseUrl field).
// ---------------------------------------------------------------------------
import type { GatewayDefinition, GatewayContext } from './types';
import { postForm, postJson, formatAmount2 } from './helpers';
import jwt from 'jsonwebtoken';

const TEST_BASE = 'https://pg-api-uat.zaincash.iq';

export const zaincash: GatewayDefinition = {
  id: 'zaincash',
  name: 'ZainCash',
  label: 'ZainCash',
  country: 'IQ',
  description:
    'Iraqi mobile-wallet payment gateway (widely used in Iraqi Kurdistan). Charges in IQD. Enter the client credentials ZainCash issued for your merchant account.',
  currencyHint: 'IQD',
  fields: [
    { key: 'clientId', label: 'Client ID', type: 'text', required: true, secret: true, help: 'Issued by ZainCash.' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, secret: true, help: 'Issued by ZainCash.' },
    { key: 'apiKey', label: 'API Key (JWT)', type: 'password', required: true, secret: true, help: 'Used to verify the redirect JWT (HS256).' },
    { key: 'serviceType', label: 'Service type', type: 'text', placeholder: 'Online store', help: 'Shown to the customer on the ZainCash page.' },
    {
      key: 'baseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: TEST_BASE,
      help: 'Test: pg-api-uat.zaincash.iq. Production URL is issued during onboarding.',
    },
    { key: 'sandbox', label: 'Sandbox / test environment', type: 'boolean', help: 'Use the ZainCash test API.' },
  ],
  async createPayment(ctx: GatewayContext) {
    const clientId = String(ctx.config.clientId || '');
    const clientSecret = String(ctx.config.clientSecret || '');
    if (!clientId || !clientSecret) throw new Error('ZainCash client credentials are not configured');
    const base = String(ctx.config.baseUrl || TEST_BASE).replace(/\/$/, '');

    const tokenRes = await postForm(ctx.http, `${base}/oauth2/token`,
      `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=${encodeURIComponent('payment:read payment:write reverse:write')}`);
    const accessToken = tokenRes?.access_token;
    if (!accessToken) throw new Error('ZainCash authentication failed (no access token).');

    const res = await postJson(
      ctx.http,
      `${base}/api/v2/payment-gateway/transaction/init`,
      {
        language: 'en',
        externalReferenceId: ctx.order.id,
        orderId: ctx.order.orderNumber,
        serviceType: String(ctx.config.serviceType || 'Online store'),
        amount: { value: formatAmount2(ctx.order.totalAmount), currency: 'IQD' },
        customer: { phone: ctx.order.customerPhone || '' },
        redirectUrls: { successUrl: ctx.returnUrl, failureUrl: ctx.cancelUrl },
      },
      { Authorization: `Bearer ${accessToken}` },
    );
    const redirectUrl = res?.redirectUrl;
    if (!redirectUrl) {
      throw new Error(`ZainCash init failed: ${res?.message || JSON.stringify(res) || 'no redirectUrl'}`);
    }
    return { checkoutUrl: redirectUrl, reference: ctx.order.id, extra: { externalReferenceId: ctx.order.id } };
  },
  async verifyPayment(ctx: GatewayContext, params: Record<string, string>) {
    // ZainCash redirects to successUrl with a signed JWT (query param `token`
    // or `Token`). Verify signature (HS256) with the API key. On success the
    // payload carries the transaction; on failure it indicates an error.
    const apiKey = String(ctx.config.apiKey || '');
    const token = params.token || params.Token;
    if (!token) {
      // Some flows append a plain `status` instead of a JWT.
      const status = (params.status || '').toLowerCase();
      return { success: status === 'success' || status === 'paid', message: `ZainCash status ${status}.` };
    }
    if (!apiKey) {
      return { success: false, message: 'ZainCash API key missing; cannot verify redirect token.' };
    }
    try {
      const payload: any = jwt.verify(token, apiKey, { algorithms: ['HS256'] });
      const status = String(payload?.status || payload?.txnStatus || '').toLowerCase();
      const hasError = Boolean(payload?.error) || status === 'failed' || status === 'error';
      if (hasError) {
        return { success: false, message: `ZainCash payment failed (${payload?.error || status}).`, reference: ctx.reference };
      }
      const transactionId = payload?.txnId || payload?.transactionId || payload?.id || ctx.reference;
      return { success: true, transactionId: String(transactionId ?? ''), reference: ctx.reference, raw: payload };
    } catch (err) {
      return { success: false, message: `ZainCash redirect token verification failed: ${(err as Error).message}`, reference: ctx.reference };
    }
  },
};
