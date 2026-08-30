// ---------------------------------------------------------------------------
// Shared web types (the type dictionary for views/components).
//
// Covers user, product, cart, order, review, coupon, shipping, settings,
// and API-envelope shapes. A few types overlap with lib/api.ts (which
// defines its own Product/CartItem next to its client) - api.ts is the
// older home; new imports should come from here. Keep the two in sync
// when the API shape changes, or check which one the caller uses.
// ---------------------------------------------------------------------------

// User types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  role: 'customer' | 'admin' | 'manager';
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface UserAddress {
  id: string;
  userId: string;
  type: 'shipping' | 'billing';
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  isDefault: boolean;
}

// Product types
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  sku: string;
  type: 'physical' | 'digital';
  status: 'draft' | 'active' | 'inactive' | 'archived';
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  images: ProductImage[];
  category: Category;
  variants: ProductVariant[];
  averageRating: number;
  reviewCount: number;
  /** Digital product fields. Populated when `type === 'digital'`,
   * but always present in the API response. */
  downloadUrl: string | null;
  downloadLimit: number | null;
  /** Number of days the per-order link is valid. */
  downloadExpiry: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  slug?: string | null;
  price: number;
  compareAtPrice?: number | null;
  quantity: number;
  attributes: Record<string, string>;
  isActive: boolean;
  sortOrder?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  description?: string;
  parentId?: string;
  children?: Category[];
  _count?: {
    products: number;
  };
}

// Cart types
export interface CartItem {
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  variant?: string;
  variantId?: string;
  category: string;
  image?: string;
  /** When `'digital'`, the cart UX can skip shipping and show
   * "instant delivery". Optional so existing localStorage carts
   * (pre-this-feature) still load. */
  type?: 'physical' | 'digital';
}

// Order types
export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  shippingAddressId?: string;
  shippingAddress?: UserAddress;
  shippingMethodId?: string;
  shippingMethod?: ShippingMethod;
  trackingNumber?: string;
  paymentMethod?: string;
  paymentStatus: PaymentStatus;
  notes?: string;
  adminNotes?: string;
  items: OrderItem[];
  user?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  createdAt: string;
  updatedAt: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  product?: Product;
  variantId?: string;
  variant?: ProductVariant;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** Digital-line snapshot. Mirrored from the product at order
   * time so changes to the underlying product don't rewrite
   * history. `downloadUrl` is the source URL; the per-order token
   * is delivered separately by the order confirmation. */
  downloadUrl?: string | null;
  downloadCount?: number;
  downloadLimit?: number | null;
  downloadExpiry?: Date | string | null;
  /** Active ProductDownload rows for this order item. Minted at
   * order creation and returned in the order response so the
   * storefront can render the "Download now" buttons. */
  downloads?: Array<{
    id: string;
    token: string;
    expiresAt: string | null;
    downloadLimit: number | null;
    downloadCount: number;
    sourceUrl: string;
  }>;
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

// Review types
export interface ReviewPhoto {
  id: string;
  reviewId: string;
  url: string;
  thumbnail: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Review {
  id: string;
  userId: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatar'>;
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
  /**
   * True when the reviewer has a non-cancelled / non-refunded
   * order containing this product. The route sets this server-
   * side; the storefront just renders the badge.
   */
  isVerified: boolean;
  isApproved: boolean;
  /** Photo gallery, sorted ascending by sortOrder. */
  photos: ReviewPhoto[];
  createdAt: string;
  updatedAt: string;
}

// Coupon types
export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  startsAt?: string;
  expiresAt?: string;
}

// Shipping types
export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  states: string[];
  zipCodes: string[];
  isActive: boolean;
  methods: ShippingMethod[];
}

export interface ShippingMethod {
  id: string;
  zoneId: string;
  name: string;
  description?: string;
  type: string;
  baseRate: number;
  freeShippingThreshold?: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  isActive: boolean;
}

// Store settings types
export interface StoreSettings {
  id: string;
  storeName: string;
  storeDescription?: string;
  storeEmail: string;
  storePhone?: string;
  storeAddress?: string;
  storeCity?: string;
  storeState?: string;
  storeZipCode?: string;
  storeCountry: string;
  currency: string;
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  weightUnit: 'kg' | 'lb';
  dimensionUnit: 'cm' | 'in';
  timezone: string;
  dateFormat: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  youtubeUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  googleAnalyticsId?: string;
  googleTagManagerId?: string;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  returnPolicyUrl?: string;
}

// API response types
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T;
  message?: string;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Analytics types
export interface AnalyticsEvent {
  eventType: 'view' | 'click' | 'add_to_cart' | 'purchase' | 'search' | 'wishlist';
  productId?: string;
  categoryId?: string;
  searchQuery?: string;
  metadata?: Record<string, unknown>;
}

// Toast notification types
export interface ToastMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}
