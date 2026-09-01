// ---------------------------------------------------------------------------
// Gateway payment dispatch + settlement.
//
// The order routes call createGatewayPayment() at placement to hand the
// customer a hosted-payment URL, and the payments routes call
// verifyAndSettleGatewayPayment() when the customer returns. Settlement is
// idempotent: a replayed verify (or a race between the storefront and a
// gateway webhook) never creates a second Payment row or flips an already
// completed order.
// ---------------------------------------------------------------------------
import { prisma } from '../../config/database';
import { env } from '../../config/environment';
import { logger } from '../../utils/logger';
import { getGatewayById, resolveGatewayId } from './gateways/registry';
import { getGatewayConfig, isGatewayConfigured } from './gatewayConfig';
import { defaultHttp } from './gateways/helpers';
import type { GatewayContext, GatewayOrder, RefundPaymentResult } from './gateways/types';
import { autoPostOrder } from '../accounting/accounting.service';
import { sendPaymentConfirmation } from '../../services/email.service';
import { emit } from '../plugins/pluginHooks';

/** Currency recorded on the Payment row for a given gateway. */
function gatewayCurrency(gatewayId: string, config: Record<string, string | boolean>, storeCurrency: string): string {
  switch (gatewayId) {
    case 'zarinpal':
    case 'idpay':
      return 'IRR';
    case 'zaincash':
      return 'IQD';
    case 'fib':
      return String(config.currency || 'IQD');
    default:
      return storeCurrency || 'USD';
  }
}

export interface CreateGatewayPaymentInput {
  order: GatewayOrder;
  paymentMethod: string;
  storeCurrency: string;
}

/**
 * Build the GatewayContext for an order (return/cancel URLs on the storefront
 * checkout page, plus the gateway's stored credentials).
 */
async function buildContext(order: GatewayOrder, gatewayId: string, storeCurrency: string): Promise<GatewayContext> {
  const config = (await getGatewayConfig(gatewayId)) || {};
  const base = `${env.FRONTEND_URL}/checkout?gateway=${gatewayId}&order=${order.id}`;
  return {
    order,
    returnUrl: base,
    cancelUrl: `${base}&canceled=1`,
    config,
    baseUrl: String(config.baseUrl || ''),
    http: defaultHttp,
    currencySymbol: undefined,
  };
}

/** Create a hosted payment session for an order at the given gateway. */
export async function createGatewayPayment(input: CreateGatewayPaymentInput) {
  const gatewayId = resolveGatewayId(input.paymentMethod);
  if (!gatewayId) throw new Error('Unknown payment gateway');
  const def = getGatewayById(gatewayId);
  if (!def) throw new Error('Unknown payment gateway');
  if (!(await isGatewayConfigured(gatewayId))) {
    throw new Error(`${def.name} is not enabled for this store.`);
  }
  const ctx = await buildContext(input.order, gatewayId, input.storeCurrency);
  const result = await def.createPayment(ctx);
  // Persist the gateway reference so a return/callback can match this order.
  await prisma.order.update({
    where: { id: input.order.id },
    data: { paymentIntentId: result.reference },
  });
  return result;
}

/**
 * Verify a return from a gateway and, on success, settle the order
 * idempotently. Returns the verification result.
 */
export async function verifyAndSettleGatewayPayment(params: {
  gatewayId: string;
  orderId: string;
  callbackParams: Record<string, string>;
}): Promise<{ success: boolean; message?: string; transactionId?: string | null }> {
  const def = getGatewayById(params.gatewayId);
  if (!def) throw new Error('Unknown payment gateway');

  const order = await prisma.order.findUnique({ where: { id: params.orderId } });
  if (!order) throw new Error('Order not found');

  // Already settled (idempotent replay) -> report success.
  if (order.paymentStatus === 'completed') {
    return { success: true, message: 'Order already paid.' };
  }

  const storeCurrency =
    (await prisma.storeSettings.findUnique({ where: { id: 'default' } }))?.currency || 'USD';
  const config = (await getGatewayConfig(params.gatewayId)) || {};
  const gatewayOrder: GatewayOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    currency: gatewayCurrency(params.gatewayId, config, storeCurrency),
  };
  const ctx: GatewayContext = {
    order: gatewayOrder,
    returnUrl: `${env.FRONTEND_URL}/checkout?gateway=${params.gatewayId}&order=${order.id}`,
    cancelUrl: `${env.FRONTEND_URL}/checkout?gateway=${params.gatewayId}&order=${order.id}&canceled=1`,
    config,
    http: defaultHttp,
    reference: order.paymentIntentId,
  };

  const result = await def.verifyPayment(ctx, params.callbackParams);
  if (!result.success) {
    // A failed/declined return: record the attempt without flipping a paid order.
    if (order.paymentStatus === 'pending') {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'failed' },
      });
    }
    return { success: false, message: result.message || 'Payment was not completed.' };
  }

  await settleOrderPaid({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: order.totalAmount,
    currency: gatewayCurrency(params.gatewayId, config, storeCurrency),
    method: params.gatewayId,
    transactionId: result.transactionId || result.reference || params.callbackParams.token || '',
    // The create-time gateway reference (e.g. Zarinpal's authority). The
    // settle transactionId differs from it for some gateways and both are
    // needed later: e.g. Zarinpal refunds identify the payment by authority,
    // not by the ref_id that becomes the order's paymentIntentId.
    originalReference: result.reference || order.paymentIntentId || null,
    gatewayResponse: {
      gateway: params.gatewayId,
      ...(result.raw || {}),
      verifiedAt: new Date().toISOString(),
    },
  });
  return { success: true, message: result.message || 'Payment confirmed.', transactionId: result.transactionId };
}

