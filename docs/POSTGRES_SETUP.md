# 🐘 PostgreSQL Setup Guide
## Complete Installation & Configuration for Your Store

---

## 📋 Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Database Setup](#database-setup)
4. [Connection Setup](#connection-setup)
5. [Prisma Integration](#prisma-integration)
6. [Backup & Restore](#backup--restore)
7. [Performance Tuning](#performance-tuning)
8. [Security](#security)
9. [Troubleshooting](#troubleshooting)

---

## 💿 Installation

### **Windows**

#### **Option 1: Installer (Recommended)**
1. Download from: https://www.postgresql.org/download/windows/
2. Run the installer
3. Choose installation directory
4. Set password for `postgres` user (remember this!)
5. Keep default port: `5432`
6. Complete installation

#### **Option 2: Using Chocolatey**
```powershell
# Install Chocolatey (if not installed)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install PostgreSQL
choco install postgresql16 --params '/Password:yourpassword'
```

#### **Option 3: Using Docker (Easiest)**
```powershell
# Install Docker Desktop first
# Then run:
docker run -d \
  --name postgres \
  -e POSTGRES_DB=store_db \
  -e POSTGRES_USER=store_user \
  -e POSTGRES_PASSWORD=store_password \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

---

### **macOS**

#### **Option 1: Homebrew (Recommended)**
```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL service
brew services start postgresql@16

# Verify installation
psql --version
```

#### **Option 2: Postgres.app**
1. Download from: https://postgresapp.com/
2. Move to Applications folder
3. Open and click "Initialize"
4. Done!

#### **Option 3: Docker**
```bash
docker run -d \
  --name postgres \
  -e POSTGRES_DB=store_db \
  -e POSTGRES_USER=store_user \
  -e POSTGRES_PASSWORD=store_password \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

---

### **Linux (Ubuntu/Debian)**

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
psql --version
```

### **Linux (CentOS/RHEL/Fedora)**

```bash
# Install PostgreSQL
sudo dnf install postgresql-server postgresql-contrib

# Initialize database
sudo postgresql-setup --initdb

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## ⚙️ Configuration

### **1. Access PostgreSQL**

```bash
# Switch to postgres user (Linux/macOS)
sudo -u postgres psql

# Or connect directly (if password set)
psql -U postgres -h localhost

# Windows: Use pgAdmin or SQL Shell
```

### **2. Create Database & User**

```sql
-- Connect as postgres superuser first
-- Create a new user for your store
CREATE USER store_user WITH PASSWORD 'your_secure_password';

-- Create the database
CREATE DATABASE store_db OWNER store_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE store_db TO store_user;

-- Connect to the new database
\c store_db

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO store_user;

-- Exit
\q
```

### **3. Configure pg_hba.conf (Authentication)**

**Location:**
- Windows: `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
- macOS: `/usr/local/var/postgres/pg_hba.conf` (Homebrew)
- Linux: `/etc/postgresql/16/main/pg_hba.conf`

**Edit the file:**
```bash
# Find this line:
# TYPE  DATABASE        USER            ADDRESS                 METHOD
host    all             all             127.0.0.1/32            scram-sha-256

# Change 'scram-sha-256' to 'md5' if you have connection issues:
host    all             all             127.0.0.1/32            md5
```

### **4. Configure postgresql.conf**

**Location:** Same directory as pg_hba.conf

```ini
# Connection Settings
listen_addresses = 'localhost'  # Change to '*' for remote access
port = 5432
max_connections = 100

# Memory Settings (adjust based on your RAM)
shared_buffers = 256MB          # 25% of RAM
effective_cache_size = 768MB    # 75% of RAM
work_mem = 4MB                  # Per operation
maintenance_work_mem = 64MB     # For maintenance operations

# WAL Settings
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Query Planner
random_page_cost = 1.1          # For SSD
effective_io_concurrency = 200  # For SSD
```

### **5. Restart PostgreSQL**

```bash
# Linux
sudo systemctl restart postgresql

# macOS (Homebrew)
brew services restart postgresql@16

# Windows: Restart via Services or pgAdmin
```

---

## 🗄️ Database Setup

### **1. Create Database for Your Store**

```bash
# Connect to PostgreSQL
psql -U postgres

# Or if using store_user
psql -U store_user -d store_db -h localhost
```

```sql
-- Create database (if not done above)
CREATE DATABASE store_db;

-- Connect to it
\c store_db

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy search

-- Verify
SELECT extname FROM pg_extension;

-- Exit
\q
```

### **2. Update .env File**

```bash
# apps/api/.env

# For local PostgreSQL
DATABASE_URL="postgresql://store_user:your_secure_password@localhost:5432/store_db"

# Or with SSL (production)
DATABASE_URL="postgresql://store_user:your_secure_password@localhost:5432/store_db?sslmode=require"
```

### **3. Run Prisma Migrations**

```bash
cd apps/api

# Generate Prisma client
npx prisma generate

# Create and apply migrations
npx prisma migrate dev --name init

# Seed database with sample data
npx prisma db:seed

# Open Prisma Studio (GUI)
npx prisma studio
```

---

## 🔌 Connection Setup

### **Test Connection**

```bash
# Test with psql
psql -U store_user -d store_db -h localhost -c "SELECT 1;"

# Test with Node.js
node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://store_user:your_secure_password@localhost:5432/store_db'
});
client.connect()
  .then(() => console.log('✅ Connected!'))
  .catch(err => console.error('❌ Connection failed:', err))
  .finally(() => client.end());
"
```

### **Connection Pooling (Recommended)**

```typescript
// apps/api/src/config/database.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error'],
});

export default prisma;
```

### **Connection String Formats**

```bash
# Basic
postgresql://USER:PASSWORD@HOST:PORT/DATABASE

# With SSL
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require

# With schema
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public

# With connection pool
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?connection_limit=10&pool_timeout=20

# Full example
postgresql://store_user:secure_pass@localhost:5432/store_db?schema=public&connection_limit=10
```

---

## 🔄 Prisma Integration

### **1. Update Prisma Schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Your models here...
model Product {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  // ... more fields
}
```

### **2. Environment Variables**

```bash
# .env
DATABASE_URL="postgresql://store_user:your_password@localhost:5432/store_db"

# Optional: Direct URL (for migrations)
DIRECT_URL="postgresql://store_user:your_password@localhost:5432/store_db"
```

### **3. Prisma Commands**

```bash
# Generate client
npx prisma generate

# Create migration
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (development only!)
npx prisma migrate reset

# View database
npx prisma studio

# Push schema changes (without migration)
npx prisma db push

# Pull existing database
npx prisma db pull
```

### **4. Seed Database**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@store.com',
      password: 'hashed_password',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
    },
  });

  // Create categories
  const electronics = await prisma.category.create({
    data: {
      name: 'Electronics',
      slug: 'electronics',
    },
  });

  // Create products
  await prisma.product.create({
    data: {
      name: 'iPhone 15 Pro',
      slug: 'iphone-15-pro',
      description: 'Latest iPhone...',
      price: 999.99,
      categoryId: electronics.id,
    },
  });

  console.log('✅ Database seeded!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

```bash
# Run seed
npx prisma db seed
```

---

## 💾 Backup & Restore

### **Backup Database**

```bash
# Full backup
pg_dump -U store_user -d store_db > backup.sql

# Compressed backup
pg_dump -U store_user -d store_db | gzip > backup.sql.gz

# Schema only
pg_dump -U store_user -d store_db --schema-only > schema.sql

# Data only
pg_dump -U store_user -d store_db --data-only > data.sql

# Specific tables
pg_dump -U store_user -d store_db -t products -t categories > tables.sql
```

### **Restore Database**

```bash
# Restore from SQL file
psql -U store_user -d store_db < backup.sql

# Restore compressed
gunzip < backup.sql.gz | psql -U store_user -d store_db

# Drop and recreate (careful!)
dropdb -U store_user store_db
createdb -U store_user store_db
psql -U store_user -d store_db < backup.sql
```

### **Automated Backup Script**

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
DB_NAME="store_db"
DB_USER="store_user"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Keep only last 30 backups
ls -t $BACKUP_DIR/backup_*.sql.gz | tail -n +31 | xargs rm -f

echo "✅ Backup created: backup_$DATE.sql.gz"
```

```bash
# Make executable
chmod +x backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

### **Automated Backup for Windows**

```powershell
# backup.ps1
$date = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "C:\backups\postgres"
$dbName = "store_db"
$dbUser = "store_user"

# Create backup directory
New-Item -ItemType Directory -Force -Path $backupDir

# Create backup
pg_dump -U $dbUser $dbName | Out-File -FilePath "$backupDir\backup_$date.sql"

# Compress
Compress-Archive -Path "$backupDir\backup_$date.sql" -DestinationPath "$backupDir\backup_$date.zip"
Remove-Item "$backupDir\backup_$date.sql"

# Keep only last 30 backups
Get-ChildItem "$backupDir\backup_*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item

Write-Host "✅ Backup created: backup_$date.zip"
```

---

## ⚡ Performance Tuning

### **1. Connection Pooling**

```typescript
// In your Prisma client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `${process.env.DATABASE_URL}?connection_limit=10&pool_timeout=20`,
    },
  },
});
```

### **2. Indexes**

```sql
-- Create indexes for common queries
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
```

### **3. Query Optimization**

```typescript
// Good: Select only needed fields
const products = await prisma.product.findMany({
  select: {
    id: true,
    name: true,
    slug: true,
    price: true,
  },
  take: 20,
});

// Good: Use includes efficiently
const product = await prisma.product.findUnique({
  where: { id },
  include: {
    images: { where: { isPrimary: true }, take: 1 },
    category: { select: { name: true, slug: true } },
  },
});
```

### **4. Caching Strategy**

```typescript
import Redis from 'ioredis';

const redis = new Redis();

async function getCachedProduct(id: string) {
  // Try cache first
  const cached = await redis.get(`product:${id}`);
  if (cached) return JSON.parse(cached);

  // Query database
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: true, category: true },
  });

  // Cache for 1 hour
  await redis.setex(`product:${id}`, 3600, JSON.stringify(product));

  return product;
}
```

---

## 🔒 Security

### **1. Strong Passwords**

```sql
-- Change default password
ALTER USER store_user WITH PASSWORD 'very_secure_password_here';

-- Create read-only user for reports
CREATE USER report_user WITH PASSWORD 'another_secure_password';
GRANT CONNECT ON DATABASE store_db TO report_user;
GRANT USAGE ON SCHEMA public TO report_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO report_user;
```

### **2. SSL Connection**

```bash
# .env
DATABASE_URL="postgresql://store_user:password@localhost:5432/store_db?sslmode=require"
```

### **3. Firewall Rules**

```bash
# Allow only local connections (default)
# In postgresql.conf:
listen_addresses = 'localhost'

# Allow specific IPs
listen_addresses = 'localhost,192.168.1.100'
```

### **4. Regular Updates**

```bash
# Update PostgreSQL
sudo apt update
sudo apt upgrade postgresql

# Check version
psql --version
```

---

## 🔧 Troubleshooting

### **Common Issues**

#### **1. Connection Refused**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start if not running
sudo systemctl start postgresql

# Check port
sudo netstat -tlnp | grep 5432
```

#### **2. Authentication Failed**
```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Change method from 'scram-sha-256' to 'md5'
# Then restart
sudo systemctl restart postgresql
```

#### **3. Database Does Not Exist**
```sql
-- Connect as postgres
sudo -u postgres psql

-- Create database
CREATE DATABASE store_db;

-- Exit
\q
```

#### **4. Permission Denied**
```sql
-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE store_db TO store_user;
GRANT ALL ON SCHEMA public TO store_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO store_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO store_user;
```

#### **5. Too Many Connections**
```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity;

-- Increase limit in postgresql.conf
max_connections = 200

-- Restart PostgreSQL
```

#### **6. Slow Queries**
```sql
-- Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 second

-- View slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## 📊 Monitoring

### **Check Database Status**

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Database size
SELECT pg_size_pretty(pg_database_size('store_db'));

-- Table sizes
SELECT 
  table_name,
  pg_size_pretty(pg_total_relation_size(table_name)) as size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(table_name) DESC;

-- Index usage
SELECT 
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes;
```

### **Performance Queries**

```sql
-- Cache hit ratio
SELECT 
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_hit_ratio
FROM pg_statio_user_tables;

-- Long running queries
SELECT 
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
```

---

## ✅ Quick Start Checklist

- [ ] Install PostgreSQL 16
- [ ] Create database `store_db`
- [ ] Create user `store_user`
- [ ] Update `.env` with connection string
- [ ] Run `npx prisma generate`
- [ ] Run `npx prisma migrate dev --name init`
- [ ] Run `npx prisma db:seed`
- [ ] Test connection with `npx prisma studio`
- [ ] Set up automated backups
- [ ] Configure monitoring

---

## 🎉 You're Ready!

Your PostgreSQL database is now set up for your e-commerce store!

**Next Steps:**
1. Run the application
2. Test all features
3. Set up backups
4. Monitor performance

**Useful Commands:**
```bash
# Start PostgreSQL
sudo systemctl start postgresql

# Connect to database
psql -U store_user -d store_db

# Run migrations
npx prisma migrate dev

# View database
npx prisma studio

# Backup
pg_dump -U store_user store_db > backup.sql
```