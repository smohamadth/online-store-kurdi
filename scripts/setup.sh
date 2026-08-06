#!/bin/bash

# Online Store Setup Script
# This script sets up the complete development environment

set -e

echo "🚀 Setting up Online Store development environment..."
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi
echo "✅ npm $(npm -v)"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker is not installed. You'll need to install PostgreSQL, Redis, and MinIO manually."
    echo "   Download from: https://www.docker.com/"
    read -p "Continue without Docker? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    DOCKER_AVAILABLE=false
else
    echo "✅ Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
    DOCKER_AVAILABLE=true
fi

# Check Docker Compose
if [ "$DOCKER_AVAILABLE" = true ]; then
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo "⚠️  Docker Compose is not installed."
        DOCKER_COMPOSE_AVAILABLE=false
    else
        echo "✅ Docker Compose available"
        DOCKER_COMPOSE_AVAILABLE=true
    fi
fi

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
    echo "   Please review and update the environment variables in apps/api/.env"
else
    echo "✅ apps/api/.env already exists"
fi

# Start Docker containers
if [ "$DOCKER_AVAILABLE" = true ] && [ "$DOCKER_COMPOSE_AVAILABLE" = true ]; then
    echo ""
    echo "🐳 Starting Docker containers..."
    cd docker
    docker-compose up -d
    cd ..
    echo "✅ Docker containers started"
    echo ""
    echo "   Services available at:"
    echo "   - PostgreSQL: localhost:5432"
    echo "   - Redis: localhost:6379"
    echo "   - MinIO API: localhost:9000"
    echo "   - MinIO Console: localhost:9001"
    echo "   - MailHog: localhost:8025"
    echo "   - pgAdmin: localhost:5050"
    echo ""
    echo "   Waiting for services to be ready..."
    sleep 10
else
    echo ""
    echo "⚠️  Docker not available. Please ensure the following services are running:"
    echo "   - PostgreSQL 16 on localhost:5432"
    echo "   - Redis 7 on localhost:6379"
    echo "   - MinIO on localhost:9000"
    echo ""
    read -p "Press Enter when services are ready..."
fi

# Setup database
echo ""
echo "🗄️  Setting up database..."

cd apps/api

# Generate Prisma client
npx prisma generate
echo "✅ Prisma client generated"

# Run migrations
npx prisma migrate dev --name init
echo "✅ Database migrations applied"

# Seed database
npx prisma db:seed
echo "✅ Database seeded with sample data"

cd ../..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📚 Quick Start Commands:"
echo ""
echo "   Start development servers:"
echo "   $ npm run dev"
echo ""
echo "   Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - API: http://localhost:3001"
echo "   - API Documentation: http://localhost:3001/api"
echo ""
echo "   Database management:"
echo "   - Prisma Studio: npm run db:studio"
echo "   - pgAdmin: http://localhost:5050"
echo ""
echo "   File storage:"
echo "   - MinIO Console: http://localhost:9001"
echo "     Username: minioadmin"
echo "     Password: minioadmin"
echo ""
echo "   Email testing:"
echo "   - MailHog: http://localhost:8025"
echo ""
echo "   Test accounts:"
echo "   - Admin: admin@store.com / admin123"
echo "   - Customer: customer@example.com / customer123"
echo ""
echo "📖 Documentation:"
echo "   - API: docs/API.md"
echo "   - Database: apps/api/prisma/schema.prisma"
echo ""
echo "Happy coding! 🚀"