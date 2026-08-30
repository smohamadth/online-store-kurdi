// ---------------------------------------------------------------------------
// Storefront API types + the original ApiClient + image URL helpers.
//
// What lives here and who uses it:
//   - the shared DATA TYPES (Product, Category, ProductVariant, ...) -
//     imported by most views;
//   - the ApiClient singleton (`api`) - the FIRST client, still used by
//     ~39 files. Newer code should use lib/http.ts (http / authHttp),
//     which centralises auth + ApiError; the two coexist;
//   - getImageUrl() / getProductImage() / getCategoryEmoji() - used
//     everywhere images are rendered.
//
// NOTE the local API_URL fallback to localhost:3001: it only matters in
// dev; lib/apiBase.ts is the source of truth for the browser-safe base
// (loopback bases can't be reached from a user's browser).
// ---------------------------------------------------------------------------
'use client';

import { API_BASE, CLIENT_API_BASE } from './apiBase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface Product {
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
  images: ProductImage[];
  category: Category;
  variants: ProductVariant[];
  averageRating: number;
  reviewCount: number;
  /** Digital product fields. Returned by the API for every product;
   * meaningful only when `type === 'digital'`. */
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

export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string | null;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  slug?: string | null;
  price: number;
  compareAtPrice?: number | null;
  quantity: number;
  attributes: string;
  isActive: boolean;
  sortOrder?: number;
}

export interface ApiResponse<T> {
  status: string;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API Client
class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        // Surface the server's actual message ("Insufficient stock for X",
        // validation details, ...) instead of a bare status code. Callers were
        // showing "API error: 400" or swallowing it entirely.
        let message = `Request failed (${response.status})`;
        try {
          const body = await response.json();
          if (Array.isArray(body?.errors) && body.errors.length) {
            message = body.errors
              .map((e: any) => (e.field ? `${e.field}: ${e.message}` : e.message))
              .join(', ');
          } else if (body?.message) {
            message = body.message;
          }
        } catch {
          /* non-JSON error body - keep the status message */
        }
        const err = new Error(message) as Error & { status?: number };
        err.status = response.status;
        throw err;
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Products
  async getProducts(params?: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
    sort?: string;
  }): Promise<ApiResponse<Product[]>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return this.request(`/products${query ? `?${query}` : ''}`);
  }

  async getProduct(id: string): Promise<ApiResponse<Product>> {
    return this.request(`/products/${id}`);
  }

  async getProductBySlug(slug: string): Promise<ApiResponse<Product>> {
    return this.request(`/products/slug/${slug}`);
  }

  async getFeaturedProducts(limit?: number): Promise<ApiResponse<Product[]>> {
    return this.request(`/products/featured${limit ? `?limit=${limit}` : ''}`);
  }

  async searchProducts(query: string): Promise<ApiResponse<Product[]>> {
    return this.request(`/products/search?q=${encodeURIComponent(query)}`);
  }

  async getRelatedProducts(productId: string): Promise<ApiResponse<Product[]>> {
    return this.request(`/products/${productId}/related`);
  }

  // Recommendations
  async getTrendingProducts(): Promise<ApiResponse<Product[]>> {
    return this.request('/recommendations/trending');
  }

  async getNewArrivals(): Promise<ApiResponse<Product[]>> {
    return this.request('/recommendations/new-arrivals');
  }

  // Categories
  async getCategories(): Promise<ApiResponse<Category[]>> {
    return this.request('/categories');
  }

  // Auth
  async login(email: string, password: string): Promise<ApiResponse<any>> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCurrentUser(token: string): Promise<ApiResponse<any>> {
    return this.request('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Orders
  async createOrder(token: string, data: any): Promise<ApiResponse<any>> {
    return this.request('/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  async getOrders(token: string): Promise<ApiResponse<any>> {
    return this.request('/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getOrder(token: string, orderId: string): Promise<ApiResponse<any>> {
    return this.request(`/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Customer-facing status timeline for the order detail page.
  async getOrderTracking(token: string, orderId: string): Promise<ApiResponse<any>> {
    return this.request(`/orders/${orderId}/tracking`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Analytics
  async trackEvent(event: {
    eventType: string;
    productId?: string;
    searchQuery?: string;
  }): Promise<void> {
    try {
      await this.request('/analytics/track', {
        method: 'POST',
        body: JSON.stringify(event),
      });
    } catch (error) {
      // Don't fail if analytics fails
      console.error('Analytics tracking failed:', error);
    }
  }
}

// Export singleton instance
export const api = new ApiClient();

// Helper to get full image URL
export function getImageUrl(url: string | undefined | null): string {
  if (!url) return '';
  // Already a full URL (http/https) or data URI
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  // Loopback API base (dev / proxied preview): the browser cannot reach
  // 127.0.0.1:3001 - that is the SERVER's loopback, not the reader's
  // machine. Resolve images against the page's own origin instead: the
  // web app serves /images/* from public/, and /uploads/* (files the
  // API stores) is proxied to the API by the rewrites in next.config.js.
  if (CLIENT_API_BASE === '/api') {
    return url;
  }
  // Relative URL on a real deployment - prepend the API base
  const baseUrl = API_BASE.replace('/api', '');
  return `${baseUrl}${url}`;
}

// Helper to get appropriate image size for context
export function getProductImage(image: any, context: 'thumbnail' | 'card' | 'detail' | 'zoom' = 'card'): string {
  if (!image) return '';
  
  // Try to use specific variant based on context
  let url = '';
  switch (context) {
    case 'thumbnail':
      url = image.thumbnail || image.url;
      break;
    case 'card':
      url = image.medium || image.thumbnail || image.url;
      break;
    case 'detail':
      url = image.large || image.medium || image.url;
      break;
    case 'zoom':
      url = image.zoom || image.large || image.url;
      break;
    default:
      url = image.url;
  }
  
  return getImageUrl(url);
}

// Helper to get category emoji
export function getCategoryEmoji(category: string): string {
  switch (category?.toLowerCase()) {
    case 'electronics': return '📱';
    case 'clothing': return '👕';
    case 'books': return '📚';
    case 'digital products': return '💻';
    default: return '📦';
  }
}