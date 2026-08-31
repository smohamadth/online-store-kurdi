// ---------------------------------------------------------------------------
// Unit tests for the payment gateway adapters.
//
// Every gateway does its network I/O through `ctx.http.fetch`, so these tests
// stub that one function and assert:
//   - the correct endpoint/body/headers are sent (createPayment),
//   - the returned checkoutUrl/reference are parsed from the response,
//   - verifyPayment maps gateway status codes to success/failure,
//   - missing credentials throw a clear error.
// No real gateway or network is ever contacted.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';

// gatewayConfig.ts imports the real prisma client (which requires a generated
// @prisma/client). The pure parse function is what we test here, so stub the
// database module to keep this suite runnable without a DB/client.
vi.mock('../../../src/config/database', () => ({
  prisma: { storeSettings: { findUnique: vi.fn() } },
}));

import { zarinpal } from '../../../src/modules/payments/gateways/zarinpal';
import { idpay } from '../../../src/modules/payments/gateways/idpay';
import { paypal } from '../../../src/modules/payments/gateways/paypal';
import { fib } from '../../../src/modules/payments/gateways/fib';
import { zaincash } from '../../../src/modules/payments/gateways/zaincash';
import type { GatewayContext } from '../../../src/modules/payments/gateways/types';
import { parseGatewayConfigs } from '../../../src/modules/payments/gatewayConfig';
import { isGatewayMethod, resolveGatewayId, GATEWAYS } from '../../../src/modules/payments/gateways/registry';

// Build a mock http layer that records calls and returns scripted responses
// per URL.
function mockHttp(script: Record<string, any>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const body = script[url] ?? script['default'];
    return {
      ok: true,
      status: 200,
      async text() {
        return typeof body === 'string' ? body : JSON.stringify(body);
      },
    } as any;
  });
  return { fetch, calls };
}

function baseCtx(over: Partial<GatewayContext> = {}): GatewayContext {
  return {
    order: {
      id: 'ord_1',
      orderNumber: 'ORD-123',
      totalAmount: 1000,
      currency: 'USD',
      customerEmail: 'buyer@example.com',
      description: 'Order ORD-123',
    },
    returnUrl: 'https://store.test/checkout?gateway=x&order=ord_1',
    cancelUrl: 'https://store.test/checkout?gateway=x&order=ord_1&canceled=1',
    config: {},
    http: mockHttp({}) as any,
    reference: null,
    ...over,
  } as any;
}

describe('registry', () => {
  it('exposes the expected gateways', () => {
    const ids = GATEWAYS.map((g) => g.id).sort();
    expect(ids).toEqual(['fib', 'idpay', 'paypal', 'stripe', 'zaincash', 'zarinpal']);
  });

  it('resolves gateway ids and the legacy card alias', () => {
    expect(resolveGatewayId('zarinpal')).toBe('zarinpal');
    expect(resolveGatewayId('card')).toBe('stripe');
    expect(resolveGatewayId('credit_card')).toBe('stripe');
    expect(isGatewayMethod('card')).toBe(true);
    expect(isGatewayMethod('cod')).toBe(false);
    expect(isGatewayMethod(undefined)).toBe(false);
  });
});

describe('gatewayConfig.parseGatewayConfigs', () => {
  it('parses a valid JSON map and tolerates garbage', () => {
    expect(parseGatewayConfigs('{"zarinpal":{"enabled":true}}').zarinpal.enabled).toBe(true);
    expect(parseGatewayConfigs('not-json')).toEqual({});
    expect(parseGatewayConfigs('')).toEqual({});
    expect(parseGatewayConfigs(null)).toEqual({});
    expect(parseGatewayConfigs('[1,2]')).toEqual({});
  });
});

