// ---------------------------------------------------------------------------
// Zarinpal — Iran's most widely used payment gateway (REST v4).
//
//   createPayment: POST /pg/v4/payment/request.json  -> { data: { authority } }
//                  redirect to /pg/StartPay/<authority>
//   verifyPayment: POST /pg/v4/payment/verify.json   -> { data: { code, ref_id } }
//
// Amounts are charged in Iranian Rial (IRR) — the store's base currency must
// be set to IRR for this gateway (see the admin field hint). Merchant ID is
// the UUID Zarinpal issues to the merchant; `sandbox` uses the Zarinpal test
// endpoint.
// ---------------------------------------------------------------------------
import type { GatewayDefinition, GatewayContext } from './types';
import { postJson, roundAmount } from './helpers';

const PROD = {
  request: 'https://payment.zarinpal.com/pg/v4/payment/request.json',
  verify: 'https://payment.zarinpal.com/pg/v4/payment/verify.json',
  startPay: 'https://payment.zarinpal.com/pg/StartPay/',
};
const SANDBOX = {
  request: 'https://sandbox.zarinpal.com/pg/v4/payment/request.json',
  verify: 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json',
  startPay: 'https://sandbox.zarinpal.com/pg/StartPay/',
};

function endpoints(sandbox: boolean) {
  return sandbox ? SANDBOX : PROD;
}

export const zarinpal: GatewayDefinition = {
  id: 'zarinpal',
  name: 'Zarinpal',
  label: 'Zarinpal',
  country: 'IR',
  description:
    'Iranian payment gateway. Charges in Rial (IRR) — set your store currency to IRR. Enter the merchant ID (UUID) Zarinpal issued for your account.',
  currencyHint: 'IRR (Rial)',
  fields: [
    {
      key: 'merchantId',
      label: 'Merchant ID',
      type: 'password',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      secret: true,
      help: 'The merchant UUID from your Zarinpal dashboard.',
    },
    {
      key: 'sandbox',
      label: 'Sandbox mode',
      type: 'boolean',
      help: 'Use the Zarinpal test gateway. Disable when you have production credentials.',
    },
  ],
  async createPayment(ctx: GatewayContext) {
    const merchantId = String(ctx.config.merchantId || '');
    if (!merchantId) throw new Error('Zarinpal merchant ID is not configured');
    const sandbox = Boolean(ctx.config.sandbox);
    const eps = endpoints(sandbox);
    const amount = roundAmount(ctx.order.totalAmount);
    const res = await postJson(ctx.http, eps.request, {
      merchant_id: merchantId,
      amount,
      callback_url: ctx.returnUrl,
      description: ctx.order.description || `Order ${ctx.order.orderNumber}`,
      metadata: {
        order_id: ctx.order.id,
        ...(ctx.order.customerPhone ? { mobile: ctx.order.customerPhone } : {}),
        ...(ctx.order.customerEmail ? { email: ctx.order.customerEmail } : {}),
      },
    });
    const authority = res?.data?.authority;
    const code = res?.data?.code;
    if (!authority || code !== 100) {
      throw new Error(
        `Zarinpal request failed (code ${code ?? '?'}): ${res?.errors?.message || res?.data?.message || 'unknown error'}`,
      );
    }
    return { checkoutUrl: `${eps.startPay}${authority}`, reference: authority };
  },
  async verifyPayment(ctx: GatewayContext, params: Record<string, string>) {
    const merchantId = String(ctx.config.merchantId || '');
    if (!merchantId) throw new Error('Zarinpal merchant ID is not configured');
    // The callback carries Status=OK/NOK. A customer who cancelled or was
    // declined comes back with Status != OK and should not be verified.
    if (params.Status && params.Status !== 'OK') {
      return { success: false, message: 'Payment was not completed (Status=' + params.Status + ').' };
    }
    const authority = params.Authority || ctx.reference;
    if (!authority) return { success: false, message: 'Missing Zarinpal authority.' };
    const eps = endpoints(Boolean(ctx.config.sandbox));
    const amount = roundAmount(ctx.order.totalAmount);
    const res = await postJson(ctx.http, eps.verify, {
      merchant_id: merchantId,
      amount,
      authority,
    });
    const code = res?.data?.code;
    // 100 = paid, 101 = already verified (idempotent replay).
    if (code === 100 || code === 101) {
      return {
        success: true,
        transactionId: String(res?.data?.ref_id ?? ''),
        reference: authority,
        raw: res?.data,
      };
    }
    return {
      success: false,
      message: `Zarinpal verification failed (code ${code ?? '?'}).`,
      reference: authority,
      raw: res?.data,
    };
  },
};
