// Zod schemas + types for the product controller/service trio.
// NOTE: product.controller.ts and product.service.ts are legacy (not
// imported by the live product.routes.ts), so these schemas are not
// exercised by the API - product.routes.ts defines its own inline
// create/update/query schemas. Kept in sync with the live shapes where
// practical, but treat product.routes.ts as the source of truth.
import { z } from 'zod';

// Product type enum
export const ProductType = z.enum(['physical', 'digital']);
export type ProductType = z.infer<typeof ProductType>;

// Product status enum
export const ProductStatus = z.enum(['draft', 'active', 'inactive', 'archived']);
export type ProductStatus = z.infer<typeof ProductStatus>;

// Create product schema
export const CreateProductSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().min(1),
  shortDescription: z.string().optional(),
  sku: z.string().min(1).max(100),
  type: ProductType.default('physical'),
  status: ProductStatus.default('draft'),
  price: z.number().finite().positive(),
  compareAtPrice: z.number().finite().positive().optional(),
  costPrice: z.number().finite().positive().optional(),
  trackInventory: z.boolean().default(true),
  quantity: z.number().finite().int().min(0).default(0),
  lowStockThreshold: z.number().finite().int().min(0).default(10),
  downloadUrl: z.string().url().optional(),
  downloadLimit: z.number().finite().int().positive().optional(),
  downloadExpiry: z.number().finite().int().positive().optional(),
  weight: z.number().finite().positive().optional(),
  weightUnit: z.enum(['kg', 'lb', 'oz', 'g']).default('kg'),
  dimensions: z.object({
    length: z.number().finite().positive(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    unit: z.enum(['cm', 'in', 'm', 'ft']).default('cm'),
  }).optional(),
  categoryId: z.string().uuid(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
  metaKeywords: z.array(z.string()).default([]),
  images: z.array(z.object({
    url: z.string(),
    alt: z.string().optional(),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().finite().int().default(0),
  })).default([]),
  variants: z.array(z.object({
    name: z.string(),
    sku: z.string(),
    price: z.number().finite().positive(),
    quantity: z.number().finite().int().min(0).default(0),
    attributes: z.record(z.string()),
    isActive: z.boolean().default(true),
  })).default([]),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

// Update product schema
export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

// Product query schema
export const ProductQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  category: z.string().optional(),
  type: ProductType.optional(),
  status: ProductStatus.optional(),
  minPrice: z.string().transform(Number).optional(),
  maxPrice: z.string().transform(Number).optional(),
  search: z.string().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'name_asc', 'name_desc', 'newest', 'popular']).default('newest'),
  inStock: z.string().transform(Boolean).optional(),
});

export type ProductQuery = z.infer<typeof ProductQuerySchema>;

// Product response type
export interface ProductResponse {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  sku: string;
  type: string;
  status: string;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  images: ProductImageResponse[];
  category: CategoryResponse;
  variants: ProductVariantResponse[];
  averageRating: number;
  reviewCount: number;
  /** Digital-product fields. Only meaningful when `type === 'digital'`,
   * but we always return them so the storefront doesn't have to branch
   * on the type before deciding what to render. */
  downloadUrl: string | null;
  /** Derived from downloadUrl's extension; present on the public API
   * instead of the raw URL (which stays admin-only). */
  fileFormat: string | null;
  downloadLimit: number | null;
  /** Number of days from order placement until the per-order link
   * expires. `null` means no expiry. */
  downloadExpiry: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImageResponse {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  image: string | null;
}

export interface ProductVariantResponse {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  attributes: Record<string, string>;
  isActive: boolean;
}

// Product list response
export interface ProductListResponse {
  products: ProductResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}