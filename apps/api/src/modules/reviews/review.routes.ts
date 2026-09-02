import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { parsePagination } from '../../utils/pagination';
import {
  hasPurchasingOrder,
  normaliseReviewPhotos,
  orderReviewPhotos,
} from './reviews.helpers';

/**
 * Customer reviews.
 *
 * What's here:
 *   - List / create / update / delete product reviews
 *   - Admin moderation queue (`GET /api/reviews`)
 *   - Current-user reviews (`GET /api/users/me/reviews`)
 *
 * What's new in this revision:
 *   - Reviews may carry up to N photos (URLs) supplied at create
 *     time. Photos are persisted in a sibling `ReviewPhoto` table
 *     and returned with the review on every read.
 *   - The `isVerified` field is no longer set blindly. The route
 *     looks up the reviewer's orders, and only flips the badge
 *     on if they have a non-cancelled / non-refunded order
 *     containing the product. The pure helper lives in
 *     `./reviews.helpers.ts` so the logic is unit-testable.
 */

const router = Router();

/**
 * Lookup a user's orders for a product, narrowed to the columns
 * we need to decide the verified badge. Single round-trip;
 * returns the rows the helper expects (status + nested items).
 *
 * We don't pre-filter cancelled / refunded orders here because
 * the mock prisma doesn't support the `notIn` operator; the
 * helper's own `isPurchasingStatus` filter does the same job
 * (and the constant list is the source of truth for what
 * "purchasing" means).
 */
async function loadUserOrdersForProduct(userId: string, productId: string) {
  // We use `include` (not `select`) for the items so the mock
  // prisma populates `row.items`. The helper then filters by
  // productId again on the client; doing the second filter in
  // JS rather than SQL is fine for the small result set this
  // query returns.
  return prisma.order.findMany({
    where: {
      userId,
      items: { some: { productId } },
    },
    include: {
      items: { where: { productId } },
    },
  });
}

