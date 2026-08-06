# 🚀 Quick Start Guide

## Step 1: Run Setup Script

```bash
cd /home/user/online-store
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The setup script will:
1. ✅ Check prerequisites (Node.js, Docker)
2. ✅ Install all dependencies
3. ✅ Start Docker containers (PostgreSQL, Redis, MinIO, MailHog, pgAdmin)
4. ✅ Setup database with migrations
5. ✅ Seed sample data

## Step 2: Start Development Servers

```bash
npm run dev
```

This starts both:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

## Step 3: Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Next.js storefront |
| **API** | http://localhost:3001/api | Express.js API |
| **API Docs** | http://localhost:3001/api | API documentation |
| **pgAdmin** | http://localhost:5050 | Database GUI (admin@store.com / admin) |
| **MinIO Console** | http://localhost:9001 | File storage (minioadmin / minioadmin) |
| **MailHog** | http://localhost:8025 | Email testing |
| **Prisma Studio** | Run `npm run db:studio` | Database GUI |

## Step 4: Test Accounts

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@store.com | admin123 |
| **Customer** | customer@example.com | customer123 |

## Step 5: Test the API

### Login as Admin
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@store.com","password":"admin123"}'
```

### Get Products
```bash
curl http://localhost:3001/api/products
```

### Search Products
```bash
curl "http://localhost:3001/api/products/search?q=iphone"
```

### Get Recommendations
```bash
curl http://localhost:3001/api/recommendations/trending
curl http://localhost:3001/api/recommendations/new-arrivals
```

### Track Analytics Event
```bash
curl -X POST http://localhost:3001/api/analytics/track \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "view",
    "productId": "PRODUCT_ID",
    "sessionId": "test-session-123"
  }'
```

## 🎯 What's Included

### Backend (Express.js)
- ✅ Complete REST API
- ✅ Authentication & Authorization
- ✅ Product Management
- ✅ Order Management
- ✅ User Management
- ✅ Payment Processing
- ✅ File Storage (MinIO)
- ✅ Analytics & Tracking
- ✅ Recommendation System
- ✅ Real-time Updates (Socket.IO)

### Frontend (Next.js)
- ✅ Home page
- ✅ Products page
- ✅ Product detail page
- ✅ SEO optimization
- ✅ Structured data

### Database (PostgreSQL)
- ✅ Complete schema
- ✅ Sample data
- ✅ ML/Analytics tables

### Services (Docker)
- ✅ PostgreSQL 16
- ✅ Redis 7
- ✅ MinIO (S3-compatible)
- ✅ MailHog (email testing)
- ✅ pgAdmin (database GUI)

## 📊 ML/Analytics Features

The system automatically collects:
- User behavior events
- Product interactions
- Search queries
- Purchase patterns

This data is stored in the database and ready for future ML model training.

## 🔧 Development Commands

```bash
# Start development
npm run dev

# Start only backend
npm run dev:api

# Start only frontend
npm run dev:web

# Database commands
npm run db:migrate      # Run migrations
npm run db:studio       # Open Prisma Studio
npm run db:seed         # Seed database
npm run db:reset        # Reset database

# Docker commands
npm run docker:up       # Start containers
npm run docker:down     # Stop containers
npm run docker:logs     # View logs

# Build for production
npm run build
```

## 📚 Next Steps

1. **Explore the API**: Visit http://localhost:3001/api for API documentation
2. **View Database**: Run `npm run db:studio` or visit http://localhost:5050
3. **Check Analytics**: Use the analytics endpoints to see tracked events
4. **Test Recommendations**: Visit the recommendation endpoints
5. **Customize**: Modify the code to fit your specific needs

## 🎉 You're Ready!

Your online store is now running locally with:
- Full e-commerce functionality
- SEO optimization
- ML-ready analytics
- Recommendation system
- All services running in Docker

Happy coding! 🚀