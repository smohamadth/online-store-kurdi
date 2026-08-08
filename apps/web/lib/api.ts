'use client';

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
  price: number;
  quantity: number;
  attributes: string;
  isActive: boolean;
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
        throw new Error(`API error: ${response.status}`);
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