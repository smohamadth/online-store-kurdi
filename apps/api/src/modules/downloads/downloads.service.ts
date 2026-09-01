/**
 * Download service - everything that touches the DB.
 *
 * Two surfaces:
 *
 *  1. Order placement (mintDownloadForOrderItem): called from
 *     order.routes.ts when a digital line item is created. The
 *     customer gets a `ProductDownload` row with a fresh
 *     32-byte token and an optional expiry.
 *
 *  2. Redemption (redeemToken): called from the public
 *     /api/downloads/:token route. The route only needs the row
 *     and the source URL to 302 to; this function does the
 *     limit/expiry checks, increments the counter, and writes
 *     an audit row.
 *
 * The redeem function returns a discriminated union (`{ ok, ... }`
 * vs `{ ok: false, reason }`) so the route can pick the right
 * HTTP status without leaking internal state to the caller.
 */

import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import {
  generateDownloadToken,
  tokenStatus,
  computeExpiry,
  type TokenStatus,
} from './downloads.helpers';
import { logger } from '../../utils/logger';

export interface MintDownloadInput {
  orderItemId: string;
  /** The product-level `downloadUrl`. Snapshotted at order
   *  placement time so changing the product later doesn't
   *  invalidate the customer's existing downloads. */
  sourceUrl: string;
  /** Per-token expiry in days, copied from the product at
   *  order time. null = never expires. */
  expiryDays: number | null | undefined;
  /** Per-token download limit. Copied from the product /
   *  OrderItem at order time. null = unlimited. */
  downloadLimit: number | null | undefined;
  /** Order creation timestamp - stable so the same input always
   *  yields the same expiry. */
  purchaseDate: Date;
}

export interface MintedDownload {
  id: string;
  token: string;
  expiresAt: Date | null;
  downloadLimit: number | null;
  sourceUrl: string;
}

/** Create the per-purchase download row. Called once per
 *  digital line item at order-placement time. */
export async function mintDownloadForOrderItem(
  input: MintDownloadInput,
): Promise<MintedDownload> {
  const expiresAt = computeExpiry(input.expiryDays, input.purchaseDate);
  const token = generateDownloadToken();
  const row = await prisma.productDownload.create({
    data: {
      orderItemId: input.orderItemId,
      token,
      expiresAt,
      downloadCount: 0,
      downloadLimit: input.downloadLimit ?? null,
      sourceUrl: input.sourceUrl,
    },
  });
  logger.info(
    `Minted download token for orderItem=${input.orderItemId} ` +
    `id=${row.id} expiresAt=${expiresAt?.toISOString() ?? 'never'} ` +
    `limit=${input.downloadLimit ?? 'unlimited'}`,
  );
  return {
    id: row.id,
    token: row.token,
    expiresAt: row.expiresAt,
    downloadLimit: row.downloadLimit,
    sourceUrl: row.sourceUrl,
  };
}

export interface RedeemSuccess {
  ok: true;
  sourceUrl: string;
  /** Echo the row so the route can render a "X of Y downloads
   *  used" badge without a second query. */
  remaining: number;
  downloadCount: number;
  downloadLimit: number | null;
  expiresAt: Date | null;
  orderItemId: string;
  /** Order the token belongs to - used for the audit row. */
  orderId: string;
}

export interface RedeemFailure {
  ok: false;
  reason: 'not_found' | 'expired' | 'limit_exceeded' | 'product_limit_exceeded';
  status: TokenStatus;
}

export type RedeemResult = RedeemSuccess | RedeemFailure;

export interface RedeemContext {
  ipAddress?: string;
  userAgent?: string;
  userId?: string | null;
}

/**
 * Look up the token, check the limit/expiry, increment the
 * counter, write an audit row, and return the source URL.
 *
 * The function is atomic for the per-token counter: the DB
 * increment and the audit log write happen in a transaction
 * so a partial failure doesn't leave the counter incremented
 * without an audit trail (or vice-versa).
 */
