# Online Store

A full-featured, SEO-optimized e-commerce platform built with modern technologies. Supports both physical and digital products with ML-ready analytics for future recommendation systems.

## 🚀 Features

### Core E-commerce
- ✅ Product management (physical & digital)
- ✅ Shopping cart & checkout
- ✅ Order management
- ✅ User authentication & authorization
- ✅ Payment processing
- ✅ File storage (S3-compatible)
- ✅ Email notifications

### SEO Optimization
- ✅ Server-side rendering (Next.js)
- ✅ Structured data (JSON-LD)
- ✅ Meta tags management
- ✅ Sitemap generation
- ✅ Clean URL structure
- ✅ Image optimization
- ✅ Core Web Vitals focused

### Analytics & ML-Ready
- ✅ User behavior tracking
- ✅ Product analytics
- ✅ Search analytics
- ✅ Recommendation system (basic)
- ✅ Data collection for ML training
- ✅ A/B testing framework

### Technical Features
- ✅ TypeScript throughout
- ✅ RESTful API
- ✅ Real-time updates (Socket.IO)
- ✅ Caching (Redis)
- ✅ Rate limiting
- ✅ Input validation
- ✅ Error handling
- ✅ Logging (Winston)
- ✅ Security best practices

## 🛠️ Tech Stack

### Frontend
- **Next.js 14+** (App Router)
- **React 18**
- **Tailwind CSS**
- **TypeScript**

### Backend
- **Express.js**
- **TypeScript**
- **Prisma ORM**
- **PostgreSQL 16**
- **Redis 7**
- **Socket.IO**

### Storage & Services
- **MinIO** (S3-compatible file storage)
- **MailHog** (email testing)
- **Stripe** (payment processing)

### Development Tools
- **Docker & Docker Compose**
- **ESLint & Prettier**
- **Vitest** (testing)
- **Prisma Studio** (database GUI)

## 📋 Prerequisites

- Node.js 18+
- npm 9+
- Docker & Docker Compose (recommended)
- PostgreSQL 16 (if not using Docker)
- Redis 7 (if not using Docker)

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd online-store

# Run setup script
./scripts/setup.sh
```

### Option 2: Manual Setup

```bash
# 1. Clone and install dependencies
git clone <repository-url>
cd online-store
npm install

# 2. Start Docker containers
cd docker
docker-compose up -d
cd ..

# 3. Setup environment
cp .env.example apps/api/.env
# Edit apps/api/.env with your settings

# 4. Setup database
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx prisma db:seed
cd ../..

