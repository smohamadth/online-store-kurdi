import { Request, Response, NextFunction } from 'express';
import { ProductService } from './product.service';
import { logger } from '../../utils/logger';
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductQuerySchema,
} from './product.types';

export class ProductController {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  // Create a new product
  createProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validatedData = CreateProductSchema.parse(req.body);

      // Create product
      const product = await this.productService.createProduct(validatedData);

      // Track analytics event
      await this.trackEvent(req, 'product_created', { productId: product.id });

      res.status(201).json({
        status: 'success',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get product by ID
  getProductById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const product = await this.productService.getProductById(id);

      // Track view event
      await this.trackEvent(req, 'view', { productId: product.id });

      res.json({
        status: 'success',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get product by slug
  getProductBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const product = await this.productService.getProductBySlug(slug);

      // Track view event
      await this.trackEvent(req, 'view', { productId: product.id });

      res.json({
        status: 'success',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get products with filtering and pagination
  getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query parameters
      const validatedQuery = ProductQuerySchema.parse(req.query);

      // Get products
      const result = await this.productService.getProducts(validatedQuery);

      res.json({
        status: 'success',
        data: result.products,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  // Update product
  updateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = UpdateProductSchema.parse(req.body);

      // Update product
      const product = await this.productService.updateProduct(id, validatedData);

      // Track update event
      await this.trackEvent(req, 'product_updated', { productId: product.id });

      res.json({
        status: 'success',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete product
  deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Delete product (soft delete)
      await this.productService.deleteProduct(id);

      // Track delete event
      await this.trackEvent(req, 'product_deleted', { productId: id });

      res.json({
        status: 'success',
        message: 'Product archived successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get featured products
  getFeaturedProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const products = await this.productService.getFeaturedProducts(limit);

      res.json({
        status: 'success',
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get related products
  getRelatedProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 6;
      const products = await this.productService.getRelatedProducts(id, limit);

      res.json({
        status: 'success',
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  // Search products
  searchProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q } = req.query;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          status: 'error',
          message: 'Search query is required',
        });
      }

      const products = await this.productService.searchProducts(q, limit);

      // Track search event
      await this.trackEvent(req, 'search', { searchQuery: q, resultsCount: products.length });

      res.json({
        status: 'success',
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  // Track analytics event
  private async trackEvent(req: Request, eventType: string, metadata: any = {}) {
    try {
      // This will be implemented in the analytics module
      // For now, we'll just log it
      logger.debug(`Analytics event: ${eventType}`, {
        userId: req.user?.id,
        sessionId: req.headers['x-session-id'] || 'anonymous',
        eventType,
        metadata,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      });
    } catch (error) {
      // Don't fail the request if analytics tracking fails
      logger.error('Error tracking analytics event:', error);
    }
  }
}

export default new ProductController();