export async function redeemToken(
  token: string,
  ctx: RedeemContext = {},
): Promise<RedeemResult> {
  const row = await prisma.productDownload.findUnique({
    where: { token },
    include: {
      orderItem: {
        select: {
          id: true,
          orderId: true,
          downloadCount: true,
          downloadLimit: true,
        },
      },
    },
  });
  if (!row) {
    return { ok: false, reason: 'not_found', status: { ok: false, reason: 'not_found' } };
  }
  const status = tokenStatus({
    downloadCount: row.downloadCount,
    downloadLimit: row.downloadLimit,
    expiresAt: row.expiresAt,
    productDownloadCount: row.orderItem?.downloadCount,
    productDownloadLimit: row.orderItem?.downloadLimit,
  });
  if (!status.ok) {
    await prisma.downloadLog.create({
      data: {
        downloadId: row.id,
        orderItemId: row.orderItemId,
        userId: ctx.userId ?? null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        status: status.reason ?? 'not_found',
      },
    });
    return { ok: false, reason: status.reason ?? 'not_found', status };
  }

  // Atomic increment + audit. Prisma's $transaction runs both
  // updates in a single transaction so the counter and the
  // log row always agree.
  const updated = await prisma.$transaction(async (tx: any) => {
    const next = await tx.productDownload.update({
      where: { id: row.id },
      data: {
        downloadCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
    // The product-level counter is incremented for symmetry
    // with the legacy single-URL flow. Callers that use the
    // per-order token get both incremented; legacy callers
    // (no per-order token) only bump the product counter.
    if (row.orderItem) {
      await tx.orderItem.update({
        where: { id: row.orderItemId },
        data: { downloadCount: { increment: 1 } },
      });
    }
    await tx.downloadLog.create({
      data: {
        downloadId: row.id,
        orderItemId: row.orderItemId,
        userId: ctx.userId ?? null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        status: 'success',
      },
    });
    return next;
  });

  const remaining = (row.downloadLimit ?? Infinity) - updated.downloadCount;
  return {
    ok: true,
    sourceUrl: row.sourceUrl,
    remaining: remaining === Infinity ? Infinity : Math.max(0, remaining),
    downloadCount: updated.downloadCount,
    downloadLimit: row.downloadLimit,
    expiresAt: row.expiresAt,
    orderItemId: row.orderItemId,
    orderId: row.orderItem?.orderId ?? '',
  };
}

/** Public shape of a download entry, suitable for the
 *  /account/downloads page. */
export interface DownloadableItem {
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  productId: string;
  productName: string;
  productSlug: string;
  purchasedAt: Date;
  /** The most recent token - clicking "Download" uses this. */
  token: string;
  expiresAt: Date | null;
  downloadCount: number;
  downloadLimit: number | null;
  sourceUrl: string;
}

/** List every digital order-item owned by the user, joined to
 *  its ProductDownload row. Returns an empty array if the user
 *  has no digital purchases. */
export async function listUserDownloads(userId: string): Promise<DownloadableItem[]> {
  const rows = await prisma.orderItem.findMany({
    where: {
      order: { userId },
      // Only digital products. The product type lives on Product,
      // and OrderItem.downloadUrl is the canonical "this line is
      // digital" marker - an item without a downloadUrl is a
      // physical product even if the product was later changed.
      downloadUrl: { not: null },
    },
    include: {
      product: { select: { id: true, name: true, slug: true, type: true } },
      order: { select: { orderNumber: true, userId: true, createdAt: true } },
      downloads: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { id: 'desc' },
  });
  return rows
    .filter((r: any) => r.product?.type === 'digital' && r.order?.userId === userId)
    .map((r: any) => ({
      orderId: r.orderId,
      orderNumber: r.order.orderNumber,
      orderItemId: r.id,
      productId: r.product.id,
      productName: r.product.name,
      productSlug: r.product.slug,
      purchasedAt: r.order.createdAt,
      // Per-order token (preferred). Fall back to the legacy
      // product-level URL if the order predates the token
      // system.
      token: r.downloads[0]?.token ?? '',
      expiresAt: r.downloads[0]?.expiresAt ?? null,
      downloadCount: r.downloads[0]?.downloadCount ?? 0,
      downloadLimit: r.downloads[0]?.downloadLimit ?? r.downloadLimit ?? null,
      sourceUrl: r.downloads[0]?.sourceUrl ?? r.downloadUrl ?? '',
    }));
}

/** Get a single download by id. Used by the order detail page
 *  to show "Download" buttons for each digital line. */
export async function getDownloadById(id: string) {
  return prisma.productDownload.findUnique({
    where: { id },
    include: {
      orderItem: {
        select: {
          id: true,
          orderId: true,
          order: { select: { id: true, userId: true, orderNumber: true } },
          product: { select: { id: true, name: true, slug: true, type: true } },
        },
      },
    },
  });
}
