const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  sku: string;
  type: 'physical' | 'digital';
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
  attributes: Record<string, string>;
  isActive: boolean;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: Product;
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

// API client class
class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // Set authentication token
  setToken(token: string | null) {
    this.token = token;
  }

  // Get headers
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  // Make request
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }

    return data;
  }

  // Products
  async getProducts(params?: {
    page?: number;
    limit?: number;
    category?: string;
    type?: string;
    minPrice?: number;
    maxPrice?: number;
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

  async searchProducts(query: string, limit?: number): Promise<ApiResponse<Product[]>> {
    return this.request(`/products/search?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`);
  }

  async getRelatedProducts(productId: string, limit?: number): Promise<ApiResponse<Product[]>> {
    return this.request(`/products/${productId}/related${limit ? `?limit=${limit}` : ''}`);
  }

  // Recommendations
  async getTrendingProducts(limit?: number): Promise<ApiResponse<Product[]>> {
    return this.request(`/recommendations/trending${limit ? `?limit=${limit}` : ''}`);
  }

  async getNewArrivals(limit?: number): Promise<ApiResponse<Product[]>> {
    return this.request(`/recommendations/new-arrivals${limit ? `?limit=${limit}` : ''}`);
  }

  async getAlsoBought(productId: string, limit?: number): Promise<ApiResponse<Product[]>> {
    return this.request(`/recommendations/also-bought/${productId}${limit ? `?limit=${limit}` : ''}`);
  }

  async getBasedOnHistory(limit?: number): Promise<ApiResponse<Product[]>> {
    return this.request(`/recommendations/history${limit ? `?limit=${limit}` : ''}`);
  }

  // Authentication
  async login(email: string, password: string): Promise<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>> {
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
    phone?: string;
  }): Promise<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
    return this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request('/auth/me');
  }

  // Orders
  async getOrders(params?: { page?: number; limit?: number; status?: string }): Promise<ApiResponse<Order[]>> {
    const searchParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    const query = searchParams.toString();
    return this.request(`/orders${query ? `?${query}` : ''}`);
  }

  async getOrder(id: string): Promise<ApiResponse<Order>> {
    return this.request(`/orders/${id}`);
  }

  async createOrder(data: {
    items: Array<{ productId: string; variantId?: string; quantity: number }>;
    shippingAddressId?: string;
    paymentMethod?: string;
    notes?: string;
  }): Promise<ApiResponse<Order>> {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelOrder(id: string, reason?: string): Promise<ApiResponse<Order>> {
    return this.request(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Users
  async getUser(id: string): Promise<ApiResponse<User>> {
    return this.request(`/users/${id}`);
  }

  async updateUser(id: string, data: Partial<User>): Promise<ApiResponse<User>> {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getUserOrders(id: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<Order[]>> {
    const searchParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    const query = searchParams.toString();
    return this.request(`/users/${id}/orders${query ? `?${query}` : ''}`);
  }

  async getUserWishlist(id: string): Promise<ApiResponse<any[]>> {
    return this.request(`/users/${id}/wishlist`);
  }

  // Analytics
  async trackEvent(event: {
    eventType: string;
    productId?: string;
    categoryId?: string;
    searchQuery?: string;
    metadata?: Record<string, any>;
  }): Promise<ApiResponse<void>> {
    return this.request('/analytics/track', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }
}

// Create API client instance
export const api = new ApiClient(API_URL);

// SWR fetcher
export const fetcher = (url: string) => api.request(url).then((res) => res.data);

export default api;