# 5. Start development servers
npm run dev
```

## 🌐 Access Points

After setup, access the application at:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | - |
| **API** | http://localhost:3001 | - |
| **API Docs** | http://localhost:3001/api | - |
| **Prisma Studio** | `npm run db:studio` | - |
| **pgAdmin** | http://localhost:5050 | admin@store.com / admin |
| **MinIO Console** | http://localhost:9001 | minioadmin / minioadmin |
| **MailHog** | http://localhost:8025 | - |

### Test Accounts

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@store.com | admin123 |
| **Customer** | customer@example.com | customer123 |

## 📁 Project Structure

```
online-store/
├── apps/
│   ├── api/                    # Express.js backend
│   │   ├── src/
│   │   │   ├── config/        # Configuration files
│   │   │   ├── middleware/     # Express middleware
│   │   │   ├── modules/       # Feature modules
│   │   │   │   ├── analytics/
│   │   │   │   ├── auth/
│   │   │   │   ├── orders/
│   │   │   │   ├── payments/
│   │   │   │   ├── products/
│   │   │   │   ├── recommendations/
│   │   │   │   ├── storage/
│   │   │   │   └── users/
│   │   │   ├── utils/         # Utility functions
│   │   │   ├── app.ts         # Express app setup
│   │   │   └── server.ts      # Server entry point
│   │   └── prisma/            # Database schema & migrations
│   │
│   └── web/                    # Next.js frontend (to be implemented)
│
├── packages/
│   ├── shared/                 # Shared types & utilities
│   └── ui/                    # Shared UI components
│
├── docker/                    # Docker configuration
│   ├── docker-compose.yml
│   └── init.sql
│
├── scripts/                   # Setup & utility scripts
│   └── setup.sh
│
├── docs/                      # Documentation
│
├── package.json               # Root package.json
├── .env.example               # Environment template
└── README.md                  # This file
```

## 🗄️ Database Schema

The database includes the following main tables:

- **Users** - Customer and admin accounts
- **Products** - Product catalog with variants
- **Categories** - Product categories (hierarchical)
- **Orders** - Customer orders
- **Order Items** - Individual items in orders
- **Payments** - Payment transactions
- **Reviews** - Product reviews
- **Wishlist** - User wishlist items
- **Cart** - Shopping cart items
- **Sessions** - User sessions
- **Addresses** - User addresses

### ML/Analytics Tables

- **User Events** - User behavior tracking
- **Product Embeddings** - Product vectors for ML
- **User Preferences** - Learned user preferences
- **Product Similarity** - Product similarity scores
- **Recommendation Logs** - Recommendation performance
- **Search Queries** - Search analytics

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List products (with filtering)
- `GET /api/products/featured` - Get featured products
- `GET /api/products/search` - Search products
- `GET /api/products/:id` - Get product by ID
- `GET /api/products/slug/:slug` - Get product by slug
- `GET /api/products/:id/related` - Get related products
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Delete product (admin)

### Orders
- `GET /api/orders` - List orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order
- `PUT /api/orders/:id/status` - Update order status (admin)
- `POST /api/orders/:id/cancel` - Cancel order

### Users
- `GET /api/users` - List users (admin)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `GET /api/users/:id/orders` - Get user orders
- `GET /api/users/:id/wishlist` - Get user wishlist

### Recommendations
- `GET /api/recommendations/trending` - Get trending products
- `GET /api/recommendations/new-arrivals` - Get new arrivals
- `GET /api/recommendations/also-bought/:productId` - Get "Customers also bought"
- `GET /api/recommendations/bought-together/:productId` - Get "Frequently bought together"
- `GET /api/recommendations/history` - Get recommendations based on history
- `GET /api/recommendations/personalized` - Get personalized recommendations

### Analytics
- `POST /api/analytics/track` - Track user event
- `GET /api/analytics/trending` - Get trending products
- `GET /api/analytics/user/behavior` - Get user behavior
- `GET /api/analytics/products/:id` - Get product analytics (admin)
- `GET /api/analytics/search` - Get search analytics (admin)
- `GET /api/analytics/realtime` - Get real-time stats (admin)

### Storage
- `POST /api/storage/upload` - Upload file
- `POST /api/storage/upload/multiple` - Upload multiple files
- `GET /api/storage/presigned/:fileName` - Get presigned URL
- `DELETE /api/storage/:fileName` - Delete file (admin)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run API tests
npm run test:api

# Run frontend tests
npm run test:web

# Run tests in watch mode
cd apps/api && npm run test:watch
```

## 📦 Build & Deploy

```bash
# Build for production
npm run build

# Start production servers
npm run start

# Or build individually
npm run build:api
npm run build:web
```

## 🔧 Development Commands

```bash
# Start development servers
npm run dev

# Start only API
npm run dev:api

# Start only frontend
npm run dev:web

# Database commands
npm run db:migrate      # Run migrations
npm run db:generate     # Generate Prisma client
npm run db:studio       # Open Prisma Studio
npm run db:seed         # Seed database
npm run db:reset        # Reset database

# Docker commands
npm run docker:up       # Start containers
npm run docker:down     # Stop containers
npm run docker:logs     # View logs

# Linting
npm run lint            # Lint all code
npm run lint:api        # Lint API code
npm run lint:web        # Lint frontend code
```

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Database Schema](apps/api/prisma/schema.prisma)
- [Environment Variables](.env.example)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/)
- [Express.js](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)

---

**Happy coding! 🚀**