/**
 * Idempotently settle a paid order: create the Payment row and flip the order
 * to processing. Safe to call from a webhook or a storefront verify.
 */
export async function settleOrderPaid(args: {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  method: string;
  transactionId: string;
  originalReference?: string | null;
  gatewayResponse?: Record<string, unknown>;
}): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: args.orderId } });
  if (!order) return;
  if (order.paymentStatus === 'completed') return; // idempotent

  await prisma.payment.create({
    data: {
      orderId: args.orderId,
      amount: args.amount,
      currency: args.currency,
      method: args.method,
      status: 'completed',
      transactionId: args.transactionId,
      gatewayResponse: JSON.stringify({
        ...(args.gatewayResponse || {}),
        ...(args.originalReference ? { originalReference: args.originalReference } : {}),
      }),
    },
  });
  await prisma.order.update({
    where: { id: args.orderId },
    data: {
      paymentStatus: 'completed',
      paymentIntentId: args.transactionId,
      status: 'processing',
    },
  });
  await autoPostOrder(args.orderId);

  // Plugin event: payment.settled (fire-and-forget — emit never throws).
  void emit('payment.settled', {
    orderId: args.orderId,
    orderNumber: args.orderNumber,
    amount: args.amount,
    currency: args.currency,
    transactionId: args.transactionId,
    gateway: args.method,
  });

  // Fire-and-forget: email the customer that their payment was received.
  // Never fails the settlement.
  const orderUser = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { firstName: true, email: true },
  });
  if (orderUser) {
    await sendPaymentConfirmation(order, orderUser).catch(() => {});
  }

  logger.info(`Gateway ${args.method} settled order ${args.orderNumber} (${args.transactionId})`);
}

/**
 * Refund a captured payment at the gateway. Throws on gateways that have no
 * API refund (e.g. IDPay) or are not enabled, so the caller can refuse to
 * falsely mark an order refunded; otherwise returns the gateway's refund
 * result (success means the money was actually returned).
 */
export async function refundGatewayPayment(args: {
  gatewayId: string;
  orderId: string;
  amount: number;
  reason?: string;
}): Promise<RefundPaymentResult> {
  const def = getGatewayById(args.gatewayId);
  if (!def) throw new Error('Unknown payment gateway');
  if (!def.refundPayment) {
    throw new Error(`${def.name} does not expose an API for refunds; process it in the ${def.name} dashboard.`);
  }
  if (!(await isGatewayConfigured(args.gatewayId))) {
    throw new Error(`${def.name} is not enabled for this store, so it cannot be refunded via the API.`);
  }

  const order = await prisma.order.findUnique({ where: { id: args.orderId } });
  if (!order) throw new Error('Order not found');

  // The reference a refund needs is gateway-specific. Most gateways refund by
  // the settled transaction id (order.paymentIntentId), but Zarinpal identifies
  // the payment by its create-time authority, which we preserve on the settled
  // Payment row as gatewayResponse.originalReference. Prefer that for Zarinpal.
  let refundReference: string | null = order.paymentIntentId;
  if (def.id === 'zarinpal') {
    const payment = await prisma.payment.findFirst({
      where: { orderId: args.orderId, method: 'zarinpal', status: 'completed' },
    });
    try {
      const parsed = payment?.gatewayResponse ? JSON.parse(payment.gatewayResponse) : null;
      if (parsed?.originalReference) refundReference = String(parsed.originalReference);
    } catch {
      // fall back to order.paymentIntentId below
    }
  }

  const storeCurrency =
    (await prisma.storeSettings.findUnique({ where: { id: 'default' } }))?.currency || 'USD';
  const config = (await getGatewayConfig(args.gatewayId)) || {};
  const currency = gatewayCurrency(args.gatewayId, config, storeCurrency);
  const gatewayOrder: GatewayOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    currency,
  };
  const ctx: GatewayContext = {
    order: gatewayOrder,
    returnUrl: '',
    cancelUrl: '',
    config,
    http: defaultHttp,
    reference: refundReference,
  };
  return def.refundPayment(ctx, {
    reference: refundReference,
    amount: args.amount,
    reason: args.reason,
    currency,
  });
}
