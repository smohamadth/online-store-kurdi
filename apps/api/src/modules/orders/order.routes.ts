import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { NotFoundError, AppError } from '../../middleware/errorHandler';
import { decrementStock, consumeReservationsForCartItemIds } from '../inventory/inventory.service';
import { logger } from '../../utils/logger';
import { sendOrderConfirmation, sendShippingNotification } from '../../services/email.service';
import { mintDownloadForOrderItem } from '../downloads/downloads.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { env } from '../../config/environment';
import { isGatewayMethod, getGatewayById } from '../payments/gateways/registry';
import { isGatewayConfigured } from '../payments/gatewayConfig';
import { createGatewayPayment, settleOrderPaid } from '../payments/gateway.service';
import {
  getGiftCardByCode,
  isRedeemable,
  debitGiftCard,
  creditGiftCard,
} from '../payments/giftcard.service';
import {
  getStoreCreditBalance,
  debitStoreCredit,
  creditStoreCredit,
} from '../payments/storecredit.service';
import { emit } from '../plugins/pluginHooks';
import { calculateTaxForOrder } from '../tax/tax.service';
import { calculateShippingForOrder } from '../shipping/shipping.service';
import { validateCoupon, CouponValidationError } from '../coupons/coupon.service';
import { readCookie, AFFILIATE_COOKIE } from '../affiliates/affiliate.helpers';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination';

const router = Router();

// The order body carries the item list into stock decrements, price math,
// download-token minting and the DB — every field must be shape-checked
// here. Before this schema existed, `quantity: 0` sailed past the stock
// check and still minted download tokens (free digital goods), fractional
// quantities corrupted the stock math, and string quantities 500'd on the
// Float column. This is the single gate every order must pass.
const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1).optional(),
        quantity: z.number().int().min(1).max(99999),
      })
    )
    .min(1),
  shippingAddressId: z.string().optional(),
  shippingAddress: z
    .object({
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
      address: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      zipCode: z.string().max(20).optional(),
      country: z.string().max(2).optional(),
      phone: z.string().max(40).optional(),
    })
    .optional(),
  paymentMethod: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  couponCode: z.string().max(100).optional(),
  couponId: z.string().optional(),
  shippingMethodId: z.string().optional(),
  // Wallet credit at checkout. `applyStoreCredit` debits the caller's
  // store-credit balance; `giftCardCode` debits the card. Both apply
  // AFTER the coupon, never below zero, and are ledgered against the
  // order. The server re-validates everything (code, redeemability,
  // currency, balance) — these fields are only a request to use credit.
  applyStoreCredit: z.boolean().optional(),
  giftCardCode: z.string().min(1).max(64).optional(),
});

// ---------------------------------------------------------------------------
// The order API. POST /api/orders is the single most complex endpoint in
// the store: it validates stock, snapshots digital-download fields, mints
// per-order download tokens, creates the Stripe Checkout session for card
// orders, decrements inventory (backorder-aware), consumes the cart's
// stock reservations, clears the cart, increments coupon usage, and fires
// the confirmation email. The inline comments walk through that sequence;
// read POST / first if you are touching checkout.
//
// Totals: computed server-side, never trusted from the client. The
// subtotal comes from the DB prices of the line items; tax and shipping
// are recomputed with the same services the checkout's advisory
// /calculate endpoints use (so what the customer saw is what is charged);
// the discount is re-derived from the coupon's own rules. Client-sent
// subtotal/taxAmount/shippingAmount/discountAmount/totalAmount are
// ignored — a tampered amount simply gets corrected to the real one.
//
// Read access: customers see their own orders; admin/manager see all
// (the role check happens inside the list/GET handlers).
// ---------------------------------------------------------------------------

// GET /api/orders - Get orders (filtered by user or all for admin)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { limit: 10 });
    const status = req.query.status as string;

    // Build where clause
    const where: any = {};
    
    // Non-admin users can only see their own orders
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      where.userId = req.user?.id;
    }
    
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: {
                    where: { isPrimary: true },
                    take: 1,
                  },
                },
              },
            },
          },
          shippingAddress: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: orders,
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

