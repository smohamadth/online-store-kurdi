#!/bin/bash

# Setup script using SQLite (no external database required)
# This is for development/testing purposes only

set -e

echo "🚀 Setting up Online Store with SQLite (development mode)..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    exit 1
fi
echo "✅ Node.js $(node -v)"

echo ""
echo "📦 Installing dependencies..."
npm install
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
echo "✅ Dependencies installed"

echo ""
echo "⚙️  Setting up environment..."
if [ ! -f apps/api/.env ]; then
    cp .env.example apps/api/.env
    echo "✅ Created apps/api/.env"
fi

echo ""
echo "🗄️  Setting up SQLite database..."

# Backup original schema
if [ -f apps/api/prisma/schema.prisma ]; then
    cp apps/api/prisma/schema.prisma apps/api/prisma/schema-postgres.prisma
fi

# Use SQLite schema
cp apps/api/prisma/schema-sqlite.prisma apps/api/prisma/schema.prisma

# Update .env for SQLite
sed -i 's|DATABASE_URL=.*|DATABASE_URL="file:./dev.db"|' apps/api/.env

# Generate Prisma client
cd apps/api
npx prisma generate
echo "✅ Prisma client generated"

# Create database and run migrations
npx prisma migrate dev --name init
echo "✅ Database created and migrated"

# Seed database
npx prisma db:seed
echo "✅ Database seeded"

cd ../..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "🚀 Starting development servers..."
echo ""
echo "   Frontend: http://localhost:3000"
echo "   API: http://localhost:3001"
echo ""
echo "   Test accounts:"
echo "   - Admin: admin@store.com / admin123"
echo "   - Customer: customer@example.com / customer123"
echo ""
echo "Starting servers..."
echo ""

# Start development servers
npm run dev