describe('zarinpal', () => {
  it('creates a payment and returns the StartPay url + authority', async () => {
    const http = mockHttp({
      'https://payment.zarinpal.com/pg/v4/payment/request.json': {
        data: { code: 100, authority: 'A0001' },
        errors: [],
      },
    });
    const res = await zarinpal.createPayment(
      baseCtx({ config: { merchantId: 'm1' }, http }),
    );
    expect(res.reference).toBe('A0001');
    expect(res.checkoutUrl).toContain('StartPay/A0001');
    expect(http.calls[0].url).toContain('/pg/v4/payment/request.json');
  });

  it('verifies a successful authority', async () => {
    const http = mockHttp({
      'https://payment.zarinpal.com/pg/v4/payment/verify.json': { data: { code: 100, ref_id: 12345 } },
    });
    const res = await zarinpal.verifyPayment(
      baseCtx({ config: { merchantId: 'm1' }, http, reference: 'A0001' }),
      { Status: 'OK', Authority: 'A0001' },
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('12345');
  });

  it('rejects a cancelled Status', async () => {
    const res = await zarinpal.verifyPayment(
      baseCtx({ config: { merchantId: 'm1' }, reference: 'A0001' }),
      { Status: 'NOK', Authority: 'A0001' },
    );
    expect(res.success).toBe(false);
  });

  it('throws when merchant id is missing', async () => {
    await expect(zarinpal.createPayment(baseCtx({ config: {} }))).rejects.toThrow('merchant ID');
  });
});

describe('idpay', () => {
  it('creates a payment and returns the link + id', async () => {
    const http = mockHttp({
      'https://api.idpay.ir/v1.1/payment': { id: 'txn1', link: 'https://idpay/pay/1' },
    });
    const res = await idpay.createPayment(
      baseCtx({ config: { apiKey: 'k' }, http }),
    );
    expect(res.reference).toBe('txn1');
    expect(res.checkoutUrl).toBe('https://idpay/pay/1');
  });

  it('verifies a paid transaction (status 100)', async () => {
    const http = mockHttp({
      'https://api.idpay.ir/v1.1/payment/verify': { status: 100, track_id: 'trk1' },
    });
    const res = await idpay.verifyPayment(
      baseCtx({ config: { apiKey: 'k' }, http, reference: 'txn1' }),
      { id: 'txn1', order_id: 'ORD-123', status: '10' },
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('trk1');
  });

  it('rejects a non-paid callback status', async () => {
    const res = await idpay.verifyPayment(
      baseCtx({ config: { apiKey: 'k' }, reference: 'txn1' }),
      { id: 'txn1', order_id: 'ORD-123', status: '7' },
    );
    expect(res.success).toBe(false);
  });
});

describe('paypal', () => {
  const paypalCtx = () =>
    baseCtx({ config: { clientId: 'cid', clientSecret: 'csec' } });

  it('creates an order and returns the approve link', async () => {
    const http = mockHttp({
      'https://api-m.paypal.com/v1/oauth2/token': { access_token: 'at' },
      'https://api-m.paypal.com/v2/checkout/orders': {
        id: 'PAY-1',
        status: 'CREATED',
        links: [{ rel: 'approve', href: 'https://paypal/approve/PAY-1' }],
      },
    });
    const res = await paypal.createPayment(baseCtx({ config: paypalCtx().config, http }));
    expect(res.reference).toBe('PAY-1');
    expect(res.checkoutUrl).toBe('https://paypal/approve/PAY-1');
  });

  it('captures a completed order on verify', async () => {
    const http = mockHttp({
      'https://api-m.paypal.com/v1/oauth2/token': { access_token: 'at' },
      'https://api-m.paypal.com/v2/checkout/orders/PAY-1/capture': {
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'CAP-9' }] } }],
      },
    });
    const res = await paypal.verifyPayment(
      baseCtx({ config: paypalCtx().config, http, reference: 'PAY-1' }),
      { token: 'PAY-1' },
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('CAP-9');
  });

  it('rejects a non-completed capture', async () => {
    const http = mockHttp({
      'https://api-m.paypal.com/v1/oauth2/token': { access_token: 'at' },
      'https://api-m.paypal.com/v2/checkout/orders/PAY-1/capture': { status: 'DECLINED' },
    });
    const res = await paypal.verifyPayment(
      baseCtx({ config: paypalCtx().config, http, reference: 'PAY-1' }),
      { token: 'PAY-1' },
    );
    expect(res.success).toBe(false);
  });
});

