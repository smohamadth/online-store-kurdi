import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { NotFoundError, AppError } from '../../middleware/errorHandler';

const router = Router();

// GET /api/users - Get all users (admin only)
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              reviews: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);

    res.json({
      status: 'success',
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Users can only view their own profile unless they're admin
    if (req.user?.id !== id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        addresses: true,
        _count: {
          select: {
            orders: true,
            reviews: true,
            wishlist: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    res.json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id - Update user
/**
 * Fields a user may change about THEMSELVES.
 *
 * `role` and `isActive` are deliberately absent: allowing them here would let
 * any customer PUT their own id with {"role":"admin"} and take over the store.
 */
const selfUpdateSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  phone: z.string().max(40).optional().nullable(),
  avatar: z.string().max(1000).optional().nullable(),
});

/** Admins may additionally change role and activation. */
const adminUpdateSchema = selfUpdateSchema.extend({
  role: z.enum(['customer', 'manager', 'admin']).optional(),
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
});

// PUT /api/users/:id - Update a user
//
// This previously destructured only { firstName, lastName, phone, avatar } from
// the body and passed them straight to prisma.update. An admin sending
// {"role":"manager"} or {"isActive":false} got HTTP 200 with a success payload
// while the change was silently DISCARDED - the fake-success bug class that has
// bitten this codebase repeatedly. The admin Users page could therefore never
// have worked, even though the endpoint "existed".
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const isAdmin = req.user?.role === 'admin';
    const isSelf = req.user?.id === id;

    if (!isSelf && !isAdmin) {
      throw new AppError('Forbidden', 403);
    }

    // Parse with the schema matching the caller's privileges. A non-admin
    // sending `role` gets a 400 naming the field rather than a silent drop.
    // adminUpdateSchema is a strict superset of selfUpdateSchema, so a
    // self-parse result (no role/isActive keys) is a valid narrower shape of
    // the same type - the guard rails below treat absent keys as "not sent".
    const parsed = (isAdmin
      ? adminUpdateSchema.parse(req.body)
      : selfUpdateSchema.parse(req.body)) as z.infer<typeof adminUpdateSchema>;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) throw new NotFoundError('User not found');

    // Guard rails against an admin locking everyone out of the store.
    if (isSelf && parsed.role && parsed.role !== target.role) {
      throw new AppError('You cannot change your own role.', 400);
    }
    if (isSelf && parsed.isActive === false) {
      throw new AppError('You cannot deactivate your own account.', 400);
    }

    // Demoting or deactivating the last active admin would leave the store
    // with no one able to administer it.
    const losesAdmin =
      target.role === 'admin' &&
      ((parsed.role && parsed.role !== 'admin') || parsed.isActive === false);

    if (losesAdmin) {
      const otherAdmins = await prisma.user.count({
        where: { role: 'admin', isActive: true, id: { not: id } },
      });
      if (otherAdmins === 0) {
        throw new AppError(
          'This is the last active admin. Promote another admin before changing this account.',
          400
        );
      }
    }

    // Only write keys the caller actually sent, so a partial update never
    // blanks unrelated columns.
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== undefined) data[k] = v;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError('No changes supplied.', 400);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true, reviews: true } },
      },
    });

    res.json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id/orders - Get user orders
router.get('/:id/orders', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    if (req.user?.id !== id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: { where: { isPrimary: true }, take: 1 },
                },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: { userId: id } }),
    ]);

    res.json({
      status: 'success',
      data: orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id/wishlist - Get user wishlist
router.get('/:id/wishlist', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user?.id !== id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const wishlist = await prisma.wishlistItem.findMany({
      where: { userId: id },
      include: {
        product: {
          include: {
            images: { where: { isPrimary: true }, take: 1 },
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: wishlist,
    });
  } catch (error) {
    next(error);
  }
});

export default router;