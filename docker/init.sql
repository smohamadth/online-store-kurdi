-- Initialize PostgreSQL database
-- This script runs when the PostgreSQL container starts for the first time

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_role AS ENUM ('customer', 'admin', 'manager');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE product_status AS ENUM ('draft', 'active', 'inactive', 'archived');

-- Create indexes for better performance
-- These will be created by Prisma migrations, but we can add custom ones here

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE store_db TO store_user;