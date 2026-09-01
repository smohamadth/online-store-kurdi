/**
 * Download routes - public + auth split.
 *
 *   GET  /api/downloads/:token                  (public)
 *        Customer hits this with a 32-byte token. On success
 *        we 302 to the source URL. On expired/limit/not-found
 *        we throw an AppError that the error handler turns
 *        into 410/429/404.
 *
 *   GET  /api/account/downloads                  (auth)
 *        Lists every digital purchase the current user has
 *        access to. Drives the /account/downloads page.
 *
 *   GET  /api/account/downloads/:id              (auth)
 *        Single download row, used by the order detail
 *        page's "Download" button.
 *
 *   GET  /api/orders/:id/items/:itemId/download  (auth, mounted separately)
 *        Convenience endpoint: returns the customer's
 *        download token for a specific order item.
 *
 * The four routers are split into separate exports so the
 * app can mount each at the path that makes sense. Combining
 * them in a single router causes a collision between
 * /downloads (this file) and the /products/:id mounted at the
 * same prefix.
 */

import { Router } from 'express';
import { authenticate, optionalAuth } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import {
  redeemToken,
  listUserDownloads,
  getDownloadById,
} from './downloads.service';

/** Public router mounted at /api/downloads. */
export const publicDownloadsRouter = Router();

/**
 * Public download endpoint. The token is the credential.
 *
 * Returns:
 *   - 302 Found + Location header (the source URL) on success
 *   - 410 Gone if the token has expired
 *   - 429 Too Many Requests if the per-token OR per-product
 *     limit has been hit
 *   - 404 Not Found if the token doesn't exist
 */
publicDownloadsRouter.get('/:token', optionalAuth, async (req, res, next) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) {
      throw new AppError('Invalid download link', 400);
    }
    const result = await redeemToken(token, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      userId: (req as any).user?.id ?? null,
    });
    if (!result.ok) {
      const status =
        result.reason === 'expired' ? 410 :
        result.reason === 'limit_exceeded' || result.reason === 'product_limit_exceeded' ? 429 :
        result.reason === 'unpaid' ? 402 :
        404;
      throw new AppError(
        result.reason === 'not_found' ? 'Download link not found' :
        result.reason === 'expired' ? 'This download link has expired' :
        result.reason === 'limit_exceeded' ? 'Download limit reached' :
        result.reason === 'unpaid' ? 'This download becomes available once the order is paid.' :
        'Product download limit reached',
        status,
      );
    }
    res.redirect(302, result.sourceUrl);
  } catch (err) {
    next(err);
  }
});

/** Account-scoped router mounted at /api/account. Handles
 *  /downloads and /downloads/:id. */
export const accountDownloadsRouter = Router();

accountDownloadsRouter.get('/downloads', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const items = await listUserDownloads(userId);
    res.json({ status: 'success', data: items });
  } catch (err) {
    next(err);
  }
});

accountDownloadsRouter.get('/downloads/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const id = req.params.id;
    const row = await getDownloadById(id);
    if (!row) throw new AppError('Download not found', 404);
    if (row.orderItem?.order?.userId !== userId) {
      throw new AppError('Not authorised', 403);
    }
    res.json({
      status: 'success',
      data: {
        id: row.id,
        token: row.token,
        expiresAt: row.expiresAt,
        downloadCount: row.downloadCount,
        downloadLimit: row.downloadLimit,
        sourceUrl: row.sourceUrl,
        orderItemId: row.orderItemId,
        orderNumber: row.orderItem?.order?.orderNumber,
        productName: row.orderItem?.product?.name,
        productSlug: row.orderItem?.product?.slug,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Order-scoped router mounted at /api/orders. Handles
 *  /:orderId/items/:itemId/download. The default export is the
 *  /api/downloads router for backward compatibility with any
 *  tests that import it directly. */
export const orderItemDownloadRouter = Router();

orderItemDownloadRouter.get('/:orderId/items/:itemId/download', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { orderId, itemId } = req.params;
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      include: {
        order: { select: { userId: true } },
        downloads: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!item) throw new AppError('Order item not found', 404);
    if (item.order.userId !== userId) {
      throw new AppError('Not authorised', 403);
    }
    const download = item.downloads[0];
    if (!download) {
      throw new AppError('No download link for this item', 404);
    }
    res.json({
      status: 'success',
      data: {
        id: download.id,
        token: download.token,
        expiresAt: download.expiresAt,
        downloadCount: download.downloadCount,
        downloadLimit: download.downloadLimit,
        sourceUrl: download.sourceUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Default export: the public router. Tests and the app's
// /api mount use this. Mounting the public router at
// /api/downloads is the only sensible choice - /api/account
// and /api/orders already exist.
export default publicDownloadsRouter;
