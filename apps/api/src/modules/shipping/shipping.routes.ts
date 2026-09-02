// ---------------------------------------------------------------------------
// Shipping: admin CRUD for zones + methods, and the public rate
// calculator the checkout calls.
//
// Zones match an address by country (always), then optionally a state
// list and/or a zip prefix. Methods attach to a zone and price by one of
// four types: flat (baseRate), weight (base + weightUnitRate x weight),
// price (base + pricePercentage% of the order), or item_count
// (base + baseRate per item); min/max weight and min/max order amount
// act as availability gates.
//
// Like tax, calculate is advisory (drives the checkout display); order
// placement recomputes the chosen method's rate server-side via
// shipping.service (see order.routes.ts), so the client's
// shippingAmount is never trusted.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { calculateShippingForOrder } from './shipping.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const shippingZoneSchema = z.object({
  name: z.string().min(1).max(255),
  countries: z.array(z.string()).min(1),
  states: z.array(z.string()).optional(),
  zipCodes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const shippingMethodSchema = z.object({
  zoneId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['flat', 'weight', 'price', 'item_count']),
  baseRate: z.number().min(0).finite(),
  weightUnitRate: z.number().min(0).finite().optional(),
  minWeight: z.number().min(0).finite().optional(),
  maxWeight: z.number().min(0).finite().optional(),
  pricePercentage: z.number().min(0).max(100).optional(),
  minOrderAmount: z.number().min(0).finite().optional(),
  maxOrderAmount: z.number().min(0).finite().optional(),
  itemCountRate: z.number().min(0).finite().optional(),
  freeShippingThreshold: z.number().min(0).finite().optional(),
  minDeliveryDays: z.number().int().min(1).optional(),
  maxDeliveryDays: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// ============================================
// SHIPPING ZONES
// ============================================

// GET /api/shipping/zones - Get all shipping zones
router.get('/zones', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const zones = await prisma.shippingZone.findMany({
      include: {
        methods: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({
      status: 'success',
      data: zones,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/shipping/zones - Create shipping zone
router.post('/zones', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = shippingZoneSchema.parse(req.body);

    const zone = await prisma.shippingZone.create({
      data: {
        ...validatedData,
        countries: JSON.stringify(validatedData.countries),
        states: JSON.stringify(validatedData.states || []),
        zipCodes: JSON.stringify(validatedData.zipCodes || []),
      },
      include: { methods: true },
    });

    logger.info(`Shipping zone created: ${zone.name}`);

    res.status(201).json({
      status: 'success',
      data: zone,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/shipping/zones/:id - Update shipping zone
router.put('/zones/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = shippingZoneSchema.parse(req.body);

    const zone = await prisma.shippingZone.update({
      where: { id },
      data: {
        ...validatedData,
        countries: JSON.stringify(validatedData.countries),
        states: JSON.stringify(validatedData.states || []),
        zipCodes: JSON.stringify(validatedData.zipCodes || []),
      },
      include: { methods: true },
    });

    logger.info(`Shipping zone updated: ${zone.name}`);

    res.json({
      status: 'success',
      data: zone,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shipping/zones/:id - Delete shipping zone
router.delete('/zones/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if zone has methods
    const methodsCount = await prisma.shippingMethod.count({
      where: { zoneId: id },
    });

    if (methodsCount > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete zone with shipping methods. Delete methods first.',
      });
    }

    await prisma.shippingZone.delete({ where: { id } });

    logger.info(`Shipping zone deleted: ${id}`);

    res.json({
      status: 'success',
      message: 'Zone deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// SHIPPING METHODS
// ============================================

// GET /api/shipping/methods - Get all shipping methods
router.get('/methods', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const zoneId = req.query.zoneId as string;

    const where: any = {};
    if (zoneId) where.zoneId = zoneId;

    const methods = await prisma.shippingMethod.findMany({
      where,
      include: {
        zone: {
          select: { id: true, name: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({
      status: 'success',
      data: methods,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/shipping/methods - Create shipping method
router.post('/methods', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = shippingMethodSchema.parse(req.body);

    const method = await prisma.shippingMethod.create({
      data: validatedData,
      include: { zone: true },
    });

    logger.info(`Shipping method created: ${method.name}`);

    res.status(201).json({
      status: 'success',
      data: method,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/shipping/methods/:id - Update shipping method
router.put('/methods/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = shippingMethodSchema.partial().parse(req.body);

    const method = await prisma.shippingMethod.update({
      where: { id },
      data: validatedData,
      include: { zone: true },
    });

    logger.info(`Shipping method updated: ${method.name}`);

    res.json({
      status: 'success',
      data: method,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shipping/methods/:id - Delete shipping method
router.delete('/methods/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.shippingMethod.delete({ where: { id } });

    logger.info(`Shipping method deleted: ${id}`);

    res.json({
      status: 'success',
      message: 'Method deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// SHIPPING CALCULATION
// ============================================

// POST /api/shipping/calculate - Calculate shipping rates (advisory; order
// placement recomputes the same numbers server-side via shipping.service).
// authz-ok: guest checkout must quote shipping before login
router.post('/calculate', async (req, res, next) => {
  try {
    const { country, state, zipCode, subtotal, weight, itemCount } = req.body;

    if (!country) {
      return res.status(400).json({
        status: 'error',
        message: 'Country is required',
      });
    }

    const methods = await calculateShippingForOrder({
      country,
      state,
      zipCode,
      subtotal: Number(subtotal || 0),
      weight: Number(weight || 0),
      itemCount: Number(itemCount || 0),
    });

    res.json({
      status: 'success',
      data: methods,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/shipping/zones/lookup - Find the zones matching an address
// authz-ok: guest checkout zone lookup
router.post('/zones/lookup', async (req, res, next) => {
  try {
    const { country, state, zipCode } = req.body;

    const zones = await prisma.shippingZone.findMany({
      where: { isActive: true },
    });

    for (const zone of zones) {
      const countries = JSON.parse(zone.countries as string || '[]');
      const states = JSON.parse(zone.states as string || '[]');
      const zipCodes = JSON.parse(zone.zipCodes as string || '[]');

      const countryMatch = countries.includes(country) || countries.includes('*');
      const stateMatch = states.length === 0 || states.includes(state) || states.includes('*');
      const zipMatch = zipCodes.length === 0 || zipCodes.some((z: string) => zipCode?.startsWith(z));

      if (countryMatch && stateMatch && zipMatch) {
        return res.json({
          status: 'success',
          data: zone,
        });
      }
    }

    res.json({
      status: 'success',
      data: null,
      message: 'No matching zone found',
    });
  } catch (err) {
    next(err);
  }
});

export default router;