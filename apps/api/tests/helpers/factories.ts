/**
 * Test data factories. Each factory uses the mock prisma; the real
 * prisma client is only used when running against a real database.
 */
let counter = 0;
const uniq = (prefix: string) => `${prefix}-${Date.now()}-${++counter}`;

async function prisma() {
  const { mockPrisma } = await import('./mockPrisma');
  return mockPrisma;
}

export async function createUser(overrides: Partial<{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'customer';
  isActive: boolean;
  isVerified: boolean;
}> = {}) {
  const p = await prisma();
  const bcrypt = (await import('bcryptjs')).default;
  return p.user.create({
    data: {
      email: overrides.email ?? uniq('u') + '@test.local',
      password: overrides.password ?? await bcrypt.hash('Password123!', 4),
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      role: overrides.role ?? 'customer',
      isActive: overrides.isActive ?? true,
      // Mirrors the register route: self-registration IS verification in
      // this store (no email-verify flow), so fixture users default to
      // verified. Tests that need an unverified account pass false.
      isVerified: overrides.isVerified ?? true,
    },
  });
}

export async function createCategory(overrides: Partial<{
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
}> = {}) {
  const p = await prisma();
  const slug = overrides.slug ?? uniq('cat');
  return p.category.create({
    data: {
      name: overrides.name ?? slug,
      slug,
      description: overrides.description ?? null,
      image: overrides.image ?? null,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createProduct(overrides: Partial<{
  name: string;
  slug: string;
  sku: string;
  description: string;
  type: 'physical' | 'digital';
  status: 'draft' | 'active' | 'inactive' | 'archived';
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  categoryId: string;
  allowBackorder: boolean;
  backorderLimit: number | null;
  expectedRestockAt: Date | null;
  // Digital product fields
  downloadUrl: string | null;
  downloadLimit: number | null;
  downloadExpiry: number | null;
  /** Tests that assert on ordering can pin an explicit timestamp. */
  createdAt?: Date;
}> = {}) {
  const p = await prisma();
  const slug = overrides.slug ?? uniq('p');
  return p.product.create({
    data: {
      name: overrides.name ?? slug,
      createdAt: overrides.createdAt ?? undefined,
      slug,
      description: overrides.description ?? 'A test product',
      shortDescription: 'short',
      sku: overrides.sku ?? uniq('SKU'),
      type: overrides.type ?? 'physical',
      status: overrides.status ?? 'active',
      price: overrides.price ?? 9.99,
      compareAtPrice: overrides.compareAtPrice ?? null,
      costPrice: null,
      trackInventory: overrides.trackInventory ?? true,
      quantity: overrides.quantity ?? 100,
      lowStockThreshold: overrides.lowStockThreshold ?? 10,
      weightUnit: 'kg',
      categoryId: overrides.categoryId,
      allowBackorder: overrides.allowBackorder ?? false,
      backorderLimit: overrides.backorderLimit ?? null,
      expectedRestockAt: overrides.expectedRestockAt ?? null,
      downloadUrl: overrides.downloadUrl ?? null,
      downloadLimit: overrides.downloadLimit ?? null,
      downloadExpiry: overrides.downloadExpiry ?? null,
    },
  });
}

export async function addProductImage(productId: string, overrides: Partial<{
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
}> = {}) {
  const p = await prisma();
  return p.productImage.create({
    data: {
      productId,
      url: overrides.url ?? 'https://example.com/img.jpg',
      alt: overrides.alt ?? null,
      isPrimary: overrides.isPrimary ?? false,
      sortOrder: overrides.sortOrder ?? 0,
    },
  });
}

export async function createVariant(productId: string, overrides: Partial<{
  name: string;
  sku: string;
  price: number;
  quantity: number;
  isActive: boolean;
  /**
   * Variant attributes as either an object (will be JSON.stringified)
   * or a pre-stringified JSON string. The schema column stores a
   * string, so the route's `parseAttributes` helper handles both.
   */
  attributes?: Record<string, string> | string;
}> = {}) {
  const p = await prisma();
  let attrs = '{}';
  if (overrides.attributes !== undefined) {
    attrs = typeof overrides.attributes === 'string'
      ? overrides.attributes
      : JSON.stringify(overrides.attributes);
  }
  const created = await p.productVariant.create({
    data: {
      productId,
      name: overrides.name ?? 'Default',
      sku: overrides.sku ?? uniq('VSKU'),
      price: overrides.price ?? 9.99,
      quantity: overrides.quantity ?? 100,
      attributes: attrs,
      isActive: overrides.isActive ?? true,
    },
  });
  // Mirror the variant's attributes into the (key, value) query index,
  // the same way the real write sites do (syncVariantAttributes).
  // Without this, fixture variants would be invisible to the SQL
  // attribute filter and the facet tally.
  try {
    const parsed = JSON.parse(attrs);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rows = Object.entries(parsed).map(([key, value]) => ({
        variantId: created.id,
        key,
        value: String(value),
      }));
      if (rows.length > 0) {
        await p.variantAttribute.createMany({ data: rows });
      }
    }
  } catch {
    // attrs was invalid JSON - no index rows (matches syncVariantAttributes'
    // parseAttributes returning {}).
  }
  return created;
}

export async function createCoupon(overrides: Partial<{
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
}> = {}) {
  const p = await prisma();
  return p.coupon.create({
    data: {
      code: overrides.code ?? uniq('COUPON').toUpperCase(),
      type: overrides.type ?? 'percentage',
      value: overrides.value ?? 10,
      minOrderAmount: overrides.minOrderAmount ?? null,
      maxDiscountAmount: overrides.maxDiscountAmount ?? null,
      usageLimit: overrides.usageLimit ?? null,
      usedCount: overrides.usedCount ?? 0,
      isActive: overrides.isActive ?? true,
      startsAt: overrides.startsAt ?? null,
      expiresAt: overrides.expiresAt ?? null,
    },
  });
}

export async function createAddress(userId: string, overrides: Partial<{
  type: 'shipping' | 'billing';
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}> = {}) {
  const p = await prisma();
  return p.address.create({
    data: {
      userId,
      type: overrides.type ?? 'shipping',
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      address1: overrides.address1 ?? '123 Main St',
      city: overrides.city ?? 'NYC',
      state: overrides.state ?? 'NY',
      postalCode: overrides.postalCode ?? '10001',
      country: overrides.country ?? 'US',
      isDefault: overrides.isDefault ?? false,
    },
  });
}

export async function createReview(userId: string, productId: string, overrides: Partial<{
  rating: number;
  title: string;
  comment: string;
  isApproved: boolean;
  isVerified: boolean;
}> = {}) {
  const p = await prisma();
  return p.review.create({
    data: {
      userId,
      productId,
      rating: overrides.rating ?? 5,
      title: overrides.title ?? null,
      comment: overrides.comment ?? null,
      isApproved: overrides.isApproved ?? true,
      isVerified: overrides.isVerified ?? true,
    },
  });
}

export async function createCartItem(userId: string, productId: string, overrides: Partial<{
  variantId: string | null;
  quantity: number;
}> = {}) {
  const p = await prisma();
  return p.cartItem.create({
    data: {
      userId,
      productId,
      variantId: overrides.variantId ?? null,
      quantity: overrides.quantity ?? 1,
    },
  });
}

export async function createWishlistItem(userId: string, productId: string) {
  const p = await prisma();
  return p.wishlistItem.create({
    data: { userId, productId },
  });
}

export function orderItemPayload(productId: string, overrides: { variantId?: string; quantity?: number } = {}) {
  return {
    productId,
    variantId: overrides.variantId,
    quantity: overrides.quantity ?? 1,
  };
}

/**
 * Create an order. Defaults to a minimum-viable row.
 * The order is intentionally not "complete" - real orders are created
 * through `POST /api/orders` which computes totals. This factory is for
 * assertions on already-existing orders.
 */
export async function createOrder(userId: string, overrides: Partial<{
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'failed';
  paymentMethod?: string | null;
  storeCreditApplied?: number;
  giftCardApplied?: number;
}> = {}) {
  const p = await prisma();
  return p.order.create({
    data: {
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      status: overrides.status ?? 'pending',
      subtotal: overrides.subtotal ?? 100,
      taxAmount: overrides.taxAmount ?? 10,
      shippingAmount: overrides.shippingAmount ?? 0,
      totalAmount: overrides.totalAmount ?? 110,
      paymentStatus: overrides.paymentStatus ?? 'pending',
      paymentMethod: overrides.paymentMethod ?? null,
      storeCreditApplied: overrides.storeCreditApplied ?? 0,
      giftCardApplied: overrides.giftCardApplied ?? 0,
    },
  });
}

/** Create an order item (use sparingly; usually created through order POST). */
export async function createOrderItem(orderId: string, productId: string, overrides: Partial<{
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  // Digital product fields
  downloadUrl?: string | null;
  downloadCount?: number;
  downloadLimit?: number | null;
  downloadExpiry?: Date | null;
  isBackorder?: boolean;
}> = {}) {
  const p = await prisma();
  return p.orderItem.create({
    data: {
      orderId,
      productId,
      variantId: overrides.variantId ?? null,
      quantity: overrides.quantity ?? 1,
      unitPrice: overrides.unitPrice ?? 10,
      totalPrice: overrides.totalPrice ?? 10,
      downloadUrl: overrides.downloadUrl ?? null,
      downloadCount: overrides.downloadCount ?? 0,
      downloadLimit: overrides.downloadLimit ?? null,
      downloadExpiry: overrides.downloadExpiry ?? null,
      isBackorder: overrides.isBackorder ?? false,
    },
  });
}

/** Factory for the per-purchase download token. Mirrors the model
 *  added for the digital-products work. */
export async function createProductDownload(orderItemId: string, overrides: Partial<{
  token: string;
  expiresAt: Date | null;
  downloadCount: number;
  downloadLimit: number | null;
  sourceUrl: string;
}> = {}) {
  const p = await prisma();
  return p.productDownload.create({
    data: {
      orderItemId,
      token: overrides.token ?? uniq('dl-token'),
      expiresAt: overrides.expiresAt ?? null,
      downloadCount: overrides.downloadCount ?? 0,
      downloadLimit: overrides.downloadLimit ?? null,
      sourceUrl: overrides.sourceUrl ?? 'https://example.com/files/ebook.pdf',
    },
  });
}

/* ------------------------------------------------------------------
 * Factories for the inventory extensions
 * ----------------------------------------------------------------- */

export async function createWarehouse(overrides: Partial<{
  name: string; code: string; addressLine1: string; city: string; country: string;
  isActive: boolean; isDefault: boolean;
}> = {}) {
  const p = await prisma();
  const code = overrides.code ?? uniq('WH');
  return p.warehouse.create({
    data: {
      name: overrides.name ?? code,
      code,
      addressLine1: overrides.addressLine1 ?? null,
      city: overrides.city ?? null,
      country: overrides.country ?? null,
      isActive: overrides.isActive ?? true,
      isDefault: overrides.isDefault ?? false,
    },
  });
}

export async function createReorderRule(overrides: Partial<{
  productId: string; variantId: string; warehouseId: string;
  threshold: number; reorderQty: number; supplierName: string; supplierEmail: string;
  isActive: boolean;
}> = {}) {
  const p = await prisma();
  return p.reorderRule.create({
    data: {
      productId: overrides.productId,
      variantId: overrides.variantId ?? null,
      warehouseId: overrides.warehouseId ?? null,
      threshold: overrides.threshold ?? 10,
      reorderQty: overrides.reorderQty ?? 50,
      supplierName: overrides.supplierName ?? null,
      supplierEmail: overrides.supplierEmail ?? null,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createReorderDraft(overrides: Partial<{
  ruleId: string; productId: string; variantId: string; warehouseId: string;
  quantity: number; status: 'draft' | 'sent' | 'cancelled' | 'received';
  supplierName: string;
}> = {}) {
  const p = await prisma();
  return p.reorderDraft.create({
    data: {
      ruleId: overrides.ruleId ?? null,
      productId: overrides.productId,
      variantId: overrides.variantId ?? null,
      warehouseId: overrides.warehouseId ?? null,
      quantity: overrides.quantity ?? 10,
      status: overrides.status ?? 'draft',
      supplierName: overrides.supplierName ?? null,
    },
  });
}

export async function createStockReservation(overrides: Partial<{
  productId: string; variantId: string; warehouseId: string;
  quantity: number; reservedUntil: Date; releasedAt: Date;
  reason: string; cartItemId: string;
}> = {}) {
  const p = await prisma();
  return p.stockReservation.create({
    data: {
      productId: overrides.productId,
      variantId: overrides.variantId ?? null,
      warehouseId: overrides.warehouseId ?? null,
      quantity: overrides.quantity ?? 1,
      reservedUntil: overrides.reservedUntil ?? new Date(Date.now() + 60_000),
      releasedAt: overrides.releasedAt ?? null,
      reason: overrides.reason ?? 'cart_hold',
      cartItemId: overrides.cartItemId ?? null,
    },
  });
}

export async function createChannel(overrides: Partial<{
  name: string; displayName: string; type: 'online' | 'marketplace' | 'retail';
  isActive: boolean;
}> = {}) {
  const p = await prisma();
  return p.channel.create({
    data: {
      name: overrides.name ?? uniq('ch'),
      displayName: overrides.displayName ?? 'Test Channel',
      type: overrides.type ?? 'online',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createWebhookSecret(overrides: Partial<{
  provider: string; secret: string; isActive: boolean;
}> = {}) {
  const p = await prisma();
  return p.webhookSecret.create({
    data: {
      provider: overrides.provider ?? uniq('prov'),
      secret: overrides.secret ?? uniq('secret'),
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createStockTake(overrides: Partial<{
  warehouseId: string; name: string; notes: string; status: string;
  createdBy: string;
}> = {}) {
  const p = await prisma();
  return p.stockTake.create({
    data: {
      warehouseId: overrides.warehouseId,
      name: overrides.name ?? uniq('take'),
      notes: overrides.notes ?? null,
      createdBy: overrides.createdBy ?? null,
      status: overrides.status ?? 'in_progress',
    },
  });
}

/* ------------------------------------------------------------------
 * Factories for the typed-options system (first-class variants)
 * ----------------------------------------------------------------- */

/** Create an Option (e.g. "Color", "Size") on a product. */
export async function createOption(productId: string, overrides: Partial<{
  name: string;
  sortOrder: number;
}> = {}) {
  const p = await prisma();
  return p.option.create({
    data: {
      productId,
      name: overrides.name ?? 'Color',
      sortOrder: overrides.sortOrder ?? 0,
    },
  });
}

/** Create an OptionValue (e.g. "Red", "Small") on an Option. */
export async function createOptionValue(optionId: string, overrides: Partial<{
  value: string;
  swatch: string | null;
  sortOrder: number;
}> = {}) {
  const p = await prisma();
  return p.optionValue.create({
    data: {
      optionId,
      value: overrides.value ?? 'Default',
      swatch: overrides.swatch ?? null,
      sortOrder: overrides.sortOrder ?? 0,
    },
  });
}

/** Link a variant to a list of OptionValue ids via VariantOptionValue. */
export async function setVariantOptionValues(variantId: string, optionValueIds: string[]) {
  const p = await prisma();
  for (const optionValueId of optionValueIds) {
    await p.variantOptionValue.create({
      data: { variantId, optionValueId },
    });
  }
}
