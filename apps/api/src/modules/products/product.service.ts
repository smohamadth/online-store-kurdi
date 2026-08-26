import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { NotFoundError, ConflictError, AppError } from '../../middleware/errorHandler';
import slugify from 'slugify';
import {
  CreateProductInput,
  UpdateProductInput,
  ProductQuery,
  ProductResponse,
  ProductListResponse,
} from './product.types';

export class ProductService {
  private prisma: PrismaClient;
  private cachePrefix = 'product:';
  private cacheTTL = 3600; // 1 hour

  constructor() {
    this.prisma = prisma;
  }

  // Create a new product
  async createProduct(data: CreateProductInput): Promise<ProductResponse> {
    try {
      // Generate slug if not provided
      const slug = data.slug || slugify(data.name, { lower: true, strict: true });

      // Check if slug already exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { slug },
      });

      if (existingProduct) {
        throw new ConflictError(`Product with slug "${slug}" already exists`);
      }

      // Check if SKU already exists
      const existingSku = await this.prisma.product.findUnique({
        where: { sku: data.sku },
      });

      if (existingSku) {
        throw new ConflictError(`Product with SKU "${data.sku}" already exists`);
      }

      // Create product with images and variants
      const product = await this.prisma.product.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          shortDescription: data.shortDescription,
          sku: data.sku,
          type: data.type,
          status: data.status,
          price: data.price,
          compareAtPrice: data.compareAtPrice,
          costPrice: data.costPrice,
          trackInventory: data.trackInventory,
          quantity: data.quantity,
          lowStockThreshold: data.lowStockThreshold,
          downloadUrl: data.downloadUrl,
          downloadLimit: data.downloadLimit,
          downloadExpiry: data.downloadExpiry,
          weight: data.weight,
          weightUnit: data.weightUnit,
          dimensions: data.dimensions,
          categoryId: data.categoryId,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          images: {
            create: data.images,
          },
          variants: {
            create: data.variants,
          },
        },
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: {
            select: {
              rating: true,
            },
          },
        },
      });

      // Clear cache
      await this.clearProductCache();

      logger.info(`Product created: ${product.name} (${product.id})`);
      return this.formatProductResponse(product);
    } catch (error) {
      logger.error('Error creating product:', error);
      throw error;
    }
  }

  // Get product by ID
  async getProductById(id: string): Promise<ProductResponse> {
    try {
      // Check cache first
      const cached = await cache.get<ProductResponse>(`${this.cachePrefix}${id}`);
      if (cached) {
        return cached;
      }

      const product = await this.prisma.product.findUnique({
        where: { id },
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: {
            select: {
              rating: true,
            },
          },
        },
      });

      if (!product) {
        throw new NotFoundError('Product');
      }

      const response = this.formatProductResponse(product);

      // Cache the result
      await cache.set(`${this.cachePrefix}${id}`, response, this.cacheTTL);

      return response;
    } catch (error) {
      logger.error(`Error getting product ${id}:`, error);
      throw error;
    }
  }

  // Get product by slug
  async getProductBySlug(slug: string): Promise<ProductResponse> {
    try {
      // Check cache first
      const cached = await cache.get<ProductResponse>(`${this.cachePrefix}slug:${slug}`);
      if (cached) {
        return cached;
      }

      const product = await this.prisma.product.findUnique({
        where: { slug },
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: {
            select: {
              rating: true,
            },
          },
        },
      });

      if (!product) {
        throw new NotFoundError('Product');
      }

      const response = this.formatProductResponse(product);

      // Cache the result
      await cache.set(`${this.cachePrefix}slug:${slug}`, response, this.cacheTTL);

      return response;
    } catch (error) {
      logger.error(`Error getting product by slug ${slug}:`, error);
      throw error;
    }
  }

  // Get products with filtering and pagination
  async getProducts(query: ProductQuery): Promise<ProductListResponse> {
    try {
      const { page, limit, category, type, status, minPrice, maxPrice, search, sort, inStock } = query;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: Prisma.ProductWhereInput = {
        ...(category && { category: { slug: category } }),
        ...(type && { type }),
        ...(status && { status }),
        ...(minPrice && { price: { gte: minPrice } }),
        ...(maxPrice && { price: { ...((minPrice && { gte: minPrice }) || {}), lte: maxPrice } }),
        ...(inStock && { quantity: { gt: 0 } }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      // Build order by clause
      let orderBy: Prisma.ProductOrderByWithRelationInput;
      switch (sort) {
        case 'price_asc':
          orderBy = { price: 'asc' };
          break;
        case 'price_desc':
          orderBy = { price: 'desc' };
          break;
        case 'name_asc':
          orderBy = { name: 'asc' };
          break;
        case 'name_desc':
          orderBy = { name: 'desc' };
          break;
        case 'popular':
          orderBy = { reviews: { _count: 'desc' } };
          break;
        case 'newest':
        default:
          orderBy = { createdAt: 'desc' };
          break;
      }

      // Execute query
      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: {
            images: true,
            category: true,
            variants: true,
            reviews: {
              select: {
                rating: true,
              },
            },
          },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      const formattedProducts = products.map(this.formatProductResponse);

      return {
        products: formattedProducts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Error getting products:', error);
      throw error;
    }
  }

  // Update product
  async updateProduct(id: string, data: UpdateProductInput): Promise<ProductResponse> {
    try {
      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        throw new NotFoundError('Product');
      }

      // Check slug uniqueness if being updated
      if (data.slug && data.slug !== existingProduct.slug) {
        const slugExists = await this.prisma.product.findUnique({
          where: { slug: data.slug },
        });

        if (slugExists) {
          throw new ConflictError(`Product with slug "${data.slug}" already exists`);
        }
      }

      // Check SKU uniqueness if being updated
      if (data.sku && data.sku !== existingProduct.sku) {
        const skuExists = await this.prisma.product.findUnique({
          where: { sku: data.sku },
        });

        if (skuExists) {
          throw new ConflictError(`Product with SKU "${data.sku}" already exists`);
        }
      }

      // Update product
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...data,
          slug: data.slug || (data.name ? slugify(data.name, { lower: true, strict: true }) : undefined),
        },
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: {
            select: {
              rating: true,
            },
          },
        },
      });

      // Clear cache
      await this.clearProductCache();

      logger.info(`Product updated: ${product.name} (${product.id})`);
      return this.formatProductResponse(product);
    } catch (error) {
      logger.error(`Error updating product ${id}:`, error);
      throw error;
    }
  }

  // Delete product
  async deleteProduct(id: string): Promise<void> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id },
      });

      if (!product) {
        throw new NotFoundError('Product');
      }

      // Soft delete by setting status to archived
      await this.prisma.product.update({
        where: { id },
        data: { status: 'archived' },
      });

      // Clear cache
      await this.clearProductCache();

      logger.info(`Product archived: ${product.name} (${product.id})`);
    } catch (error) {
      logger.error(`Error deleting product ${id}:`, error);
      throw error;
    }
  }

  // Get featured products
  async getFeaturedProducts(limit: number = 10): Promise<ProductResponse[]> {
    try {
      const cached = await cache.get<ProductResponse[]>(`${this.cachePrefix}featured:${limit}`);
      if (cached) {
        return cached;
      }

      const products = await this.prisma.product.findMany({
        where: {
          status: 'active',
          type: 'physical',
        },
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: {
            select: {
              rating: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      const response = products.map(this.formatProductResponse);

      await cache.set(`${this.cachePrefix}featured:${limit}`, response, this.cacheTTL);

      return response;
    } catch (error) {
      logger.error('Error getting featured products:', error);
      throw error;
    }
  }

  // Get related products
  async getRelatedProducts(productId: string, limit: number = 6): Promise<ProductResponse[]> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true },
      });

      if (!product) {
        throw new NotFoundError('Product');
      }

      const products = await this.prisma.product.findMany({
        where: {
          categoryId: product.categoryId,
          status: 'active',
          id: { not: productId },
        },
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: {
            select: {
              rating: true,
            },
          },
        },
        take: limit,
      });

      return products.map(this.formatProductResponse);
    } catch (error) {
      logger.error(`Error getting related products for ${productId}:`, error);
      throw error;
    }
  }

  // Search products
  async searchProducts(query: string, limit: number = 10): Promise<ProductResponse[]> {
    try {
      const products = await this.prisma.product.findMany({
        where: {
          status: 'active',
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: {
            select: {
              rating: true,
            },
          },
        },
        take: limit,
      });

      return products.map(this.formatProductResponse);
    } catch (error) {
      logger.error(`Error searching products with query "${query}":`, error);
      throw error;
    }
  }

  // Format product response
  private formatProductResponse(product: any): ProductResponse {
    const ratings = product.reviews.map((r: any) => r.rating);
    const averageRating = ratings.length > 0
      ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
      : 0;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      sku: product.sku,
      type: product.type,
      status: product.status,
      price: Number(product.price),
      compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
      quantity: product.quantity,
      images: product.images.map((img: any) => ({
        id: img.id,
        url: img.url,
        alt: img.alt,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
      })),
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
        image: product.category.image,
      },
      variants: product.variants.map((variant: any) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        price: Number(variant.price),
        quantity: variant.quantity,
        attributes: variant.attributes as Record<string, string>,
        isActive: variant.isActive,
      })),
      averageRating: Math.round(averageRating * 10) / 10,
      reviewCount: ratings.length,
      downloadUrl: product.downloadUrl ?? null,
      downloadLimit: product.downloadLimit ?? null,
      downloadExpiry: product.downloadExpiry ?? null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  // Clear product cache
  private async clearProductCache(): Promise<void> {
    try {
      const keys = await cache.keys(`${this.cachePrefix}*`);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => cache.del(key)));
      }
    } catch (error) {
      logger.error('Error clearing product cache:', error);
    }
  }
}

export default new ProductService();