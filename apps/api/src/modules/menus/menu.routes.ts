import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const menuSchema = z.object({
  name: z.string().min(1).max(100),
  location: z.enum(['header', 'footer', 'sidebar']),
  isActive: z.boolean().optional(),
});

const menuItemSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().min(1).max(500),
  icon: z.string().max(50).optional().nullable(),
  target: z.enum(['_self', '_blank']).default('_self'),
  parentId: z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/menus - Get all menus (admin)
router.get('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const menus = await prisma.menu.findMany({
      include: {
        items: {
          where: { parentId: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'success',
      data: menus,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/menus/location/:location - Get menu by location (public)
router.get('/location/:location', async (req, res, next) => {
  try {
    const { location } = req.params;

    const menu = await prisma.menu.findFirst({
      where: { location, isActive: true },
      include: {
        items: {
          where: { parentId: null, isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!menu) {
      return res.json({
        status: 'success',
        data: null,
      });
    }

    res.json({
      status: 'success',
      data: menu,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/menus/:id - Get menu by ID (admin)
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const menu = await prisma.menu.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!menu) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu not found',
      });
    }

    res.json({
      status: 'success',
      data: menu,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/menus - Create menu (admin)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = menuSchema.parse(req.body);

    // Check if menu name exists
    const existing = await prisma.menu.findUnique({ where: { name: data.name } });
    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'Menu with this name already exists',
      });
    }

    const menu = await prisma.menu.create({
      data,
      include: { _count: { select: { items: true } } },
    });

    logger.info(`Menu created: ${menu.name}`);

    res.status(201).json({
      status: 'success',
      data: menu,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/menus/:id - Update menu (admin)
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = menuSchema.partial().parse(req.body);

    const existing = await prisma.menu.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu not found',
      });
    }

    const menu = await prisma.menu.update({
      where: { id },
      data,
      include: { _count: { select: { items: true } } },
    });

    logger.info(`Menu updated: ${menu.name}`);

    res.json({
      status: 'success',
      data: menu,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/menus/:id - Delete menu (admin)
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const menu = await prisma.menu.findUnique({ where: { id } });
    if (!menu) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu not found',
      });
    }

    await prisma.menu.delete({ where: { id } });

    logger.info(`Menu deleted: ${menu.name}`);

    res.json({
      status: 'success',
      message: 'Menu deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/menus/:id/items - Add menu item (admin)
router.post('/:id/items', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = menuItemSchema.parse(req.body);

    const menu = await prisma.menu.findUnique({ where: { id } });
    if (!menu) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu not found',
      });
    }

    // If parentId provided, verify it belongs to same menu
    if (data.parentId) {
      const parent = await prisma.menuItem.findFirst({
        where: { id: data.parentId, menuId: id },
      });
      if (!parent) {
        return res.status(400).json({
          status: 'error',
          message: 'Parent item not found in this menu',
        });
      }
    }

    // Get max sortOrder if not provided
    if (data.sortOrder === undefined) {
      const maxOrder = await prisma.menuItem.findFirst({
        where: { menuId: id, parentId: data.parentId || null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      data.sortOrder = (maxOrder?.sortOrder || 0) + 1;
    }

    const item = await prisma.menuItem.create({
      data: {
        menuId: id,
        label: data.label,
        url: data.url,
        icon: data.icon,
        target: data.target,
        parentId: data.parentId,
        sortOrder: data.sortOrder,
        isActive: data.isActive ?? true,
      },
    });

    logger.info(`Menu item added: ${item.label} to menu ${menu.name}`);

    res.status(201).json({
      status: 'success',
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/menus/items/:itemId - Update menu item (admin)
router.put('/items/:itemId', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const data = menuItemSchema.partial().parse(req.body);

    const existing = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu item not found',
      });
    }

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data,
    });

    logger.info(`Menu item updated: ${item.label}`);

    res.json({
      status: 'success',
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/menus/items/:itemId - Delete menu item (admin)
router.delete('/items/:itemId', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const item = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu item not found',
      });
    }

    await prisma.menuItem.delete({ where: { id: itemId } });

    logger.info(`Menu item deleted: ${item.label}`);

    res.json({
      status: 'success',
      message: 'Menu item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/menus/:id/items/reorder - Reorder menu items (admin)
router.put('/:id/items/reorder', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({
        status: 'error',
        message: 'Items array is required',
      });
    }

    // Update sort order for each item
    for (const item of items) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      });
    }

    logger.info(`Menu items reordered for menu ${id}`);

    res.json({
      status: 'success',
      message: 'Menu items reordered successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
