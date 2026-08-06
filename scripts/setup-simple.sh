#!/bin/bash

# Simplified Setup Script (No Docker Required)
# This script installs dependencies and provides setup instructions

set -e

echo "🚀 Setting up Online Store development environment..."
echo ""

# Check Node.js
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"
echo "✅ npm $(npm -v)"

echo ""
echo "📦 Installing dependencies..."

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

echo "✅ Dependencies installed"

# Setup environment file
echo ""
echo "⚙️  Setting up environment..."

if [ ! -f apps/api/.env ]; then
    cp .env.example apps/api/.env
    echo "✅ Created apps/api/.env from template"
else
    echo "✅ apps/api/.env already exists"
fi

# Generate Prisma client
echo ""
echo "🗄️  Setting up database client..."
cd apps/api
npx prisma generate
echo "✅ Prisma client generated"
cd ../..

echo ""
echo "⚠️  Manual Setup Required"
echo ""
echo "Please install and start the following services:"
echo ""
echo "1. PostgreSQL 16:"
echo "   - Install: https://www.postgresql.org/download/"
echo "   - Create database: store_db"
echo "   - Create user: store_user with password: store_password"
echo "   - Or use Docker: docker run -d --name postgres -p 5432:5432 -e POSTGRES_DB=store_db -e POSTGRES_USER=store_user -e POSTGRES_PASSWORD=store_password postgres:16-alpine"
echo ""
echo "2. Redis 7:"
echo "   - Install: https://redis.io/download"
echo "   - Start: redis-server"
echo "   - Or use Docker: docker run -d --name redis -p 6379:6379 redis:7-alpine"
echo ""
echo "3. MinIO (optional - for file storage):"
echo "   - Install: https://min.io/download"
echo "   - Start: minio server /data --console-address ':9001'"
echo "   - Or use Docker: docker run -d --name minio -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ':9001'"
echo ""
echo "After starting services, run:"
echo ""
echo "  cd apps/api"
echo "  npx prisma migrate dev --name init"
echo "  npx prisma db:seed"
echo "  cd ../.."
echo ""
echo "Then start the development server:"
echo ""
echo "  npm run dev"
echo ""
echo "🎉 Setup complete!"