// GET /api/products/:productId/reviews - Get reviews for a product
router.get('/products/:productId/reviews', async (req, res, next) => {
  try {
    const { productId } = req.params;

    const reviews = await prisma.review.findMany({
      where: {
        productId,
        isApproved: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        // Photos ride along with every review read. The
        // storefront grid is sorted client-side by sortOrder.
        photos: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Coerce missing `photos` to [] so the storefront can
    // always iterate the array.
    const data = reviews.map((r) => ({ ...r, photos: r.photos || [] }));

    res.json({
      status: 'success',
      data,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:productId/reviews - Add a review
router.post('/products/:productId/reviews', authenticate, async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment, photos: rawPhotos } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Validate rating. Accept a number or a canonical integer string
    // ('4' ok, '4.5' / 'abc' / {} / null not), anything else used to
    // sail past the loose guard and 500 on the Int column (3.5), or get
    // silently mangled ('abc' → NaN, '4.5' → 4).
    const numericRating =
      typeof rating === 'number'
        ? rating
        : typeof rating === 'string' && /^-?\d+$/.test(rating.trim())
          ? parseInt(rating, 10)
          : NaN;
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating must be between 1 and 5',
      });
    }

    // Cap the free-text fields: unbounded title/comment is DB bloat.
    if (
      (title !== undefined && (typeof title !== 'string' || title.length > 200)) ||
      (comment !== undefined && (typeof comment !== 'string' || comment.length > 5000))
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Title must be under 200 characters and comment under 5000',
      });
    }

    // Validate the photos payload (cap, schema, url required).
    // We do this BEFORE the product lookup so an obvious 400
    // isn't hidden behind a 404.
    const normalised = normaliseReviewPhotos(rawPhotos);
    if (!normalised.ok) {
      return res.status(400).json({
        status: 'error',
        message: normalised.error,
      });
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found',
      });
    }

    // Check if user already reviewed this product
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingReview) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reviewed this product',
      });
    }

    // Verified-purchaser lookup. The orders query is filtered
    // down to "in a purchasing state" so the helper only has
    // to confirm the user owns one of them, but we keep the
    // helper's own filter as a defence-in-depth check.
    const userOrders = await loadUserOrdersForProduct(userId, productId);
    const isVerified = hasPurchasingOrder(userOrders, productId);

    // Create review + photos in a single transaction so we
    // never end up with a review row and zero photo rows when
    // the photo insert fails. Prisma's `create` with nested
    // `photos.createMany` is supported on the mock too.
    const review = await prisma.review.create({
      data: {
        userId,
        productId,
        rating: numericRating,
        title: title || null,
        comment: comment || null,
        isVerified,
        // Reviews enter the moderation queue by default. Previously every
        // review was created with isApproved: true, which published all
        // reviews instantly and made the admin moderation queue pointless
        // (and let a customer effectively self-approve their own review).
        // Set REVIEWS_AUTO_APPROVE=true to restore auto-publishing.
        isApproved: process.env.REVIEWS_AUTO_APPROVE === 'true',
        photos: {
          create: normalised.photos.map((p, i) => ({
            url: p.url,
            thumbnail: p.thumbnail,
            sortOrder: p.sortOrder ?? i,
          })),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });

    logger.info(
      `Review created for product ${productId} by user ${userId} ` +
        `(verified=${isVerified}, photos=${(review.photos || []).length})`,
    );

    res.status(201).json({
      status: 'success',
      // Coerce `photos` to [] when the relation is empty so the
      // storefront can always treat it as an array. The mock
      // prisma leaves the key off the row when there are no
      // photos; real prisma returns an empty array.
      data: { ...review, photos: review.photos || [] },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/reviews/:reviewId - Update a review
router.put('/reviews/:reviewId', authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { rating, title, comment, isApproved, photos: rawPhotos } = req.body;
    const userId = req.user?.id;
    const isModerator = req.user?.role === 'admin' || req.user?.role === 'manager';

    // Find review
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found',
      });
    }

    // Check ownership
    if (review.userId !== userId && !isModerator) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this review',
      });
    }

    // If the request replaces the photo set, validate the
    // payload first. An empty array (or missing key) is
    // treated as "no change"; an explicit `[]` is "remove all".
    let replacementPhotos: Array<{ url: string; thumbnail: string | null; sortOrder: number }> | undefined;
    if (rawPhotos !== undefined) {
      const normalised = normaliseReviewPhotos(rawPhotos);
      if (!normalised.ok) {
        return res.status(400).json({
          status: 'error',
          message: normalised.error,
        });
      }
      // The mock prisma's `update` doesn't honour nested
      // `photos: { create: [...] }`, so we delete + re-insert
      // by hand. Real prisma supports the nested write, so on
      // production this is two queries that could be one.
      await prisma.reviewPhoto.deleteMany({ where: { reviewId } });
      replacementPhotos = normalised.photos;
    }

    // Same rating gate as create: only 1..5 integers (number or numeric
    // string). The old `rating ? parseInt(rating) : undefined` silently
    // dropped a 0 or 'abc' (and a 3.5 became 3).
    const numericRating =
      rating === undefined
        ? undefined
        : typeof rating === 'number'
          ? rating
          : typeof rating === 'string' && /^-?\d+$/.test(rating.trim())
            ? parseInt(rating, 10)
            : NaN;
    // Narrow on `numericRating` itself rather than on `rating`: the two are
    // only linked by the ternary above, which the compiler cannot follow.
    if (numericRating !== undefined && (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5)) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating must be between 1 and 5',
      });
    }
    if (
      (title !== undefined && (typeof title !== 'string' || title.length > 200)) ||
      (comment !== undefined && (typeof comment !== 'string' || comment.length > 5000))
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Title must be under 200 characters and comment under 5000',
      });
    }

    // The verified badge is recomputed only when the rating
    // changes. Otherwise a typo in the comment shouldn't flip
    // the badge. (Order history doesn't change, so we don't
    // need to recompute on every edit.)
    let isVerified = review.isVerified;
    if (rating !== undefined && numericRating !== review.rating) {
      const userOrders = await loadUserOrdersForProduct(review.userId, review.productId);
      isVerified = hasPurchasingOrder(userOrders, review.productId);
    }

    // Update review
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        rating: numericRating,
        title: title !== undefined ? title : undefined,
        comment: comment !== undefined ? comment : undefined,
        isVerified,
        // Moderation flag. Only admins/managers may change it - previously this
        // field was ignored entirely, so the admin UI reported success while the
        // approval silently never persisted.
        isApproved:
          isApproved !== undefined && isModerator ? Boolean(isApproved) : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });

    // If the request replaced the photo set, insert the new
    // rows now (the update above didn't because the mock
    // prisma doesn't honour nested writes). Real prisma would
    // do this in a single transaction; on production this
    // would move into a `$transaction` call.
    if (replacementPhotos !== undefined) {
      for (const p of replacementPhotos) {
        await prisma.reviewPhoto.create({
          data: {
            reviewId,
            url: p.url,
            thumbnail: p.thumbnail,
            sortOrder: p.sortOrder,
          },
        });
      }
    }

    // Re-query the photos directly. Reading the rows
    // directly is the source of truth.
    const photos = await prisma.reviewPhoto.findMany({
      where: { reviewId },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({
      status: 'success',
      data: { ...updatedReview, photos },
    });
  } catch (err) {
    next(err);
  }
});
router.delete('/reviews/:reviewId', authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.id;

    // Find review
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found',
      });
    }

    // Check ownership or admin
    if (review.userId !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this review',
      });
    }

    // Delete review
    await prisma.review.delete({
      where: { id: reviewId },
    });

    logger.info(`Review ${reviewId} deleted`);

    res.json({
      status: 'success',
      message: 'Review deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me/reviews - Get current user's reviews
router.get('/users/me/reviews', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const reviews = await prisma.review.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        photos: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response. The mock prisma leaves `photos` off the
    // row when the relation is empty (it only sets the key when
    // there's at least one matching child), so we default to []
    // before handing the array to `orderReviewPhotos`.
    const formattedReviews = reviews.map(review => ({
      id: review.id,
      productId: review.productId,
      productName: review.product.name,
      productSlug: review.product.slug,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      isVerified: review.isVerified,
      isApproved: review.isApproved,
      createdAt: review.createdAt,
      photos: orderReviewPhotos((review.photos || []) as any[]),
    }));

    res.json({
      status: 'success',
      data: formattedReviews,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reviews - List every review (admin moderation queue).
// The admin UI previously fetched all products and then issued one request per
// product to collect reviews (an N+1 that also missed reviews on page 2+).
router.get('/reviews', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, {
      limit: 50,
      maxLimit: 200,
    });
    const { status } = req.query as { status?: string };

    const where: any = {};
    if (status === 'approved') where.isApproved = true;
    if (status === 'pending') where.isApproved = false;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          product: { select: { id: true, name: true, slug: true } },
          photos: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.review.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: reviews.map((r) => ({ ...r, photos: r.photos || [] })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
