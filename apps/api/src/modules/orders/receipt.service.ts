/**
 * Receipt / bill generation.
 *
 * Two output formats are supported:
 *   - HTML (used by the printable receipt page; no extra deps)
 *   - PDF  (rendered with pdfkit; the only external dependency
 *           is a pure-JS font, no native binaries required)
 *
 * The data-assembly step (`assembleReceiptData`) is pure and shared
 * by both formats, so a unit test can pin the line items, totals,
 * and address formatting without running the renderer. The
 * integration test then covers the HTTP surface.
 *
 * The renderers themselves live in `receipt.renderers.ts` so they
 * can be unit-tested without dragging the prisma client in.
 */
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/environment';

import {
  renderReceiptHtml,
  renderReceiptPdf,
  type ReceiptData,
  type ReceiptItem,
  type ReceiptAddress,
} from './receipt.renderers';

// Re-export for callers that already imported from this module.
export { renderReceiptHtml, renderReceiptPdf, type ReceiptData, type ReceiptItem, type ReceiptAddress };

// ---------------------------------------------------------------------
// Data assembly
// ---------------------------------------------------------------------

/**
 * Pull all the rows the receipt needs and shape them into a pure
 * data object. Pure: no I/O after the prisma calls return, so the
 * unit tests can assert on the output without mocking the database.
 *
 * The `documentType` is hardcoded to 'receipt' for now; if we add
 * invoicing later, the caller picks.
 */
export async function assembleReceiptData(orderId: string): Promise<ReceiptData> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      items: {
        include: {
          product: { select: { name: true, sku: true } },
          variant: { select: { name: true, sku: true } },
        },
      },
      shippingAddress: true,
    },
  });
  if (!order) throw new AppError('Order not found', 404);

  // Look for a billing address: pick the most recent Address with
  // type='billing' belonging to the user. Most stores keep one
  // billing address per customer; if there's none, we fall back
  // to the shipping address (still has to render something).
  const billing = await prisma.address.findFirst({
    where: { userId: order.userId, type: 'billing' },
    orderBy: { updatedAt: 'desc' },
  });

  const items: ReceiptItem[] = order.items.map((it: any) => ({
    productId: it.productId,
    variantId: it.variantId,
    name: it.variant?.name
      ? `${it.product?.name} - ${it.variant.name}`
      : (it.product?.name ?? 'Product'),
    sku: it.variant?.sku ?? it.product?.sku ?? null,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    totalPrice: Number(it.totalPrice),
    isBackorder: Boolean((it as any).isBackorder),
  }));

  const totals = {
    subtotal: Number(order.subtotal),
    discount: Number(order.discountAmount ?? 0),
    shipping: Number(order.shippingAmount ?? 0),
    tax: Number(order.taxAmount ?? 0),
    total: Number(order.totalAmount),
  };

  const shippingAddress: ReceiptAddress | null = order.shippingAddress
    ? {
        firstName: order.shippingAddress.firstName,
        lastName: order.shippingAddress.lastName,
        addressLine1: (order.shippingAddress as any).address1 ?? '',
        addressLine2: (order.shippingAddress as any).address2 ?? null,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        zipCode: order.shippingAddress.postalCode,
        country: order.shippingAddress.country,
        phone: order.shippingAddress.phone,
      }
    : null;

  const billingAddress: ReceiptAddress | null = billing
    ? {
        firstName: (billing as any).firstName,
        lastName: (billing as any).lastName,
        addressLine1: (billing as any).address1 ?? '',
        addressLine2: (billing as any).address2 ?? null,
        city: (billing as any).city,
        state: (billing as any).state,
        zipCode: (billing as any).postalCode,
        country: (billing as any).country,
        phone: (billing as any).phone,
      }
    : shippingAddress;

  const settings = await prisma.storeSettings.findFirst();
  const storeName = (settings as any)?.siteName ?? 'Online Store';

  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: (order as any).paymentMethod ?? null,
      createdAt: new Date(order.createdAt).toISOString(),
      shippedAt: order.shippedAt ? new Date(order.shippedAt).toISOString() : null,
      trackingNumber: (order as any).trackingNumber ?? null,
      customerNote: (order as any).notes ?? null,
    },
    customer: {
      id: order.user.id,
      email: order.user.email,
      firstName: order.user.firstName,
      lastName: order.user.lastName,
    },
    items,
    shippingAddress,
    billingAddress,
    totals,
    store: {
      name: storeName,
      address: (settings as any)?.address ?? undefined,
      email: (settings as any)?.email ?? undefined,
      url: env.FRONTEND_URL,
    },
    documentType: 'receipt',
  };
}