describe('fib', () => {
  const fibCtx = () =>
    baseCtx({
      config: { clientId: 'cid', clientSecret: 'sec', baseUrl: 'https://fib.stage.fib.iq', currency: 'IQD' },
    });

  it('creates a payment and returns the personal app link', async () => {
    const http = mockHttp({
      'https://fib.stage.fib.iq/auth/realms/fib-online-shop/protocol/openid-connect/token': {
        access_token: 'at',
      },
      'https://fib.stage.fib.iq/protected/v1/payments': {
        paymentId: 'P-1',
        personalAppLink: 'https://fib/pay/P-1',
      },
    });
    const res = await fib.createPayment(baseCtx({ config: fibCtx().config, http }));
    expect(res.reference).toBe('P-1');
    expect(res.checkoutUrl).toBe('https://fib/pay/P-1');
  });

  it('verifies a COMPLETED payment', async () => {
    const http = mockHttp({
      'https://fib.stage.fib.iq/auth/realms/fib-online-shop/protocol/openid-connect/token': {
        access_token: 'at',
      },
      'https://fib.stage.fib.iq/protected/v1/payments/P-1': { status: 'COMPLETED' },
    });
    const res = await fib.verifyPayment(
      baseCtx({ config: fibCtx().config, http, reference: 'P-1' }),
      { paymentId: 'P-1' },
    );
    expect(res.success).toBe(true);
  });

  it('rejects a pending/pending payment', async () => {
    const http = mockHttp({
      'https://fib.stage.fib.iq/auth/realms/fib-online-shop/protocol/openid-connect/token': {
        access_token: 'at',
      },
      'https://fib.stage.fib.iq/protected/v1/payments/P-1': { status: 'PENDING' },
    });
    const res = await fib.verifyPayment(
      baseCtx({ config: fibCtx().config, http, reference: 'P-1' }),
      { paymentId: 'P-1' },
    );
    expect(res.success).toBe(false);
  });
});

