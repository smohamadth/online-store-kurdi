import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const taxRateSchema = z.object({
  name: z.string().min(1).max(255),
  rate: z.number().min(0).max(1), // 0.1 = 10%
  country: z.string().min(2).max(2),
  state: z.string().optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  taxClass: z.string().optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const taxClassSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

// ============================================
// TAX RATES
// ============================================

// GET /api/tax/rates - Get all tax rates
router.get('/rates', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const country = req.query.country as string;
    const taxClass = req.query.taxClass as string;

    const where: any = {};
    if (country) where.country = country;
    if (taxClass) where.taxClass = taxClass;

    const rates = await prisma.taxRate.findMany({
      where,
      orderBy: [
        { country: 'asc' },
        { state: 'asc' },
        { priority: 'desc' },
      ],
    });

    res.json({
      status: 'success',
      data: rates,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tax/rates - Create tax rate
router.post('/rates', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = taxRateSchema.parse(req.body);

    const rate = await prisma.taxRate.create({
      data: validatedData,
    });

    logger.info(`Tax rate created: ${rate.name} (${(Number(rate.rate) * 100).toFixed(1)}%)`);

    res.status(201).json({
      status: 'success',
      data: rate,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/tax/rates/:id - Update tax rate
router.put('/rates/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = taxRateSchema.partial().parse(req.body);

    const rate = await prisma.taxRate.update({
      where: { id },
      data: validatedData,
    });

    logger.info(`Tax rate updated: ${rate.name}`);

    res.json({
      status: 'success',
      data: rate,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tax/rates/:id - Delete tax rate
router.delete('/rates/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.taxRate.delete({ where: { id } });

    logger.info(`Tax rate deleted: ${id}`);

    res.json({
      status: 'success',
      message: 'Tax rate deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// TAX CLASSES
// ============================================

// GET /api/tax/classes - Get all tax classes
router.get('/classes', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const classes = await prisma.taxClass.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'success',
      data: classes,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tax/classes - Create tax class
router.post('/classes', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = taxClassSchema.parse(req.body);

    // If setting as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.taxClass.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const taxClass = await prisma.taxClass.create({
      data: validatedData,
    });

    logger.info(`Tax class created: ${taxClass.name}`);

    res.status(201).json({
      status: 'success',
      data: taxClass,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/tax/classes/:id - Update tax class
router.put('/classes/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = taxClassSchema.partial().parse(req.body);

    // If setting as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.taxClass.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const taxClass = await prisma.taxClass.update({
      where: { id },
      data: validatedData,
    });

    logger.info(`Tax class updated: ${taxClass.name}`);

    res.json({
      status: 'success',
      data: taxClass,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tax/classes/:id - Delete tax class
router.delete('/classes/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if tax class has products
    const productsCount = await prisma.product.count({
      where: { taxClassId: id },
    });

    if (productsCount > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot delete tax class with ${productsCount} products. Reassign products first.`,
      });
    }

    await prisma.taxClass.delete({ where: { id } });

    logger.info(`Tax class deleted: ${id}`);

    res.json({
      status: 'success',
      message: 'Tax class deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// TAX CALCULATION
// ============================================

// POST /api/tax/calculate - Calculate tax for order
router.post('/calculate', async (req, res, next) => {
  try {
    const { country, state, city, zipCode, subtotal, items } = req.body;

    if (!country) {
      return res.status(400).json({
        status: 'error',
        message: 'Country is required',
      });
    }

    // Find all matching tax rates for the location
    const taxRates = await prisma.taxRate.findMany({
      where: {
        isActive: true,
        country: country,
      },
      orderBy: { priority: 'desc' },
    });

    // Function to find the best matching tax rate for a location
    const findTaxRate = (targetState?: string, targetCity?: string, targetZip?: string) => {
      for (const rate of taxRates) {
        // Check state match
        if (rate.state && rate.state !== targetState) continue;
        
        // Check city match
        if (rate.city && rate.city !== targetCity) continue;
        
        // Check zip code match
        if (rate.zipCode && targetZip && !targetZip.startsWith(rate.zipCode)) continue;

        // This rate matches
        return rate;
      }

      // Fallback: find a general rate for the country
      return taxRates.find(r => !r.state && !r.city && !r.zipCode) || null;
    };

    // Find the base tax rate for this location
    const baseTaxRate = findTaxRate(state, city, zipCode);
    const baseRate = baseTaxRate ? Number(baseTaxRate.rate) : 0;
    const baseTaxName = baseTaxRate?.name || 'Tax';

    // Calculate tax per item (considering tax class)
    let itemTaxes: any[] = [];
    let totalTax = 0;

    if (items && Array.isArray(items) && items.length > 0) {
      // Calculate tax for each item based on its tax class
      for (const item of items) {
        let itemRate = baseRate;
        let itemTaxName = baseTaxName;

        // If item has a specific tax class, find the matching rate
        if (item.taxClass && item.taxClass !== 'standard') {
          // Find tax rate for this specific tax class
          const classRate = taxRates.find(r => 
            r.taxClass === item.taxClass && 
            (!r.state || r.state === state) &&
            (!r.city || r.city === city)
          );

          if (classRate) {
            itemRate = Number(classRate.rate);
            itemTaxName = classRate.name;
          } else {
            // If no specific rate found, check if tax class has 0% rate
            // (e.g., digital products, reduced rate items)
            const taxClassInfo = await prisma.taxClass.findUnique({
              where: { name: item.taxClass },
            });

            if (taxClassInfo) {
              // Use 0% for zero-tax classes
              if (taxClassInfo.name === 'zero' || taxClassInfo.name === 'digital') {
                itemRate = 0;
                itemTaxName = `${taxClassInfo.name} tax`;
              }
            }
          }
        }

        const itemTaxAmount = (item.price * item.quantity) * itemRate;
        totalTax += itemTaxAmount;

        itemTaxes.push({
          productId: item.productId,
          price: item.price,
          quantity: item.quantity,
          taxClass: item.taxClass || 'standard',
          taxRate: itemRate,
          taxAmount: Math.round(itemTaxAmount * 100) / 100,
          taxName: itemTaxName,
        });
      }
    } else {
      // If no items provided, calculate on subtotal
      totalTax = subtotal * baseRate;
    }

    res.json({
      status: 'success',
      data: {
        taxRate: baseRate,
        taxName: baseTaxName,
        taxAmount: Math.round(totalTax * 100) / 100,
        subtotal: subtotal || 0,
        totalWithTax: Math.round(((subtotal || 0) + totalTax) * 100) / 100,
        itemTaxes,
        location: {
          country,
          state,
          city,
          zipCode,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tax/summary - Get tax summary for reporting
router.get('/summary', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date(new Date().setDate(1)); // First day of current month
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : new Date();

    // Get orders with tax
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        paymentStatus: 'completed',
      },
      select: {
        taxAmount: true,
        totalAmount: true,
        createdAt: true,
      },
    });

    const totalTax = orders.reduce((sum, order) => sum + Number(order.taxAmount), 0);
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);

    // Group by month
    const byMonth: Record<string, { tax: number; revenue: number }> = {};
    orders.forEach(order => {
      const month = order.createdAt.toISOString().slice(0, 7);
      if (!byMonth[month]) {
        byMonth[month] = { tax: 0, revenue: 0 };
      }
      byMonth[month].tax += Number(order.taxAmount);
      byMonth[month].revenue += Number(order.totalAmount);
    });

    res.json({
      status: 'success',
      data: {
        period: {
          start: startDate,
          end: endDate,
        },
        summary: {
          totalTax: Math.round(totalTax * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          averageTaxRate: totalRevenue > 0 
            ? Math.round((totalTax / totalRevenue) * 10000) / 100 
            : 0,
          orderCount: orders.length,
        },
        byMonth: Object.entries(byMonth).map(([month, data]) => ({
          month,
          tax: Math.round(data.tax * 100) / 100,
          revenue: Math.round(data.revenue * 100) / 100,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;