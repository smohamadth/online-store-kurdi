# 🖥️ Local Machine Setup Guide

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (5 minutes)](#quick-start-5-minutes)
3. [Detailed Setup](#detailed-setup)
4. [Running the Application](#running-the-application)
5. [Accessing Services](#accessing-services)
6. [Testing the Application](#testing-the-application)
7. [Troubleshooting](#troubleshooting)
8. [Development Workflow](#development-workflow)
9. [Production Build](#production-build)
10. [Docker Setup (Optional)](#docker-setup-optional)

---

## 📦 Prerequisites

### **Required Software**

| Software | Version | Purpose | Installation |
|----------|---------|---------|--------------|
| **Node.js** | 18+ | JavaScript runtime | [nodejs.org](https://nodejs.org/) |
| **npm** | 9+ | Package manager | Comes with Node.js |
| **Git** | Any | Version control | [git-scm.com](https://git-scm.com/) |

### **Optional Software**

| Software | Version | Purpose | Installation |
|----------|---------|---------|--------------|
| **Docker** | 20+ | Containerization | [docker.com](https://www.docker.com/) |
| **PostgreSQL** | 16 | Production database | [postgresql.org](https://www.postgresql.org/) |
| **Redis** | 7 | Caching | [redis.io](https://redis.io/) |

### **Check Your Installation**

```bash
# Check Node.js
node --version
# Should show: v18.x.x or higher

# Check npm
npm --version
# Should show: 9.x.x or higher

# Check Git (optional)
git --version
# Should show: git version 2.x.x
```

---

## ⚡ Quick Start (5 minutes)

### **Option 1: Automated Setup (Recommended)**

```bash
# 1. Clone the repository (if not already done)
git clone <repository-url>
cd online-store

# 2. Run the setup script
bash scripts/setup-sqlite.sh

# 3. The script will:
#    - Install all dependencies
#    - Set up SQLite database (no PostgreSQL needed)
#    - Seed sample data
#    - Start the development servers

# 4. Access the application
# Frontend: http://localhost:3002
# API: http://localhost:3001
```

### **Option 2: Manual Setup**

```bash
# 1. Navigate to project directory
cd /home/user/online-store

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example apps/api/.env
# The template now defaults to SQLite (DATABASE_URL="file:./dev.db"), which
# matches prisma/schema.prisma out of the box. If you see
# "the URL must start with the protocol `file:`", your .env still has the old
# PostgreSQL URL - see TROUBLESHOOTING.md.

# 4. Set up database (SQLite)
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
cd ../..

# 5. Start development servers
npm run dev
```

---

## 🔧 Detailed Setup

### **Step 1: Clone or Navigate to Project**

```bash
# If cloning fresh
git clone <repository-url>
cd online-store

# If already cloned
cd /home/user/online-store
```

### **Step 2: Install Dependencies**

```bash
# Install root dependencies
npm install

# Install API dependencies
cd apps/api
npm install
cd ../..

# Install Web dependencies
cd apps/web
npm install
cd ../..
```

**Expected output:**
```
added 829 packages, and audited 832 packages
```

### **Step 3: Set Up Environment**

```bash
# Copy environment template
cp .env.example apps/api/.env
# The template now defaults to SQLite (DATABASE_URL="file:./dev.db"), which
# matches prisma/schema.prisma out of the box. If you see
# "the URL must start with the protocol `file:`", your .env still has the old
# PostgreSQL URL - see TROUBLESHOOTING.md.
```

**Edit `apps/api/.env` (optional):**

```bash
# Database (SQLite for development)
DATABASE_URL="file:./dev.db"

# JWT Secret (change in production)
JWT_SECRET="your-super-secret-key-at-least-32-chars"

# Frontend URL
FRONTEND_URL="http://localhost:3002"

# API Port
PORT=3001
```

### **Step 4: Set Up Database**

```bash
# Navigate to API directory
cd apps/api

# Generate Prisma client
npx prisma generate

# Create database and run migrations
npx prisma migrate dev --name init

# Seed sample data
npx tsx prisma/seed.ts

# Go back to root
cd ../..
```

**Expected output:**
```
✅ Prisma client generated
✅ Database created and migrated
✅ Database seeded
```

### **Step 5: Start Development Servers**

```bash
# Start both frontend and backend
npm run dev
```

**Expected output:**
```
[0] > store-api@1.0.0 dev
[0] > tsx watch src/server.ts
[0] 
[0] 🚀 Starting Store API server...
[0] ✅ Database connected successfully
[0] ✅ Server running on port 3001

[1] > store-web@1.0.0 dev
[1] > next dev
[1] 
[1] ▲ Next.js 14.1.0
[1] - Local: http://localhost:3002
[1] ✓ Ready in 1400ms
```

---

## 🚀 Running the Application

### **Start Commands**

```bash
# Start both frontend and backend
npm run dev

# Start only backend
npm run dev:api

# Start only frontend
npm run dev:web

# Build for production
npm run build

# Start production servers
npm run start
```

### **Stop the Servers**

```bash
# Press Ctrl+C in the terminal

# Or kill processes manually
pkill -f "next dev"
pkill -f "tsx watch"
```

### **Restart the Servers**

```bash
# Stop servers (Ctrl+C)
# Then start again
npm run dev
```

---

## 🌐 Accessing Services

### **Frontend (Next.js)**

| Page | URL | Description |
|------|-----|-------------|
| **Home** | http://localhost:3002 | Landing page |
| **Products** | http://localhost:3002/products | Product listing |
| **Product Detail** | http://localhost:3002/products/iphone-15-pro | Single product |
| **Cart** | http://localhost:3002/cart | Shopping cart |
| **Account** | http://localhost:3002/account | User account |

### **Backend API (Express.js)**

| Endpoint | URL | Description |
|----------|-----|-------------|
| **Health Check** | http://localhost:3001/health | Server status |
| **API Root** | http://localhost:3001/api | API documentation |
| **Products** | http://localhost:3001/api/products | List products |
| **Auth** | http://localhost:3001/api/auth/login | Login |

### **Database Management**

| Tool | Access | Credentials |
|------|--------|-------------|
| **Prisma Studio** | Run `npx prisma studio` | N/A |
| **SQLite File** | `apps/api/prisma/dev.db` | N/A |

---

## 🧪 Testing the Application

### **Test API Endpoints**

```bash
# 1. Health check
curl http://localhost:3001/health

# 2. Get all products
curl http://localhost:3001/api/products

# 3. Search products
curl "http://localhost:3001/api/products/search?q=iphone"

# 4. Get featured products
curl http://localhost:3001/api/products/featured

# 5. Get recommendations
curl http://localhost:3001/api/recommendations/trending

# 6. Login as admin
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@store.com","password":"admin123"}'

# 7. Login as customer
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","password":"customer123"}'
```

### **Test Frontend Pages**

1. **Open browser**: http://localhost:3002
2. **Browse products**: Click "Products" in navigation
3. **View product**: Click on any product
4. **Check SEO**: View page source for JSON-LD

### **Test Database**

```bash
# Open Prisma Studio (GUI)
cd apps/api
npx prisma studio

# This opens http://localhost:5555 in your browser
# You can view and edit all database records
```

---

## 🔧 Troubleshooting

### **Common Issues & Solutions**

#### **1. Port Already in Use**

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:**
```bash
# Find and kill process using the port
lsof -i :3001
kill -9 <PID>

# Or use different ports
PORT=3002 npm run dev:api
```

#### **2. Database Connection Error**

**Error:**
```
Can't reach database server at `localhost:5432`
```

**Solution:**
```bash
# Make sure you're using SQLite (default)
# Check apps/api/.env
DATABASE_URL="file:./dev.db"

# Reset database
cd apps/api
npx prisma migrate reset
npx tsx prisma/seed.ts
```

#### **3. Module Not Found Error**

**Error:**
```
Cannot find module '@prisma/client'
```

**Solution:**
```bash
# Regenerate Prisma client
cd apps/api
npx prisma generate

# Or reinstall dependencies
npm install
```

#### **4. TypeScript Errors**

**Error:**
```
Type error: Property 'xxx' does not exist
```

**Solution:**
```bash
# Regenerate types
cd apps/api
npx prisma generate

# Restart TypeScript server in VS Code
# Ctrl+Shift+P → TypeScript: Restart TS Server
```

#### **5. Next.js Build Error**

**Error:**
```
Module not found: Can't resolve 'xxx'
```

**Solution:**
```bash
# Clear Next.js cache
cd apps/web
rm -rf .next

# Reinstall dependencies
npm install

# Restart dev server
npm run dev
```

#### **6. Redis Connection Error**

**Error:**
```
Redis connection failed: ECONNREFUSED
```

**Solution:**
```bash
# Redis is optional - the app works without it
# If you want Redis, install it:

# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Or ignore the error - caching will be disabled
```

#### **7. MinIO Connection Error**

**Error:**
```
MinIO initialization failed: ECONNREFUSED
```

**Solution:**
```bash
# MinIO is optional - the app works without it
# If you want MinIO, install it:

# Download from https://min.io/download
# Or use Docker:
docker run -d -p 9000:9000 -p 9001:9001 minio/minio server /data

# Or ignore the error - file storage will be disabled
```

### **Reset Everything**

```bash
# 1. Stop all servers
pkill -f "next dev"
pkill -f "tsx watch"

# 2. Clean dependencies
rm -rf node_modules apps/*/node_modules

# 3. Clean database
rm -f apps/api/prisma/dev.db

# 4. Reinstall
npm install
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..

# 5. Reset database
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
cd ../..

# 6. Start fresh
npm run dev
```

---

## 🔄 Development Workflow

### **Daily Development**

```bash
# 1. Start your day
cd /home/user/online-store
npm run dev

# 2. Make changes to code
# Frontend: apps/web/app/
# Backend: apps/api/src/

# 3. Hot reloading happens automatically
# - Frontend: Refreshes browser
# - Backend: Restarts server

# 4. Test your changes
curl http://localhost:3001/api/products

# 5. Commit changes
git add .
git commit -m "Your changes"
```

### **Database Changes**

```bash
# 1. Edit schema
vim apps/api/prisma/schema.prisma

# 2. Create migration
cd apps/api
npx prisma migrate dev --name your_migration_name

# 3. Regenerate client
npx prisma generate

# 4. Update seed if needed
vim prisma/seed.ts
npx tsx prisma/seed.ts
```

### **Add New API Endpoint**

```bash
# 1. Create module
mkdir -p apps/api/src/modules/your-module

# 2. Create files
touch your-module.controller.ts
touch your-module.service.ts
touch your-module.routes.ts

# 3. Register routes in app.ts
vim apps/api/src/app.ts

# 4. Test endpoint
curl http://localhost:3001/api/your-module
```

### **Add New Frontend Page**

```bash
# 1. Create page
mkdir -p apps/web/app/your-page
touch apps/web/app/your-page/page.tsx

# 2. Add to navigation (if needed)
vim apps/web/app/layout.tsx

# 3. Test page
open http://localhost:3002/your-page
```

---

## 🏗️ Production Build

### **Build for Production**

```bash
# 1. Build both frontend and backend
npm run build

# 2. Start production servers
npm run start
```

### **Production Environment**

```bash
# Set environment
export NODE_ENV=production

# Build
npm run build

# Start
npm run start
```

### **Production Checklist**

- [ ] Set `NODE_ENV=production`
- [ ] Use PostgreSQL instead of SQLite
- [ ] Set secure JWT secret
- [ ] Enable HTTPS
- [ ] Set up proper logging
- [ ] Configure monitoring
- [ ] Set up backups

---

## 🐳 Docker Setup (Optional)

### **Install Docker**

```bash
# macOS
brew install --cask docker

# Ubuntu/Debian
sudo apt-get install docker.io docker-compose

# Windows
# Download Docker Desktop from docker.com
```

### **Start with Docker**

```bash
# 1. Navigate to docker directory
cd docker

# 2. Start all services
docker-compose up -d

# 3. Check services
docker-compose ps

# 4. View logs
docker-compose logs -f

# 5. Stop services
docker-compose down
```

### **Docker Services**

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Caching |
| MinIO | 9000, 9001 | File storage |
| MailHog | 1025, 8025 | Email testing |
| pgAdmin | 5050 | Database GUI |

---

## 📁 Project Structure

```
online-store/
├── apps/
│   ├── api/                    # Express.js backend
│   │   ├── src/
│   │   │   ├── config/        # Configuration
│   │   │   ├── middleware/    # Express middleware
│   │   │   ├── modules/      # Feature modules
│   │   │   ├── utils/        # Utilities
│   │   │   ├── app.ts        # Express app
│   │   │   └── server.ts     # Server entry
│   │   └── prisma/            # Database
│   │       ├── schema.prisma # Database schema
│   │       ├── seed.ts       # Sample data
│   │       └── dev.db        # SQLite database
│   │
│   └── web/                    # Next.js frontend
│       ├── app/               # Pages (App Router)
│       ├── components/        # React components
│       └── lib/               # Utilities
│
├── docker/                    # Docker configuration
├── scripts/                   # Setup scripts
├── docs/                      # Documentation
├── package.json               # Root package
├── .env.example               # Environment template
└── README.md                  # Main documentation
```

---

## 🔐 Test Accounts

### **Admin Account**
- **Email**: admin@store.com
- **Password**: admin123
- **Role**: Admin (full access)

### **Customer Account**
- **Email**: customer@example.com
- **Password**: customer123
- **Role**: Customer (standard access)

---

## 📊 Sample Data

### **Products**
1. iPhone 15 Pro - $999.99 (Electronics)
2. MacBook Pro 14" - $1,599.99 (Electronics)
3. Web Development Course - $49.99 (Digital Products)
4. Classic T-Shirt - $29.99 (Clothing)
5. JavaScript: The Good Parts - $24.99 (Books)

### **Categories**
- Electronics
- Clothing
- Books
- Digital Products

### **Reviews**
- 3 sample reviews
- Ratings: 4-5 stars

### **Coupons**
- WELCOME10 (10% off)
- SAVE20 ($20 off)

---

## 🎯 Quick Reference

### **Start Commands**
```bash
npm run dev          # Start both servers
npm run dev:api      # Start only backend
npm run dev:web      # Start only frontend
npm run build        # Build for production
npm run start        # Start production
```

### **Database Commands**
```bash
cd apps/api
npx prisma generate  # Generate client
npx prisma migrate   # Run migrations
npx prisma studio    # Open GUI
npx tsx prisma/seed.ts  # Seed data
```

### **Access URLs**
- **Frontend**: http://localhost:3002
- **API**: http://localhost:3001
- **Prisma Studio**: http://localhost:5555 (run command)

### **Test Commands**
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/products
curl "http://localhost:3001/api/products/search?q=iphone"
```

---

## 💡 Tips & Tricks

### **1. Faster Development**
```bash
# Use tmux or screen for multiple terminals
tmux new-session -d -s store 'npm run dev:api'
tmux new-window -t store 'npm run dev:web'
tmux attach -t store
```

### **2. View Logs**
```bash
# API logs
tail -f apps/api/logs/app.log

# Or use Docker logs
docker-compose logs -f api
```

### **3. Database Backup**
```bash
# SQLite backup
cp apps/api/prisma/dev.db apps/api/prisma/dev.db.backup

# PostgreSQL backup (if using Docker)
docker exec postgres pg_dump -U store_user store_db > backup.sql
```

### **4. Environment Variables**
```bash
# View current environment
cat apps/api/.env

# Edit environment
vim apps/api/.env

# Restart servers after changes
npm run dev
```

---

## 🆘 Getting Help

### **Check Documentation**
- [README.md](README.md) - Main documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - What's built

### **Common Resources**
- [Next.js Docs](https://nextjs.org/docs)
- [Express.js Docs](https://expressjs.com/)
- [Prisma Docs](https://www.prisma.io/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

### **Debug Mode**
```bash
# Enable debug logging
DEBUG=* npm run dev

# Or set in .env
LOG_LEVEL=debug
```

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Frontend loads at http://localhost:3002
- [ ] API responds at http://localhost:3001/health
- [ ] Products page shows products
- [ ] Product detail page works
- [ ] API returns products: `curl http://localhost:3001/api/products`
- [ ] Login works: `curl -X POST http://localhost:3001/api/auth/login ...`
- [ ] No errors in terminal

---

## 🎉 You're Ready!

Your online store is now running locally. Explore the features:

1. **Browse products** at http://localhost:3002
2. **Test the API** with curl commands
3. **View database** with Prisma Studio
4. **Make changes** and see them hot-reload
5. **Build something amazing!** 🚀

---

**Happy coding! 💻**