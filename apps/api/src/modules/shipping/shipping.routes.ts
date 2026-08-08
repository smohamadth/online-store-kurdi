import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
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
  baseRate: z.number().min(0),
  weightUnitRate: z.number().min(0).optional(),
  minWeight: z.number().min(0).optional(),
  maxWeight: z.number().min(0).optional(),
  pricePercentage: z.number().min(0).max(100).optional(),
  minOrderAmount: z.number().min(0).optional(),
  maxOrderAmount: z.number().min(0).optional(),
  itemCountRate: z.number().min(0).optional(),
  freeShippingThreshold: z.number().min(0).optional(),
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

// POST /api/shipping/calculate - Calculate shipping rates
router.post('/calculate', async (req, res, next) => {
  try {
    const { country, state, zipCode, subtotal, weight, itemCount } = req.body;

    if (!country) {
      return res.status(400).json({
        status: 'error',
        message: 'Country is required',
      });
    }

    // Find matching shipping zones
    const zones = await prisma.shippingZone.findMany({
      where: { isActive: true },
      include: {
        methods: {
          where: { isActive: true },
        },
      },
    });

    const matchingMethods: any[] = [];

    for (const zone of zones) {
      const countries = JSON.parse(zone.countries as string || '[]');
      const states = JSON.parse(zone.states as string || '[]');
      const zipCodes = JSON.parse(zone.zipCodes as string || '[]');

      // Check if address matches zone
      const countryMatch = countries.includes(country) || countries.includes('*');
      const stateMatch = states.length === 0 || states.includes(state) || states.includes('*');
      const zipMatch = zipCodes.length === 0 || zipCodes.some((z: string) => zipCode?.startsWith(z));

      if (countryMatch && stateMatch && zipMatch) {
        for (const method of zone.methods) {
          let rate = Number(method.baseRate);
          let isFree = false;

          // Calculate rate based on type
          switch (method.type) {
            case 'flat':
              // Flat rate - already set
              break;

            case 'weight':
              if (method.weightUnitRate && weight) {
                rate = Number(method.baseRate) + (weight * Number(method.weightUnitRate));
              }
              break;

            case 'price':
              if (method.pricePercentage && subtotal) {
                rate = (subtotal * Number(method.pricePercentage)) / 100;
                if (method.minOrderAmount && subtotal < Number(method.minOrderAmount)) {
                  continue; // Skip if below minimum
                }
                if (method.maxOrderAmount && subtotal > Number(method.maxOrderAmount)) {
                  continue; // Skip if above maximum
                }
              }
              break;

            case 'item_count':
              if (method.itemCountRate && itemCount) {
                rate = Number(method.baseRate) + (itemCount * Number(method.itemCountRate));
              }
              break;
          }

          // Check free shipping threshold
          if (method.freeShippingThreshold && subtotal >= Number(method.freeShippingThreshold)) {
            rate = 0;
            isFree = true;
          }

          matchingMethods.push({
            id: method.id,
            name: method.name,
            description: method.description,
            type: method.type,
            rate: Math.round(rate * 100) / 100,
            isFree,
            minDeliveryDays: method.minDeliveryDays,
            maxDeliveryDays: method.maxDeliveryDays,
            zone: {
              id: zone.id,
              name: zone.name,
            },
          });
        }
      }
    }

    // Sort by rate
    matchingMethods.sort((a, b) => a.rate - b.rate);

    res.json({
      status: 'success',
      data: matchingMethods,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/shipping/zones/lookup - Find zone for address
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