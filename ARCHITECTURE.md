# 🏗️ Online Store Architecture & Technical Deep Dive

## 📋 Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Tech Stack Overview](#tech-stack-overview)
3. [Frontend Architecture (Next.js)](#frontend-architecture-nextjs)
4. [Backend Architecture (Express.js)](#backend-architecture-expressjs)
5. [Database Design](#database-design)
6. [Authentication & Security](#authentication--security)
7. [Product Management](#product-management)
8. [Order Processing](#order-processing)
9. [Analytics & ML System](#analytics--ml-system)
10. [Recommendation Engine](#recommendation-engine)
11. [SEO Implementation](#seo-implementation)
12. [File Storage](#file-storage)
13. [Real-time Features](#real-time-features)
14. [Data Flow](#data-flow)
15. [Security Considerations](#security-considerations)
16. [Performance Optimization](#performance-optimization)
17. [Scalability](#scalability)

---

## 🎯 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Next.js Frontend (React)                               │   │
│  │  • Server-Side Rendering (SSR)                          │   │
│  │  • Static Site Generation (SSG)                         │   │
│  │  • Client-Side Hydration                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express.js API Server                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  REST API Layer                                         │   │
│  │  • Authentication (JWT)                                 │   │
│  │  • Rate Limiting                                        │   │
│  │  • Input Validation (Zod)                               │   │
│  │  • Error Handling                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Business Logic Layer                                   │   │
│  │  • Product Service                                      │   │
│  │  • Order Service                                        │   │
│  │  • User Service                                         │   │
│  │  • Analytics Service                                    │   │
│  │  • Recommendation Service                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Data Access Layer                                      │   │
│  │  • Prisma ORM                                           │   │
│  │  • Redis Cache                                          │   │
│  │  • MinIO Storage                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  PostgreSQL  │  │    Redis     │  │    MinIO     │        │
│  │  (Primary DB)│  │   (Cache)    │  │  (Storage)   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack Overview

### **Frontend**
- **Next.js 14** - React framework with SSR/SSG
- **React 18** - UI library
- **Tailwind CSS** - Utility-first CSS
- **TypeScript** - Type safety

### **Backend**
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Prisma** - Database ORM
- **JWT** - Authentication
- **Zod** - Input validation

### **Database & Services**
- **PostgreSQL** - Primary database (SQLite for development)
- **Redis** - Caching layer
- **MinIO** - S3-compatible file storage
- **Socket.IO** - Real-time communication

### **DevOps**
- **Docker** - Containerization
- **npm** - Package management
- **ESLint** - Code linting
- **Prettier** - Code formatting

---

## 🖥️ Frontend Architecture (Next.js)

### **Why Next.js?**

Next.js was chosen for:
1. **SEO Optimization** - Server-side rendering for search engines
2. **Performance** - Automatic code splitting, image optimization
3. **Developer Experience** - Hot reloading, TypeScript support
4. **Production Ready** - Built-in optimization, caching

### **App Router Structure**

```
apps/web/
├── app/
│   ├── layout.tsx          # Root layout (header, footer)
│   ├── page.tsx            # Home page (/)
│   ├── products/
│   │   ├── page.tsx        # Products listing (/products)
│   │   └── [slug]/
│   │       └── page.tsx    # Product detail (/products/:slug)
│   ├── cart/
│   │   └── page.tsx        # Shopping cart (/cart)
│   ├── checkout/
│   │   └── page.tsx        # Checkout (/checkout)
│   └── account/
│       └── page.tsx        # User account (/account)
├── components/
│   ├── ui/                 # Reusable UI components
│   └── shop/               # Shop-specific components
└── lib/
    └── api.ts              # API client
```

### **Server-Side Rendering (SSR)**

```typescript
// app/products/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const product = await fetchProduct(params.slug);
  return {
    title: product.name,
    description: product.description,
    openGraph: {
      images: product.images,
    },
  };
}

export default async function ProductPage({ params }) {
  const product = await fetchProduct(params.slug);
  return <ProductDetail product={product} />;
}
```

**Benefits:**
- Search engines see full content
- Faster initial page load
- Better Core Web Vitals scores

### **Static Site Generation (SSG)**

```typescript
// Generate static pages at build time
export async function generateStaticParams() {
  const products = await fetchProducts();
  return products.map((product) => ({
    slug: product.slug,
  }));
}
```

**Benefits:**
- Pages served from CDN
- No server processing per request
- Instant page loads

### **Client-Side Hydration**

```typescript
'use client';

import { useState } from 'react';

export function AddToCart({ productId }) {
  const [quantity, setQuantity] = useState(1);
  
  const handleAddToCart = async () => {
    await fetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    });
  };

  return (
    <button onClick={handleAddToCart}>
      Add to Cart
    </button>
  );
}
```

**Benefits:**
- Interactive UI after page load
- Smooth user experience
- Real-time updates

---

## ⚙️ Backend Architecture (Express.js)

### **Why Express.js?**

1. **Simplicity** - Minimal, unopinionated framework
2. **Flexibility** - Structure code as you want
3. **Ecosystem** - Thousands of middleware packages
4. **Performance** - Fast, lightweight
5. **Community** - Large, active community

### **Application Structure**

```
apps/api/
├── src/
│   ├── config/
│   │   ├── environment.ts   # Environment variables
│   │   ├── database.ts      # Prisma client
│   │   ├── redis.ts         # Redis client
│   │   └── minio.ts         # MinIO client
│   │
│   ├── middleware/
│   │   ├── auth.ts          # Authentication
│   │   ├── validation.ts    # Input validation
│   │   ├── errorHandler.ts  # Error handling
│   │   └── rateLimit.ts     # Rate limiting
│   │
│   ├── modules/
│   │   ├── products/        # Product management
│   │   ├── orders/          # Order processing
│   │   ├── users/           # User management
│   │   ├── auth/            # Authentication
│   │   ├── analytics/       # Analytics tracking
│   │   ├── recommendations/ # Recommendation engine
│   │   ├── payments/        # Payment processing
│   │   └── storage/         # File storage
│   │
│   ├── utils/
│   │   ├── logger.ts        # Winston logger
│   │   └── helpers.ts       # Utility functions
│   │
│   ├── app.ts               # Express app setup
│   └── server.ts            # Server entry point
│
└── prisma/
    ├── schema.prisma        # Database schema
    └── seed.ts              # Database seeder
```

### **Request Flow**

```
Client Request
      │
      ▼
┌─────────────────┐
│   Express.js    │
│   Middleware    │
│  (CORS, etc.)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Rate Limiter  │
│   (100 req/15m) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Route Handler  │
│  (/api/products)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Auth Check     │
│  (if needed)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validation     │
│  (Zod schema)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Controller     │
│  (business logic)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Service Layer  │
│  (data access)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Database     │
│   (PostgreSQL)  │
└─────────────────┘
```

### **Middleware Pipeline**

```typescript
// app.ts - Middleware setup
const app = express();

// 1. Security
app.use(helmet());

// 2. CORS
app.use(cors({ origin: 'http://localhost:3000' }));

// 3. Rate Limiting
app.use('/api/', rateLimit({ max: 100, windowMs: 15 * 60 * 1000 }));

// 4. Body Parsing
app.use(express.json({ limit: '10mb' }));

// 5. Compression
app.use(compression());

// 6. Logging
app.use(morgan('dev'));

// 7. Routes
app.use('/api/products', productRoutes);

// 8. Error Handling
app.use(errorHandler);
```

---

## 🗄️ Database Design

### **Why PostgreSQL?**

1. **ACID Compliance** - Reliable transactions
2. **JSON Support** - Flexible data storage
3. **Full-Text Search** - Built-in search
4. **Scalability** - Handles large datasets
5. **Extensions** - PostGIS, pg_trgm, etc.

### **Schema Overview**

```prisma
// Core Models
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  role      String   @default("customer")
  // ... more fields
}

model Product {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  price       Decimal
  categoryId  String
  // ... more fields
}

model Order {
  id          String   @id @default(uuid())
  userId      String
  status      String   @default("pending")
  totalAmount Decimal
  // ... more fields
}
```

### **Relationships**

```
User (1) ──── (N) Orders
User (1) ──── (N) Reviews
User (1) ──── (N) WishlistItems
User (1) ──── (N) CartItems

Product (1) ──── (N) Variants
Product (1) ──── (N) Images
Product (1) ──── (N) Reviews
Product (N) ──── (1) Category

Order (1) ──── (N) OrderItems
OrderItem (N) ──── (1) Product
OrderItem (N) ──── (1) Variant (optional)
```

### **Analytics/ML Tables**

```prisma
model UserEvent {
  id          String   @id @default(uuid())
  userId      String?
  sessionId   String
  eventType   String   // view, click, add_to_cart, purchase
  productId   String?
  metadata    Json
  timestamp   DateTime @default(now())
}

model ProductEmbedding {
  id          String   @id @default(uuid())
  productId   String   @unique
  embedding   Float[]  // Vector for ML
  modelVersion String
}

model UserPreference {
  id              String @id @default(uuid())
  userId          String @unique
  categoryScores  Json   // { "electronics": 0.8 }
  brandScores     Json   // { "apple": 0.9 }
  priceRange      Json   // { "min": 50, "max": 500 }
}
```

---

## 🔐 Authentication & Security

### **JWT Authentication Flow**

```
┌─────────┐         ┌─────────┐         ┌─────────┐
│  Client │         │  Server │         │Database │
└────┬────┘         └────┬────┘         └────┬────┘
     │                   │                   │
     │  POST /auth/login │                   │
     │──────────────────►│                   │
     │  {email, password}│                   │
     │                   │                   │
     │                   │  Find user        │
     │                   │──────────────────►│
     │                   │                   │
     │                   │  Verify password  │
     │                   │◄──────────────────│
     │                   │                   │
     │                   │  Generate JWT     │
     │                   │──────────────────►│
     │                   │                   │
     │  Return tokens    │                   │
     │◄──────────────────│                   │
     │  {accessToken,    │                   │
     │   refreshToken}   │                   │
     │                   │                   │
```

### **Token Structure**

```typescript
// Access Token (short-lived, 7 days)
{
  userId: "uuid",
  email: "user@example.com",
  role: "customer",
  iat: 1234567890,
  exp: 1234567890
}

// Refresh Token (long-lived, 30 days)
{
  userId: "uuid",
  type: "refresh",
  iat: 1234567890,
  exp: 1234567890
}
```

### **Password Hashing**

```typescript
import bcrypt from 'bcryptjs';

// Hash password (12 rounds)
const hashedPassword = await bcrypt.hash(password, 12);

// Verify password
const isValid = await bcrypt.compare(password, hashedPassword);
```

### **Role-Based Access Control**

```typescript
// Middleware
export const authorize = (...roles: string[]) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

// Usage
router.post('/products', 
  authenticate, 
  authorize('admin', 'manager'),
  createProduct
);
```

---

## 📦 Product Management

### **Product Schema**

```typescript
interface Product {
  id: string;
  name: string;
  slug: string;           // URL-friendly name
  description: string;
  shortDescription: string;
  sku: string;            // Stock Keeping Unit
  type: 'physical' | 'digital';
  status: 'draft' | 'active' | 'inactive' | 'archived';
  price: number;
  compareAtPrice: number; // Original price (for discounts)
  quantity: number;       // Inventory
  categoryId: string;
  metaTitle: string;      // SEO
  metaDescription: string; // SEO
  metaKeywords: string[];  // SEO
  images: ProductImage[];
  variants: ProductVariant[];
}
```

### **Slug Generation**

```typescript
import slugify from 'slugify';

function generateSlug(name: string): string {
  return slugify(name, {
    lower: true,      // Convert to lowercase
    strict: true,     // Strip special characters
    trim: true,       // Trim leading/trailing spaces
  });
}

// Example: "iPhone 15 Pro" → "iphone-15-pro"
```

### **Product Variants**

```typescript
interface ProductVariant {
  id: string;
  name: string;        // "128GB - Black"
  sku: string;         // "IPHONE-15-128-BK"
  price: number;       // Variant-specific price
  quantity: number;    // Variant-specific inventory
  attributes: {
    storage?: string;  // "128GB"
    color?: string;    // "Black"
    size?: string;     // "XL"
  };
}
```

### **Product Search**

```typescript
// PostgreSQL full-text search
const products = await prisma.product.findMany({
  where: {
    OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { sku: { contains: query, mode: 'insensitive' } },
    ],
  },
});
```

---

## 🛒 Order Processing

### **Order Flow**

```
┌─────────────────────────────────────────────────────────────┐
│                    Order Processing Flow                     │
└─────────────────────────────────────────────────────────────┘

1. Add to Cart
   └── Validate product availability
   └── Check inventory
   └── Store in cart

2. Checkout
   └── Validate cart items
   └── Calculate totals (subtotal, tax, shipping)
   └── Apply discounts/coupons
   └── Create order

3. Payment
   └── Process payment (Stripe)
   └── Update payment status
   └── Send confirmation

4. Fulfillment
   └── Update inventory
   └── Generate shipping label
   └── Track shipment

5. Completion
   └── Mark as delivered
   └── Request review
   └── Update analytics
```

### **Order Schema**

```typescript
interface Order {
  id: string;
  orderNumber: string;    // "ORD-1234567890"
  userId: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  
  // Pricing
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  
  // Shipping
  shippingAddressId: string;
  shippingMethod: string;
  trackingNumber: string;
  
  // Payment
  paymentMethod: string;
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentIntentId: string;  // Stripe ID
  
  // Items
  items: OrderItem[];
}
```

### **Inventory Management**

```typescript
// Decrement inventory on order
async function decrementInventory(productId: string, quantity: number) {
  await prisma.product.update({
    where: { id: productId },
    data: {
      quantity: {
        decrement: quantity,
      },
    },
  });
}

// Check low stock threshold
async function checkLowStock(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  
  if (product.quantity <= product.lowStockThreshold) {
    // Send notification
    await notifyLowStock(product);
  }
}
```

---

## 📊 Analytics & ML System

### **Event Tracking Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                    Analytics Pipeline                        │
└─────────────────────────────────────────────────────────────┘

User Action (view, click, purchase)
      │
      ▼
┌─────────────────┐
│  Event Tracker  │
│  (Client-side)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   API Endpoint  │
│ POST /analytics │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Event Processor │
│   (Server)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Database     │
│  (user_events)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Real-time      │
│  Counters       │
│   (Redis)       │
└─────────────────┘
```

### **Event Types**

```typescript
type EventType = 
  | 'view'           // Product page viewed
  | 'click'          // Product clicked
  | 'add_to_cart'    // Added to cart
  | 'remove_from_cart' // Removed from cart
  | 'purchase'       // Order completed
  | 'search'         // Search performed
  | 'wishlist'       // Added to wishlist
  | 'review';        // Review submitted
```

### **User Behavior Analysis**

```typescript
async function analyzeUserBehavior(userId: string) {
  const events = await prisma.userEvent.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: 1000,
  });

  return {
    viewedProducts: getViewedProducts(events),
    purchasedProducts: getPurchasedProducts(events),
    searchQueries: getSearchQueries(events),
    categoryPreferences: getCategoryPreferences(events),
    timePatterns: getTimePatterns(events),
    sessionDuration: calculateSessionDuration(events),
  };
}
```

### **Real-time Analytics**

```typescript
// Redis-based real-time counters
async function updateRealTimeCounters(event: UserEvent) {
  const today = new Date().toISOString().split('T')[0];
  
  // Daily event counter
  const key = `analytics:daily:${today}:${event.eventType}`;
  await redis.incr(key);
  await redis.expire(key, 86400); // 24 hours
  
  // Product view counter
  if (event.productId && event.eventType === 'view') {
    const productKey = `analytics:product:${event.productId}:views`;
    await redis.incr(productKey);
  }
}
```

---

## 🎯 Recommendation Engine

### **Recommendation Types**

#### **1. Collaborative Filtering**
"Users who bought X also bought Y"

```typescript
async function getAlsoBought(productId: string) {
  // Find users who bought this product
  const purchases = await prisma.userEvent.findMany({
    where: {
      eventType: 'purchase',
      productId: productId,
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  const userIds = purchases.map(p => p.userId);

  // Find other products these users bought
  const alsoBought = await prisma.userEvent.groupBy({
    by: ['productId'],
    where: {
      eventType: 'purchase',
      userId: { in: userIds },
      productId: { not: productId },
    },
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take: 10,
  });

  return alsoBought;
}
```

#### **2. Content-Based Filtering**
"Products similar to what you've viewed"

```typescript
async function getBasedOnHistory(userId: string) {
  // Get user's recent views
  const recentViews = await prisma.userEvent.findMany({
    where: {
      userId,
      eventType: 'view',
      timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { productId: true },
  });

  const viewedProductIds = recentViews.map(rv => rv.productId);

  // Get categories of viewed products
  const viewedProducts = await prisma.product.findMany({
    where: { id: { in: viewedProductIds } },
    select: { categoryId: true },
  });

  const categoryIds = [...new Set(viewedProducts.map(p => p.categoryId))];

  // Get products from same categories
  return prisma.product.findMany({
    where: {
      categoryId: { in: categoryIds },
      id: { notIn: viewedProductIds },
    },
    take: 10,
  });
}
```

#### **3. Trending Products**
"Most viewed in the last 7 days"

```typescript
async function getTrending(limit: number = 10) {
  const trending = await prisma.userEvent.groupBy({
    by: ['productId'],
    where: {
      eventType: 'view',
      timestamp: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take: limit,
  });

  return trending;
}
```

### **Future ML Integration**

```typescript
// Placeholder for ML model serving
async function getMLRecommendations(userId: string) {
  // 1. Get user features
  const userFeatures = await getUserFeatures(userId);
  
  // 2. Call ML model (Python/FastAPI)
  const response = await fetch('http://ml-service:5000/predict', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      features: userFeatures,
      num_recommendations: 10,
    }),
  });

  const { product_ids, scores } = await response.json();
  
  // 3. Fetch products
  return prisma.product.findMany({
    where: { id: { in: product_ids } },
  });
}
```

---

## 🔍 SEO Implementation

### **JSON-LD Structured Data**

```typescript
// Product page
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: product.name,
  description: product.description,
  image: product.images.map(img => img.url),
  sku: product.sku,
  offers: {
    '@type': 'Offer',
    price: product.price,
    priceCurrency: 'USD',
    availability: product.inStock 
      ? 'https://schema.org/InStock' 
      : 'https://schema.org/OutOfStock',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: product.averageRating,
    reviewCount: product.reviewCount,
  },
};

// Render in page
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

### **Meta Tags**

```typescript
// Next.js metadata
export const metadata = {
  title: 'iPhone 15 Pro | Your Store',
  description: 'Buy iPhone 15 Pro with A17 Pro chip...',
  openGraph: {
    title: 'iPhone 15 Pro',
    description: 'Buy iPhone 15 Pro...',
    images: ['/images/iphone-15-pro.jpg'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iPhone 15 Pro',
    images: ['/images/iphone-15-pro.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};
```

### **Sitemap Generation**

```typescript
// app/sitemap.ts
export default async function sitemap() {
  const products = await fetchProducts();
  
  return [
    {
      url: 'https://yourstore.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...products.map(product => ({
      url: `https://yourstore.com/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
  ];
}
```

### **Core Web Vitals Optimization**

1. **LCP (Largest Contentful Paint)**
   - Image optimization (Next.js Image)
   - Preload critical resources
   - Server-side rendering

2. **FID (First Input Delay)**
   - Code splitting
   - Lazy loading
   - Minimal JavaScript

3. **CLS (Cumulative Layout Shift)**
   - Fixed image dimensions
   - Font preloading
   - Reserved space for dynamic content

---

## 📁 File Storage

### **MinIO Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                    File Storage Flow                         │
└─────────────────────────────────────────────────────────────┘

Client Upload
      │
      ▼
┌─────────────────┐
│  Express.js     │
│  /api/storage   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Multer        │
│   (File parse)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Sharp         │
│   (Image proc.) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   MinIO         │
│   (S3 storage)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Presigned URL  │
│  (Access link)  │
└─────────────────┘
```

### **Image Processing**

```typescript
import sharp from 'sharp';

async function processImage(buffer: Buffer) {
  return sharp(buffer)
    .resize(1200, 1200, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}
```

### **Presigned URLs**

```typescript
// Generate temporary access URL
async function getPresignedUrl(objectName: string) {
  return minioClient.presignedGetObject(
    BUCKET_NAME,
    objectName,
    3600 // 1 hour expiry
  );
}
```

---

## ⚡ Real-time Features

### **Socket.IO Integration**

```typescript
import { Server as SocketIOServer } from 'socket.io';

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Handle connections
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Join user-specific room
  socket.on('join-user-room', (userId) => {
    socket.join(`user:${userId}`);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Send notification to specific user
function notifyUser(userId: string, event: string, data: any) {
  io.to(`user:${userId}`).emit(event, data);
}
```

### **Real-time Updates**

- Order status changes
- Inventory updates
- New messages
- Price changes
- Promotion alerts

---

## 🔄 Data Flow

### **Product Page Load**

```
1. User visits /products/iphone-15-pro
      │
      ▼
2. Next.js checks cache
      │
      ▼
3. If not cached, fetch from API
      │
      ▼
4. Express.js receives request
      │
      ▼
5. Prisma queries PostgreSQL
      │
      ▼
6. Return product data
      │
      ▼
7. Next.js renders page (SSR)
      │
      ▼
8. HTML sent to browser
      │
      ▼
9. React hydrates (makes interactive)
      │
      ▼
10. Track view event (analytics)
      │
      ▼
11. Load recommendations
```

### **Purchase Flow**

```
1. User clicks "Buy Now"
      │
      ▼
2. Create order in database
      │
      ▼
3. Process payment (Stripe)
      │
      ▼
4. Update order status
      │
      ▼
5. Decrement inventory
      │
      ▼
6. Send confirmation email
      │
      ▼
7. Track purchase event
      │
      ▼
8. Update recommendations
      │
      ▼
9. Notify fulfillment
```

---

## 🛡️ Security Considerations

### **Input Validation**

```typescript
import { z } from 'zod';

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().positive(),
  sku: z.string().min(1).max(100),
  categoryId: z.string().uuid(),
});

// Validate in route
router.post('/products', validate(createProductSchema), createProduct);
```

### **SQL Injection Prevention**

- Prisma ORM uses parameterized queries
- No raw SQL unless necessary
- Input sanitization

### **XSS Prevention**

```typescript
import helmet from 'helmet';

// Security headers
app.use(helmet());

// Content Security Policy
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
  },
}));
```

### **Rate Limiting**

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests',
});

app.use('/api/', limiter);
```

### **CORS Configuration**

```typescript
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
```

---

## ⚡ Performance Optimization

### **Database Optimization**

```typescript
// Indexing
model Product {
  @@index([slug])
  @@index([categoryId])
  @@index([status])
  @@index([price])
}

// Query optimization
const products = await prisma.product.findMany({
  where: { status: 'active' },
  include: {
    images: { where: { isPrimary: true }, take: 1 },
    category: { select: { name: true, slug: true } },
  },
  take: 20,
  skip: 0,
});
```

### **Caching Strategy**

```typescript
// Redis caching
async function getProduct(id: string) {
  // Check cache first
  const cached = await redis.get(`product:${id}`);
  if (cached) return JSON.parse(cached);
  
  // Fetch from database
  const product = await prisma.product.findUnique({
    where: { id },
  });
  
  // Store in cache (1 hour)
  await redis.setex(`product:${id}`, 3600, JSON.stringify(product));
  
  return product;
}
```

### **Image Optimization**

```typescript
// Next.js Image component
import Image from 'next/image';

<Image
  src="/images/product.jpg"
  alt="Product"
  width={800}
  height={600}
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

---

## 📈 Scalability

### **Horizontal Scaling**

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                             │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  API Server 1   │  │  API Server 2   │  │  API Server 3   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (Primary)     │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Read Replicas │
                    └─────────────────┘
```

### **Database Scaling**

- **Read Replicas** - Distribute read queries
- **Connection Pooling** - Prisma manages connections
- **Query Optimization** - Proper indexing
- **Partitioning** - Split large tables

### **Caching Layers**

1. **Browser Cache** - Static assets
2. **CDN Cache** - Images, CSS, JS
3. **Redis Cache** - API responses, sessions
4. **Database Cache** - Query results

---

## 🎯 Key Design Decisions

### **Why Monorepo?**

```
online-store/
├── apps/
│   ├── api/          # Backend
│   └── web/          # Frontend
├── packages/
│   ├── shared/       # Shared code
│   └── ui/           # Shared components
```

**Benefits:**
- Code sharing between frontend/backend
- Single source of truth
- Easier dependency management
- Atomic commits across packages

### **Why Prisma over Sequelize/TypeORM?**

1. **Type Safety** - Auto-generated TypeScript types
2. **Migrations** - Version-controlled schema changes
3. **Query Builder** - Intuitive API
4. **Performance** - Optimized queries
5. **Developer Experience** - Prisma Studio

### **Why JWT over Sessions?**

1. **Stateless** - No server-side session storage
2. **Scalable** - Works across multiple servers
3. **Mobile-friendly** - Easy to store on client
4. **Cross-domain** - Works with different domains

### **Why SQLite for Development?**

1. **Zero Setup** - No database server needed
2. **Portable** - Single file database
3. **Fast** - No network overhead
4. **Simple** - Easy to reset/recreate

---

## 📚 Summary

### **Architecture Highlights**

✅ **Modular Design** - Easy to maintain and extend  
✅ **Type Safety** - TypeScript throughout  
✅ **SEO Optimized** - SSR, structured data, meta tags  
✅ **ML-Ready** - Data collection built-in  
✅ **Scalable** - Horizontal scaling ready  
✅ **Secure** - Best practices implemented  
✅ **Performance** - Caching, optimization  
✅ **Developer Experience** - Hot reloading, tooling  

### **Technology Choices**

| Component | Choice | Reason |
|-----------|--------|--------|
| Frontend | Next.js | SSR, SEO, performance |
| Backend | Express.js | Simple, flexible, fast |
| Database | PostgreSQL | Reliable, scalable |
| ORM | Prisma | Type-safe, modern |
| Cache | Redis | Fast, reliable |
| Storage | MinIO | S3-compatible, local |
| Auth | JWT | Stateless, scalable |
| Validation | Zod | Type-safe, composable |

### **Data Flow**

```
User → Next.js → Express.js → Prisma → PostgreSQL
                ↓
            Redis (cache)
                ↓
            MinIO (files)
                ↓
            Socket.IO (real-time)
```

---

**This architecture provides a solid foundation for a production-ready e-commerce platform that can scale from startup to enterprise.** 🚀