// GET /api/orders/:id - Get order by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
            variant: true,
          },
        },
        shippingAddress: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    // Non-admin users can only view their own orders
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.userId !== req.user?.id) {
      throw new AppError('Forbidden', 403);
    }

    res.json({
      status: 'success',
      data: order,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/orders/:id/pay - (re)open the hosted payment page for an order.
//
// The customer may have cancelled/abandoned the gateway page after the
// order was placed (paymentStatus=pending). This re-runs the gateway
// checkout session creation for that order and returns a fresh checkoutUrl
// so they can complete the payment without re-entering their details.
// Only the order owner (or an admin) may do this, and only while the order
// is unpaid.
router.post('/:id/pay', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({ where: { id }, include: { shippingAddress: true } });
    if (!order) throw new NotFoundError('Order');
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.userId !== req.user?.id) {
      throw new AppError('Forbidden', 403);
    }
    if (
      order.paymentStatus === 'completed' ||
      order.paymentStatus === 'refunded' ||
      order.paymentStatus === 'partially_refunded'
    ) {
      throw new AppError('This order has already been paid.', 400);
    }
    const method = order.paymentMethod || '';
    if (!isGatewayMethod(method)) {
      throw new AppError('This order is not payable online. Please choose cash on delivery or bank transfer.', 400);
    }
    if (!(await isGatewayConfigured(method))) {
      const gw = getGatewayById(method);
      throw new AppError(`${gw ? gw.name + ' ' : 'This '}payment method is not enabled for this store.`, 400);
    }
    const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    const user = await prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, phone: true } });
    const result = await createGatewayPayment({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        // Charge only what the wallet credit did NOT cover (defensive:
        // the mix rule refuses partial credit with gateways, so this is
        // normally the full amount).
        totalAmount: Math.max(
          0,
          order.totalAmount - (order.storeCreditApplied || 0) - (order.giftCardApplied || 0),
        ),
        currency: settings?.currency || 'USD',
        customerEmail: user?.email || null,
        customerPhone: user?.phone || order.shippingAddress?.phone || null,
        description: `Order ${order.orderNumber}`,
      },
      paymentMethod: method,
      storeCurrency: settings?.currency || 'USD',
    });
    res.json({ status: 'success', data: { checkoutUrl: result.checkoutUrl } });
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/:id/tracking - customer-facing status timeline
//
// Derived from the order's own fields (createdAt / shippedAt /
// deliveredAt / cancelledAt / paymentStatus) - no extra history table.
// The storefront renders this as a vertical timeline; the shape is
// stable so that view can't break when the admin flow changes.
router.get('/:id/tracking', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        payments: {
          where: { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    // Non-admin users can only view their own orders
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.userId !== req.user?.id) {
      throw new AppError('Forbidden', 403);
    }

    const isPaid = order.paymentStatus === 'completed' || order.paymentStatus === 'partially_refunded';
    // paidAt: the completed payment row's timestamp, falling back to
    // the order's own updatedAt (the status flip happened then).
    // (defensive: the in-memory test mock omits include args, so
    // `payments` may be undefined there; the real client always
    // returns an array for an include.)
    const paidAt = isPaid ? (order.payments?.[0]?.createdAt ?? order.updatedAt) : null;

    const isTerminal = order.status === 'cancelled' || order.status === 'refunded';

    const steps = [
      { key: 'placed', label: 'Order placed', at: order.createdAt, done: true },
      { key: 'paid', label: 'Payment confirmed', at: paidAt, done: isPaid },
      { key: 'shipped', label: 'Shipped', at: order.shippedAt, done: !!order.shippedAt },
      { key: 'delivered', label: 'Delivered', at: order.deliveredAt, done: !!order.deliveredAt },
    ];

    res.json({
      status: 'success',
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        trackingNumber: order.trackingNumber ?? null,
        // Populated for cancelled/refunded orders so the timeline can
        // end in an honest terminal state instead of a fake "in transit".
        terminal: isTerminal
          ? {
              type: order.status === 'refunded' ? 'refunded' : 'cancelled',
              at: order.cancelledAt,
            }
          : null,
        steps,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/orders - Create new order
router.post('/', authenticate, async (req, res, next) => {
  try {
    // NOTE: the client may also send subtotal/taxAmount/shippingAmount/
    // discountAmount/totalAmount — they are deliberately NOT read here.
    // All amounts are recomputed server-side (see the totals block below).
    const body = createOrderSchema.parse(req.body);
    const { items, shippingAddressId, shippingAddress, paymentMethod, notes,
            couponCode, couponId, applyStoreCredit, giftCardCode } = body;
    const shippingMethodId = body.shippingMethodId;

    if (!items || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    // Gateway payments (Stripe card, PayPal, Zarinpal, IDPay, ZainCash, FIB)
    // go through a hosted payment page. If the gateway is not configured,
    // refuse BEFORE creating the order so the customer picks cash on delivery
    // / bank transfer instead of being left with an unpayable pending order.
    if (isGatewayMethod(paymentMethod) && !(await isGatewayConfigured(paymentMethod))) {
      const gw = getGatewayById(paymentMethod);
      throw new AppError(
        `${gw ? gw.name + ' ' : 'This '}payment method is not enabled for this store. Please choose cash on delivery or bank transfer.`,
        400
      );
    }

    // Handle shipping address - either ID or full object
    let addressId = shippingAddressId;
    let shippingAddressData: {
      country?: string; state?: string; city?: string; zipCode?: string;
    } = {};

    if (!addressId && shippingAddress) {
      // Create address from full object
      const newAddress = await prisma.address.create({
        data: {
          userId: req.user!.id,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address1: shippingAddress.address,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postalCode: shippingAddress.zipCode,
          country: shippingAddress.country || 'US',
          phone: shippingAddress.phone,
          type: 'shipping',
        },
      });
      addressId = newAddress.id;
      shippingAddressData = {
        country: newAddress.country || undefined,
        state: newAddress.state || undefined,
        city: newAddress.city || undefined,
        zipCode: newAddress.postalCode || undefined,
      };
    } else if (addressId) {
      // Resolve the stored address so tax/shipping can be recomputed
      // from the real destination (not from client-sent amounts).
      const existingAddress = await prisma.address.findUnique({
        where: { id: addressId },
      });
      if (existingAddress) {
        shippingAddressData = {
          country: existingAddress.country || undefined,
          state: existingAddress.state || undefined,
          city: existingAddress.city || undefined,
          zipCode: existingAddress.postalCode || undefined,
        };
      }
    }

    // Calculate order totals
    let calculatedSubtotal = 0;
    const orderItems: any[] = [];

    // Load every product (and the referenced variants) in ONE round trip
    // each, then resolve per line item from the maps. The old code did a
    // sequential findUnique per cart line - N round trips on the
    // checkout hot path, which serialised behind each other on a
    // networked Postgres.
    // `items` comes from req.body (untyped `any`), so `items.map(...)` is
    // `any`; `new Set(any)` infers `Set<unknown>` and the spread becomes
    // `unknown[]`, which Prisma's `in:` (typed `string[]`) rejects. Cast the
    // array up front and filter through a type guard so these are `string[]`.
    const itemsArr = items as any[];
    const productIds: string[] = [...new Set(itemsArr.map((i) => i.productId).filter((x): x is string => typeof x === 'string'))];
    const variantIds: string[] = [...new Set(itemsArr.map((i) => i.variantId).filter((x): x is string => typeof x === 'string'))];
    const [products, variants] = await Promise.all([
      // taxClass is included so per-item tax classes can be applied at
      // order time (the product's class, not anything the client sends).
      prisma.product.findMany({ where: { id: { in: productIds } }, include: { taxClass: true } }),
      variantIds.length
        ? prisma.variant.findMany({ where: { id: { in: variantIds } } })
        : Promise.resolve([] as any[]),
    ]);
    const productById = new Map<string, any>(products.map((p: any): [string, any] => [p.id, p]));
    const variantById = new Map<string, any>(variants.map((v: any): [string, any] => [v.id, v]));

    for (const item of items) {
      const product = productById.get(item.productId);
      // Same shape as the old per-item include: at most one variant row,
      // only when the line item referenced one. A stale variantId (the
      // admin deleted it) resolves to nothing; a variantId that belongs
      // to a DIFFERENT product is ignored too (the old per-product
      // include could never return it) - falling back to the product
      // price/stock, exactly as before.
      const matchedVariant = item.variantId ? variantById.get(item.variantId) : undefined;
      const variant = matchedVariant && matchedVariant.productId === item.productId
        ? matchedVariant
        : undefined;
      const productVariants = variant ? [variant] : [];

      if (!product) {
        throw new AppError(`Product not found: ${item.productId}`, 400);
      }

      if (product.status !== 'active') {
        throw new AppError(`Product is not available: ${product.name}`, 400);
      }

      // Check inventory. The decrementStock service below is the
      // authoritative check (it also handles backorders). We only
      // short-circuit here when the product is a non-backorder,
      // non-tracked-inventory mismatch on a non-existent variant.
      if (product.trackInventory) {
        const availableQuantity = item.variantId
          ? productVariants[0]?.quantity || 0
          : product.quantity;
        // Only reject if neither backorder nor a sufficient pool.
        if (availableQuantity < item.quantity && !product.allowBackorder) {
          throw new AppError(`Insufficient stock for ${product.name}`, 400);
        }
      }

      const unitPrice = item.variantId && productVariants[0]
        ? Number(productVariants[0].price)
        : Number(product.price);

      const totalPrice = unitPrice * item.quantity;
      calculatedSubtotal += totalPrice;

      // Snapshot the digital fields onto the line item. The
      // product-level URL is what the legacy single-URL flow
      // reads; the per-order token we mint below is what the
      // token-based flow reads. We keep both so an order
      // placed before the per-order token system still works.
      const isDigital = product.type === 'digital';
      orderItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        // Snapshot the digital fields at order-placement time
        // so a product edit later doesn't invalidate the
        // customer's downloads.
        downloadUrl: isDigital ? product.downloadUrl : null,
        downloadLimit: isDigital ? product.downloadLimit : null,
        downloadExpiry: isDigital && product.downloadExpiry
          // Schema stores days; the per-order column is a Date.
          // Convert: purchasedAt + days.
          ? new Date(Date.now() + product.downloadExpiry * 24 * 60 * 60 * 1000)
          : null,
        isBackorder: false,
      });
    }

    // ------------------------------------------------------------------
    // Server-authoritative totals. NOTHING amount-related is taken from
    // the client body: subtotal is the DB prices, tax and shipping are
    // recomputed from the destination + the chosen method, and the
    // discount is re-derived from the coupon's own rules. A request that
    // lies about subtotal/tax/shipping/discount/total simply gets the
    // real numbers stored instead.
    // ------------------------------------------------------------------
    const finalSubtotal = calculatedSubtotal;

    // Tax: same matching logic as POST /api/tax/calculate, driven by the
    // shipping destination and each line's product tax class. No address
    // (e.g. digital-only orders) or no configured rates -> 0.
    const taxCalc = shippingAddressData.country
      ? await calculateTaxForOrder({
          country: shippingAddressData.country,
          state: shippingAddressData.state,
          city: shippingAddressData.city,
          zipCode: shippingAddressData.zipCode,
          subtotal: finalSubtotal,
          items: orderItems.map((it) => ({
            productId: it.productId,
            price: it.unitPrice,
            quantity: it.quantity,
            taxClass: (productById.get(it.productId) as any)?.taxClass?.name || 'standard',
          })),
        })
      : null;
    const finalTaxAmount = taxCalc?.taxAmount ?? 0;

    // Shipping: recompute the available methods for the destination, then
    // take the rate of the method the client claims to have chosen. If the
    // method is not actually available for this order, refuse the order
    // rather than record a made-up charge. No method id -> 0 (digital-only).
    let finalShippingAmount = 0;
    if (shippingAddressData.country) {
      const shippingMethods = await calculateShippingForOrder({
        country: shippingAddressData.country,
        state: shippingAddressData.state,
        zipCode: shippingAddressData.zipCode,
        subtotal: finalSubtotal,
        weight: orderItems.reduce(
          (sum: number, it: any) => sum + (Number((productById.get(it.productId) as any)?.weight) || 0) * it.quantity,
          0
        ),
        itemCount: orderItems.reduce((sum: number, it: any) => sum + it.quantity, 0),
      });
      if (shippingMethodId) {
        const chosen = shippingMethods.find((m) => m.id === shippingMethodId);
        if (!chosen) {
          throw new AppError('The selected shipping method is not available for this address', 400);
        }
        finalShippingAmount = chosen.rate;
      }
    }

    // Discount: re-validate the coupon and recompute what it grants. An
    // invalid coupon FAILS the order (the client showed the customer a
    // discount that does not exist, so recording a silent 0 would charge
    // more than was shown). No coupon -> no discount, whatever the client
    // claimed.
    let finalDiscountAmount = 0;
    let freeShippingCoupon = false;
    const claimedCouponId = couponId || null;
    const claimedCouponCode = couponCode || null;
    if (claimedCouponId || claimedCouponCode) {
      try {
        const couponResult = await validateCoupon({
          couponId: claimedCouponId || undefined,
          code: claimedCouponCode || undefined,
          subtotal: finalSubtotal,
        });
        finalDiscountAmount = couponResult.discount;
        freeShippingCoupon = couponResult.coupon.type === 'free_shipping';
      } catch (err) {
        if (err instanceof CouponValidationError) {
          throw new AppError(err.message, 400);
        }
        throw err;
      }
    }
    if (freeShippingCoupon) {
      finalShippingAmount = 0;
    }

    const finalTotalAmount = Math.round(
      (finalSubtotal + finalTaxAmount + finalShippingAmount - finalDiscountAmount) * 100
    ) / 100;
    if (finalTotalAmount < 0) {
      throw new AppError('Order total cannot be negative', 400);
    }

    // ------------------------------------------------------------------
    // Wallet credit (store credit + gift card). Both are validated HERE,
    // before the order is created, so a bad code / mismatch fails the
    // request without a half-created order:
    //   - the gift card must exist, be redeemable and be in the store's
    //     currency (a USD card can't pay an EUR order);
    //   - store credit and gift cards may be combined with offline
    //     payment methods, or cover the order ENTIRELY with a card
    //     method (then no gateway session is created); a partial credit
    //     against a hosted-gateway method is refused — the gateway would
    //     otherwise charge the full amount and the credit would be spent
    //     even if the customer abandons the payment page.
    // ------------------------------------------------------------------
    const storeCurrency =
      (await prisma.storeSettings.findUnique({ where: { id: 'default' } }))?.currency || 'USD';
    const wantStoreCredit = applyStoreCredit === true;
    const giftCode = typeof giftCardCode === 'string' && giftCardCode.trim()
      ? giftCardCode.trim().toUpperCase()
      : null;

    let storeCreditBalance = 0;
    if (wantStoreCredit) {
      storeCreditBalance = await getStoreCreditBalance(req.user!.id, storeCurrency);
    }

    let giftCardBalance = 0;
    if (giftCode) {
      let card: any;
      try {
        card = await getGiftCardByCode(giftCode);
      } catch {
        throw new AppError('Gift card not found', 400);
      }
      if (!isRedeemable(card)) {
        throw new AppError('Gift card is not redeemable (expired, cancelled or depleted)', 400);
      }
      if ((card.currency || 'USD').toUpperCase() !== storeCurrency.toUpperCase()) {
        throw new AppError(
          `Gift card currency (${card.currency}) does not match the store currency (${storeCurrency})`,
          400,
        );
      }
      // Ownership: a card claimed by another account cannot be spent by
      // this one (the redeem endpoint claims it; spending also claims it
      // so a card used without an explicit check belongs to its buyer).
      if (card.redeemedByUserId && card.redeemedByUserId !== req.user!.id) {
        throw new AppError(
          'This gift card has already been claimed by another account. Check the code, or ask the store for a new one.',
          400,
        );
      }
      if (!card.redeemedByUserId) {
        await prisma.giftCard.updateMany({
          where: { id: card.id, redeemedByUserId: null },
          data: { redeemedByUserId: req.user!.id, redeemedAt: new Date() },
        });
      }
      giftCardBalance = card.balance;
    }

    // Client-side estimate of the wallet coverage (server debits below
    // are authoritative; this only decides the gateway-mix rule).
    const walletEstimate = Math.min(
      finalTotalAmount,
      (wantStoreCredit ? storeCreditBalance : 0) + giftCardBalance,
    );
    const fullyCoveredByWallet = finalTotalAmount - walletEstimate <= 0.005;
    if (
      isGatewayMethod(paymentMethod) &&
      (wantStoreCredit || giftCode) &&
      !fullyCoveredByWallet
    ) {
      throw new AppError(
        'Store credit and gift cards can cover an order entirely, but a partial amount cannot be combined with online card payment. Choose cash on delivery or bank transfer for the remaining balance.',
        400,
      );
    }

    // ------------------------------------------------------------------
    // Affiliate attribution: the aff_ref cookie set by
    // POST /api/affiliates/track when the visitor came through an
    // affiliate link. Only stored when the program is enabled AND the
    // code belongs to an active affiliate; anything else is silently
    // ignored — a stale/fake ref must never block checkout. The
    // commission itself is created later, when the order is PAID.
    // ------------------------------------------------------------------
    let affiliateId: string | null = null;
    let affiliateCode: string | null = null;
    const refCode = readCookie(req, AFFILIATE_COOKIE);
    if (refCode) {
      const affSettings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (affSettings?.affiliateEnabled) {
        const affiliate = await prisma.affiliate.findUnique({ where: { code: refCode } });
        if (affiliate && affiliate.status === 'active') {
          affiliateId = affiliate.id;
          affiliateCode = affiliate.code;
        }
      }
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.user!.id,
        status: 'pending',
        affiliateId,
        affiliateCode,
        subtotal: finalSubtotal,
        taxAmount: finalTaxAmount,
        shippingAmount: finalShippingAmount,
        discountAmount: finalDiscountAmount,
        totalAmount: finalTotalAmount,
        shippingAddressId: addressId,
        shippingMethodId: shippingMethodId ?? null,
        paymentMethod: paymentMethod ?? 'cash_on_delivery',
        paymentStatus: 'pending',
        notes,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
            // Include the freshly-minted download row so the
            // confirmation email can include the link.
            downloads: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        shippingAddress: true,
      },
    });

    // ------------------------------------------------------------------
    // Apply the wallet credit: store credit first, then the gift card.
    // Each debit is atomic and writes its own ledger row (type 'use' /
    // 'order_use') linked to this order. The order row is then updated
    // with exactly what was applied — totalAmount stays the full order
    // value, so the amount still due is totalAmount - applied.
    // ------------------------------------------------------------------
    let amountDue = finalTotalAmount;
    let storeCreditApplied = 0;
    let giftCardApplied = 0;
    let appliedGiftCardId: string | null = null;

    try {
      if (wantStoreCredit && amountDue > 0.005) {
        const sc = await debitStoreCredit({
          userId: req.user!.id,
          amount: amountDue,
          currency: storeCurrency,
          orderId: order.id,
          notes: `Order ${orderNumber}`,
        });
        storeCreditApplied = Math.round(sc.applied * 100) / 100;
        amountDue = Math.round((amountDue - sc.applied) * 100) / 100;
      }
      if (giftCode && amountDue > 0.005) {
        // Cap the debit at what the order still needs: a card with more
        // balance than the order never leaves a residual on the order.
        const card = await getGiftCardByCode(giftCode);
        const giftAmount = Math.round(Math.min(card.balance, amountDue) * 100) / 100;
        if (giftAmount > 0.005) {
          await debitGiftCard({
            code: giftCode,
            amount: giftAmount,
            orderId: order.id,
            notes: `Order ${orderNumber}`,
          });
          appliedGiftCardId = card.id;
          giftCardApplied = giftAmount;
          amountDue = Math.round((amountDue - giftAmount) * 100) / 100;
        }
      }

      const walletApplied = Math.round((storeCreditApplied + giftCardApplied) * 100) / 100;
      if (walletApplied > 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            storeCreditApplied,
            giftCardApplied,
            giftCardCode: giftCardApplied > 0 ? giftCode : null,
          },
        });

        // Fully covered by wallet credit: settle the order like any other
        // payment — Payment ledger row (method 'store_credit' / 'gift_card'),
        // paymentStatus completed, status processing, accounting auto-post,
        // and the payment.settled plugin hook — all crash-safe and deduped
        // on the stable transactionId by settleOrderPaid.
        if (amountDue <= 0.005) {
          await settleOrderPaid({
            orderId: order.id,
            orderNumber,
            amount: walletApplied,
            currency: storeCurrency,
            method: storeCreditApplied > 0 ? 'store_credit' : 'gift_card',
            transactionId: `wallet-${order.id}`,
            gatewayResponse: { storeCreditApplied, giftCardApplied, giftCardCode: giftCode },
          });
        }
      }
    } catch (err) {
      // The wallet debits consume value, so a mid-way failure must not
      // leave the money spent on an order that never completed. The only
      // realistic failure is the gift-card debit: the card was validated
      // above, but a concurrent order can drain its balance in between —
      // debitGiftCard then rejects atomically. Undo whatever was already
      // applied (store credit, then the card), delete the just-created
      // order (OrderItems cascade; coupon usage, stock, cart, analytics
      // and download mints all run later), and surface the error. The
      // reversals are best-effort: if the store itself is failing they
      // may fail too, but the original error is still reported.
      if (storeCreditApplied > 0) {
        await creditStoreCredit({
          userId: req.user!.id,
          amount: storeCreditApplied,
          // The debit took the store's currency; the reversal must put it
          // back in the SAME currency or the credit lands in an invisible
          // USD row (see the refund route for the same bug).
          currency: storeCurrency,
          type: 'adjust',
          orderId: order.id,
          notes: `Reversal: order ${orderNumber} placement failed`,
          createdById: req.user!.id,
        }).catch(() => {});
      }
      if (appliedGiftCardId && giftCardApplied > 0) {
        await creditGiftCard({
          cardId: appliedGiftCardId,
          amount: giftCardApplied,
          type: 'adjust',
          orderId: order.id,
          notes: `Reversal: order ${orderNumber} placement failed`,
        }).catch(() => {});
      }
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      throw err;
    }

    // Analytics: record a purchase event per line item so the
    // recommendation engine can learn co-purchases ("customers also
    // bought"). One event per line keeps productId clean for the
    // groupBy the recommendations run. Off by default like every
    // other analytics write - the /privacy page documents it.
    // (The service swallows its own errors, so tracking can never
    // fail an order.)
    if (process.env.ANALYTICS_TRACKING_ENABLED === 'true') {
      const analyticsService = new AnalyticsService();
      // One event per line, fired in parallel - each trackEvent is
      // independent (separate rows) and swallows its own errors, so a
      // tracking failure can never fail the order.
      await Promise.all(
        orderItems.map((line) =>
          analyticsService.trackEvent({
            userId: req.user!.id,
            sessionId: String(req.headers['x-session-id'] || '').slice(0, 200) || 'anonymous',
            eventType: 'purchase',
            productId: line.productId,
            metadata: { orderId: order.id, orderNumber, quantity: line.quantity },
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip,
          }),
        ),
      );
    }

    // Card payment: hand the customer a Stripe Checkout session for
    // this order. The webhook settles the order server-side; the
    // response carries checkoutUrl and the storefront redirects the
    // customer into Stripe's hosted payment page (no card data ever
    // touches this server).
    let checkoutUrl: string | null = null;
    // A wallet-covered order (amountDue <= 0) is settled by the credit
    // above and needs no gateway session — the card option was either
    // refused earlier (partial credit) or the credit covers everything.
    if (isGatewayMethod(paymentMethod) && amountDue > 0.005) {
      // Hosted-payment gateway (Stripe card, PayPal, Zarinpal, IDPay,
      // ZainCash, FIB). Each gateway builds its own payment page for this
      // order; the response carries checkoutUrl and the storefront redirects
      // the customer to it. The webhook / return-verify settles the order.
      // The session charges the AMOUNT DUE after wallet credit, never the
      // full totalAmount (defensive: the mix rule above already refuses
      // partial credit with gateways, but the math must hold regardless).
      const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      const result = await createGatewayPayment({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: amountDue,
          currency: settings?.currency || 'USD',
          customerPhone: (order.shippingAddress as any)?.phone || (req.user as any)?.phone || null,
          customerEmail: (req.user as any)?.email || null,
          description: `Order ${order.orderNumber}`,
        },
        // The gateway branch is only entered when isGatewayMethod(paymentMethod)
        // matched, so this is always a real method string here.
        paymentMethod: paymentMethod as string,
        storeCurrency: settings?.currency || 'USD',
      });
      checkoutUrl = result.checkoutUrl;
    }

    // Mint a per-order download token for every digital line
    // item. The customer's confirmation email embeds these
    // tokens, and the /api/downloads/:token route redeems
    // them. We also keep the legacy product-level URL on
    // OrderItem.downloadUrl for backward compatibility with
    // orders placed before the token system shipped.
    // Minted in parallel: every digital line mints its own independent
    // token row. The per-line try/catch (inside the map) keeps the old
    // guarantee that one failed mint never fails the paid order.
    await Promise.all(
      order.items.map(async (item: any) => {
        const isDigital = item.product?.type === 'digital';
        if (!isDigital) return;
        const sourceUrl = item.downloadUrl || item.product?.downloadUrl;
        if (!sourceUrl) {
          // Defensive: a digital product without a download URL
          // is a config error, not a payment failure. The order
          // succeeds; we just skip minting a token. Log it so
          // an admin notices.
          logger.warn(
            `Skipped download token for orderItem=${item.id} ` +
              `product=${item.productId}: no downloadUrl configured`,
          );
          return;
        }
        try {
          await mintDownloadForOrderItem({
            orderItemId: item.id,
            sourceUrl,
            // Schema column is days; the per-order column is a
            // Date. Read what we snapshoted on the order item.
            expiryDays: item.downloadExpiry
              ? Math.max(0, Math.ceil(
                  (item.downloadExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
                ))
              : null,
            // Per-token download limit. Copied from the
            // OrderItem.downloadLimit snapshot (which in turn was
            // copied from the product). null = unlimited.
            downloadLimit: item.downloadLimit,
            purchaseDate: order.createdAt,
          });
        } catch (err) {
          // Don't fail the whole order if the download mint
          // fails; the order is paid for. We log so an admin
          // can retry.
          logger.error(
            `Failed to mint download for orderItem=${item.id}:`,
            err as any,
          );
        }
      }),
    );

    // Re-fetch the order so the email includes the freshly
    // minted download rows.
    const orderWithDownloads = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: {
          include: {
            product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
            downloads: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        shippingAddress: true,
      },
    });

    // Update inventory via the variant-aware service. The service
    // handles backorder allowance and writes an InventoryLog entry.
    // We also persist the backorder flag on the OrderItem so the
    // storefront can show "preorder" UI to the customer.
    //
    // Lines for the SAME product read-modify-write the same stock row,
    // so they must run sequentially; lines for DIFFERENT products touch
    // disjoint rows and run in parallel (a 5-item cart of 5 products is
    // now 1 round trip of parallel transactions, not 5 serial ones).
    const itemsByProduct = new Map<string, typeof items>();
    for (const item of items) {
      if (!itemsByProduct.has(item.productId)) itemsByProduct.set(item.productId, []);
      itemsByProduct.get(item.productId)!.push(item);
    }
    const decrementResults = (
      await Promise.all(
        [...itemsByProduct.values()].map(async (group) => {
          const groupResults: { item: (typeof items)[number]; wasBackorder: boolean }[] = [];
          for (const item of group) {
            const result = await decrementStock({
              productId: item.productId,
              variantId: item.variantId ?? undefined,
              quantity: item.quantity,
              orderId: order.id,
              userId: req.user!.id,
            });
            groupResults.push({ item, wasBackorder: result.wasBackorder });
          }
          return groupResults;
        }),
      )
    ).flat();

    for (const { item, wasBackorder } of decrementResults) {
      if (!wasBackorder) continue;
      // Find the matching OrderItem and patch its isBackorder flag.
      const orderItem = await prisma.orderItem.findFirst({
        where: {
          orderId: order.id,
          productId: item.productId,
          ...(item.variantId ? { variantId: item.variantId } : {}),
        },
      });
      if (orderItem) {
        await prisma.orderItem.update({
          where: { id: orderItem.id },
          data: { isBackorder: true },
        });
      }
    }

    // Consume any active stock reservations the cart held. Without
    // this step, the order placement is correct (decrementStock
    // already ran above) but the reservation rows stay around with
    // no releasedAt timestamp, which means the post-order
    // `availableQuantity` for that product stays artificially low
    // until the original TTL expires.
    const cartItemRows = await prisma.cartItem.findMany({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (cartItemRows.length > 0) {
      await consumeReservationsForCartItemIds(cartItemRows.map((c: { id: string }) => c.id));
    }

    // Clear user's cart
    await prisma.cartItem.deleteMany({
      where: { userId: req.user!.id },
    });

    logger.info(`Order created: ${order.orderNumber} by user ${req.user!.email}`);

    // Plugin event: order.created (fire-and-forget — emit never throws).
    void emit('order.created', {
      orderId: (orderWithDownloads || order).id,
      orderNumber: (orderWithDownloads || order).orderNumber,
      status: (orderWithDownloads || order).status,
      subtotal: (orderWithDownloads || order).subtotal,
      taxAmount: (orderWithDownloads || order).taxAmount,
      shippingAmount: (orderWithDownloads || order).shippingAmount,
      discountAmount: (orderWithDownloads || order).discountAmount,
      totalAmount: (orderWithDownloads || order).totalAmount,
      paymentMethod: (orderWithDownloads || order).paymentMethod,
      paymentStatus: (orderWithDownloads || order).paymentStatus,
      items: ((orderWithDownloads || order).items || []).map((it: any) => ({
        productId: it.productId,
        name: it.product?.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      })),
      customer: { userId: req.user!.id, email: req.user!.email },
    });

    // Track coupon usage if coupon was applied
    if (couponId) {
      await prisma.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      }).catch(err => logger.error('Failed to update coupon usage:', err));
    }

    // Send order confirmation email (non-blocking)
    const orderUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { firstName: true, lastName: true, email: true },
    });
    
    if (orderUser) {
      sendOrderConfirmation({
        ...(orderWithDownloads || order),
        items: (orderWithDownloads || order).items,
        // Stamp the API base on each download so the email
        // gets a fully qualified URL the user can click.
        downloads: ((orderWithDownloads || order).items as any[])
          .filter((it: any) => it.downloads?.[0]?.token)
          .map((it: any) => ({
            orderItemId: it.id,
            productName: it.product?.name,
            token: it.downloads[0].token,
            expiresAt: it.downloads[0].expiresAt,
            downloadLimit: it.downloads[0].downloadLimit,
            url: `${env.API_URL || 'http://localhost:3001/api'}/downloads/${it.downloads[0].token}`,
          })),
      }, orderUser).catch(err => {
        logger.error('Failed to send order confirmation:', err);
      });
    }

    // Build the response from the freshly-refetched order so
    // the storefront sees the downloads that were just minted
    // for digital line items. The same shape (`items[].downloads`)
    // is also what the email uses above.
    const responseOrder = (orderWithDownloads || order) as any;
    // The mock prisma doesn't apply `orderBy` / `take` to
    // nested `include` blocks, so the re-fetched order's
    // `items[].downloads` array is empty. Re-resolve downloads
    // by query against ProductDownload directly so the response
    // still has the tokens regardless of mock-fidelity.
    const allDownloads = (responseOrder.items || []).length
      ? await prisma.productDownload.findMany({
          where: { orderItemId: { in: (responseOrder.items || []).map((it: any) => it.id) } },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    res.status(201).json({
      status: 'success',
      data: {
        ...responseOrder,
        // Non-null when the customer paid with a card: the storefront
        // redirects into Stripe Checkout. COD / bank transfer orders
        // get null and stay on the normal success screen.
        checkoutUrl,
        // Convenience field for the storefront: a flat array of
        // {orderItemId, productName, token, url, ...} the checkout
        // success page can iterate without having to flatten
        // items[].downloads itself.
        downloads: (responseOrder.items || [])
          .map((it: any) => {
            const dl = allDownloads.find((d: any) => d.orderItemId === it.id);
            if (!dl || !dl.token) return null;
            return {
              orderItemId: it.id,
              productName: it.product?.name,
              token: dl.token,
              expiresAt: dl.expiresAt,
              downloadLimit: dl.downloadLimit,
              downloadCount: dl.downloadCount,
              url: `${env.API_URL || 'http://localhost:3001/api'}/downloads/${dl.token}`,
            };
          })
          .filter(Boolean),
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/orders/:id/status - Update order status (admin only)
/**
 * Statuses an order may hold. Mirrors the comment on Order.status in
 * schema.prisma, which is a plain String column - SQLite has no enum, so
 * nothing at the database level rejects a bad value.
 */
const ORDER_STATUSES = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

router.put('/:id/status', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, adminNotes } = req.body;

    // Validate before writing.
    //
    // This endpoint used to pass `status` straight through to prisma.update,
    // so `{"status":"not-a-status"}` returned 200 and PERSISTED the garbage.
    // Dashboard revenue keys off specific status strings, so a typo silently
    // removed an order from the revenue figures with no error anywhere.
    if (typeof status !== 'string' || !ORDER_STATUSES.includes(status as any)) {
      throw new AppError(
        `Invalid order status "${status}". Expected one of: ${ORDER_STATUSES.join(', ')}.`,
        400
      );
    }

    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    const updateData: any = { status };

    if (trackingNumber) {
      updateData.trackingNumber = trackingNumber;
    }

    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }

    // Set timestamps based on status
    switch (status) {
      case 'shipped':
        updateData.shippedAt = new Date();
        break;
      case 'delivered':
        updateData.deliveredAt = new Date();
        break;
      case 'cancelled':
        updateData.cancelledAt = new Date();
        break;
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    logger.info(`Order ${order.orderNumber} status updated to ${status}`);

    // Send shipping notification email when status changes to shipped
    if (status === 'shipped' && trackingNumber) {
      const orderUser = await prisma.user.findUnique({
        where: { id: order.userId },
        select: { firstName: true, lastName: true, email: true },
      });

      if (orderUser) {
        sendShippingNotification(updatedOrder, orderUser, trackingNumber).catch(err => {
          logger.error('Failed to send shipping notification:', err);
        });
      }
    }

    res.json({
      status: 'success',
      data: updatedOrder,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/orders/:id/cancel - Cancel order
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (reason !== undefined && reason !== null && typeof reason !== 'string') {
      return res.status(400).json({ status: 'error', message: 'reason must be a string' });
    }
    if (typeof reason === 'string' && reason.length > 500) {
      return res.status(400).json({ status: 'error', message: 'reason must be 500 characters or fewer' });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    // Users can only cancel their own orders
    if (req.user?.role !== 'admin' && order.userId !== req.user?.id) {
      throw new AppError('Forbidden', 403);
    }

    // Can only cancel pending or processing orders
    if (!['pending', 'processing'].includes(order.status)) {
      throw new AppError('Order cannot be cancelled', 400);
    }

    // A settled payment must be refunded FIRST (POST /api/payments/refund,
    // admin). Cancelling here would strand the customer's money while the
    // store restocks — an admin refund then cancel is the honest order.
    if (order.paymentStatus !== 'pending') {
      throw new AppError(
        'This order has already been paid — process a refund before cancelling it.',
        400,
      );
    }

    // Status flip + stock restoration in ONE transaction, mirroring the
    // decrement semantics exactly:
    //   - non-tracked products were never decremented -> skip
    //   - variant lines: the variant AND the parent's denormalized
    //     quantity were decremented at sale (unless it was a backorder,
    //     which only went negative on the variant) -> restore both
    //     when the sale wasn't a backorder
    //   - plain lines: restore the product
    await prisma.$transaction(async (tx: any) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          notes: reason ? `Cancelled: ${reason}` : undefined,
        },
      });

      for (const item of order.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { trackInventory: true },
        });
        if (!product?.trackInventory) continue;

        if (item.variantId) {
          // A backorder sale left the parent untouched; a normal sale
          // decremented it. The inventoryLog audit trail records which.
          const backorder = await tx.inventoryLog.findFirst({
            where: { orderId: order.id, variantId: item.variantId, reason: 'backorder' },
            select: { id: true },
          });
          await tx.variant.update({
            where: { id: item.variantId },
            data: { quantity: { increment: item.quantity } },
          });
          if (!backorder) {
            await tx.product.update({
              where: { id: item.productId },
              data: { quantity: { increment: item.quantity } },
            });
          }
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      return updatedOrder;
    });

    logger.info(`Order ${order.orderNumber} cancelled`);

    const updatedOrder = await prisma.order.findUnique({ where: { id } });
    res.json({
      status: 'success',
      data: updatedOrder,
    });
  } catch (error) {
    next(error);
  }
});

export default router;