describe('zaincash', () => {
  const zcCtx = () =>
    baseCtx({
      config: {
        clientId: 'cid',
        clientSecret: 'sec',
        apiKey: 'jwt-secret',
        serviceType: 'Store',
        baseUrl: 'https://pg-api-uat.zaincash.iq',
      },
    });

  it('creates a payment via oauth2 + transaction/init', async () => {
    const http = mockHttp({
      'https://pg-api-uat.zaincash.iq/oauth2/token': { access_token: 'at' },
      'https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction/init': {
        redirectUrl: 'https://zaincash/pay/1',
      },
    });
    const res = await zaincash.createPayment(baseCtx({ config: zcCtx().config, http }));
    expect(res.checkoutUrl).toBe('https://zaincash/pay/1');
    expect(res.reference).toBe('ord_1');
  });

  it('verifies a valid signed redirect token', async () => {
    const jwt = await import('jsonwebtoken');
    const token = jwt.sign({ status: 'success', txnId: 'Z-1' }, 'jwt-secret', { algorithm: 'HS256' });
    const res = await zaincash.verifyPayment(
      baseCtx({ config: zcCtx().config, reference: 'ord_1' }),
      { token },
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('Z-1');
  });

  it('rejects a tampered token', async () => {
    const res = await zaincash.verifyPayment(
      baseCtx({ config: zcCtx().config, reference: 'ord_1' }),
      { token: 'not.a.valid.jwt' },
    );
    expect(res.success).toBe(false);
  });
});

describe('gateway refunds', () => {
  it('paypal refunds a captured payment', async () => {
    const http = mockHttp({
      'https://api-m.paypal.com/v1/oauth2/token': { access_token: 'at' },
      'https://api-m.paypal.com/v2/payments/captures/CAP-9/refund': { status: 'COMPLETED', id: 'REF-1' },
    });
    const res = await paypal.refundPayment!(
      baseCtx({ config: { clientId: 'cid', clientSecret: 'csec' }, http }),
      { reference: 'CAP-9', amount: 1000, currency: 'USD', reason: 'customer request' },
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('REF-1');
    const reverseCall = http.calls.find((c) => c.url.includes('/refund'));
    expect(reverseCall).toBeTruthy();
    expect(JSON.parse(String(reverseCall!.init?.body))).toMatchObject({ amount: { value: '1000.00', currency_code: 'USD' }, note_to_payer: 'customer request' });
  });

  it('paypal reports a failed refund', async () => {
    const http = mockHttp({
      'https://api-m.paypal.com/v1/oauth2/token': { access_token: 'at' },
      'https://api-m.paypal.com/v2/payments/captures/CAP-9/refund': { status: 'FAILED' },
    });
    const res = await paypal.refundPayment!(
      baseCtx({ config: { clientId: 'cid', clientSecret: 'csec' }, http }),
      { reference: 'CAP-9', amount: 1000, currency: 'USD' },
    );
    expect(res.success).toBe(false);
  });

  it('zaincash reverses a transaction', async () => {
    const http = mockHttp({
      'https://pg-api-uat.zaincash.iq/oauth2/token': { access_token: 'at' },
      'https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction/reverse': { status: 'REFUNDED', transactionId: 'Z-1' },
    });
    const res = await zaincash.refundPayment!(
      baseCtx({
        config: { clientId: 'cid', clientSecret: 'sec', apiKey: 'jwt-secret', baseUrl: 'https://pg-api-uat.zaincash.iq' },
        http,
      }),
      { reference: 'Z-1', amount: 2500, reason: 'return' },
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('Z-1');
    const rev = http.calls.find((c) => c.url.includes('/reverse'));
    expect(JSON.parse(String(rev!.init?.body))).toMatchObject({ transactionId: 'Z-1', reason: 'return' });
  });

  it('idpay does not expose a refund API (refuses to fake it)', () => {
    expect(idpay.refundPayment).toBeUndefined();
  });
});

describe('zarinpal refund', () => {
  it('refunds an authority via the v4 refund endpoint', async () => {
    const http = mockHttp({
      'https://payment.zarinpal.com/pg/v4/payment/refund.json': {
        data: { code: 100, status: 'REFUNDED', ref_id: 77 },
        errors: [],
      },
    });
    const res = await zarinpal.refundPayment!(
      baseCtx({ config: { merchantId: 'm-1' }, http }),
      { reference: 'A0000000000000000000000000000000000000', amount: 5000, reason: 'return' },
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('77');
    const call = http.calls.find((c) => c.url.includes('/refund.json'));
    expect(JSON.parse(String(call!.init?.body))).toMatchObject({
      merchant_id: 'm-1',
      authority: 'A0000000000000000000000000000000000000',
      amount: 5000,
    });
  });

  it('reports a rejected zarinpal refund', async () => {
    const http = mockHttp({
      'https://payment.zarinpal.com/pg/v4/payment/refund.json': { data: { code: -12, status: 'ERROR' }, errors: [] },
    });
    const res = await zarinpal.refundPayment!(
      baseCtx({ config: { merchantId: 'm-1' }, http }),
      { reference: 'A0000000000000000000000000000000000000', amount: 5000 },
    );
    expect(res.success).toBe(false);
  });
});

describe('fib refund', () => {
  const fibCtx = () =>
    baseCtx({
      config: { clientId: 'cid', clientSecret: 'csec', currency: 'IQD', baseUrl: 'https://fib.stage.fib.iq' },
    });

  it('refunds a payment id (HTTP 202 = accepted)', async () => {
    const http = mockHttp({
      'https://fib.stage.fib.iq/auth/realms/fib-online-shop/protocol/openid-connect/token': { access_token: 'at' },
      'https://fib.stage.fib.iq/protected/v1/payments/PAY-1/refund': { ok: true },
    });
    const res = await fib.refundPayment!(baseCtx({ config: fibCtx().config, http }), {
      reference: 'PAY-1',
      amount: 2500,
      reason: 'return',
    });
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('PAY-1');
    expect(http.calls.some((c) => c.url.includes('/payments/PAY-1/refund'))).toBe(true);
  });

  it('reports an FIB refund rejection', async () => {
    const http = mockHttp({});
    // Token call succeeds; the refund endpoint is rejected with a non-2xx.
    http.fetch.mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/token')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'at' }) } as any;
      }
      return { ok: false, status: 406, text: async () => 'not accepted' } as any;
    });
    const res = await fib.refundPayment!(baseCtx({ config: fibCtx().config, http }), {
      reference: 'PAY-1',
      amount: 2500,
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/FIB refund failed/);
  });
});
