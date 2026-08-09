# 🔄 Redis Setup & Implementation Guide

## 📋 Table of Contents

1. [Installation Options](#installation-options)
2. [Configuration](#configuration)
3. [How Redis is Used](#how-redis-is-used)
4. [Testing Redis](#testing-redis)
5. [Troubleshooting](#troubleshooting)

---

## 💿 Installation Options

### **Option 1: Docker (Recommended for Development)**

```powershell
# Install Docker Desktop first: https://www.docker.com/products/docker-desktop/

# Run Redis container
docker run -d `
  --name redis `
  -p 6379:6379 `
  redis:7-alpine

# Verify it's running
docker ps

# Connect to Redis CLI
docker exec -it redis redis-cli
```

### **Option 2: Memurai (Redis for Windows)**

```powershell
# Download from: https://www.memurai.com/install
# Or use Chocolatey:
choco install memurai

# Start Memurai
memurai-cli ping
```

### **Option 3: WSL2 (Windows Subsystem for Linux)**

```powershell
# Install WSL2
wsl --install

# Open WSL terminal and run:
sudo apt update
sudo apt install redis-server
sudo service redis-server start

# Test connection
redis-cli ping
```

### **Option 4: Linux/Mac**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis

# Mac
brew install redis
brew services start redis
```

---

## ⚙️ Configuration

### **Environment Variables**

Your `.env` file already has:
```bash
REDIS_URL=redis://localhost:6379
```

### **Custom Configuration**

If you need to change settings:

```bash
# Edit Redis config (Linux/Mac)
sudo nano /etc/redis/redis.conf

# Common settings:
# maxmemory 256mb
# maxmemory-policy allkeys-lru
```

---

## 🔍 How Redis is Used in Your Store

### **1. Caching (Products, Recommendations)**

```typescript
// apps/api/src/modules/products/product.routes.ts
import { cache } from '../../config/redis';

// Get product with caching
async function getProduct(id: string) {
  // Check cache first
  const cached = await cache.get(`product:${id}`);
  if (cached) return cached;

  // Fetch from database
  const product = await prisma.product.findUnique({ where: { id } });

  // Store in cache (1 hour)
  await cache.set(`product:${id}`, product, 3600);

  return product;
}
```

### **2. Session Storage**

```typescript
// apps/api/src/config/redis.ts
export const sessionStore = {
  async get(sessionId: string) {
    return await cache.get(`session:${sessionId}`);
  },
  async set(sessionId: string, session: any, ttl = 86400) {
    await cache.set(`session:${sessionId}`, session, ttl);
  },
};
```

### **3. Rate Limiting**

```typescript
// apps/api/src/app.ts
import { rateLimit } from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests
});
```

### **4. Real-time Analytics Counters**

```typescript
// apps/api/src/modules/analytics/analytics.service.ts
async function updateCounters(event: UserEvent) {
  const today = new Date().toISOString().split('T')[0];
  
  // Daily counter
  const key = `analytics:daily:${today}:${event.eventType}`;
  await redis.incr(key);
  await redis.expire(key, 86400);
}
```

---

## 🧪 Testing Redis

### **Test Connection**

```bash
# Using Redis CLI
redis-cli ping
# Expected: PONG

# Test from Node.js
node -e "
const redis = require('redis');
const client = redis.createClient();
client.connect()
  .then(() => {
    console.log('✅ Connected!');
    return client.ping();
  })
  .then(console.log)
  .catch(console.error)
  .finally(() => client.disconnect());
"
```

### **Test Your Application**

```bash
# Start your app
npm run dev:api

# Look for these logs:
# ✅ Redis connected successfully
# or
# ⚠️ Redis not available - caching disabled
```

---

## 📊 Redis Dashboard (Optional)

### **RedisInsight**

```bash
# Download from: https://redis.com/redis-enterprise/redis-insight/
# Connect to: localhost:6379
```

### **Redis Commander**

```bash
docker run -d --name redis-commander -p 8081:8081 rediscommander/redis-commander:latest
# Open: http://localhost:8081
```

---

## 🚨 Troubleshooting

### **Error: Connection Refused**

```bash
# Check if Redis is running
docker ps | grep redis
# or
sudo systemctl status redis

# Start if not running
docker start redis
# or
sudo systemctl start redis
```

### **Error: ECONNREFUSED ::1:6379**

This means Redis is trying to connect via IPv6. Fix:

```typescript
// apps/api/src/config/redis.ts
const redis = createClient({
  url: 'redis://127.0.0.1:6379', // Use IPv4 explicitly
});
```

### **Error: Redis reconnection failed**

This is normal if Redis isn't installed. Your app handles this gracefully:

```
⚠️ Redis not available - caching disabled
```

The app works fine without Redis - just slower.

---

## ✅ Quick Start Checklist

- [ ] Install Redis (Docker, Memurai, or native)
- [ ] Verify: `redis-cli ping` returns `PONG`
- [ ] Update `.env` if needed: `REDIS_URL=redis://localhost:6379`
- [ ] Start API: `npm run dev:api`
- [ ] Look for: `✅ Redis connected successfully`

---

## 💡 Pro Tips

### **1. Use Docker for Development**
```bash
# Add to docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### **2. Monitor Redis**
```bash
# Watch commands in real-time
redis-cli monitor

# Check memory usage
redis-cli info memory
```

### **3. Backup Redis**
```bash
# Trigger snapshot
redis-cli bgsave

# Copy dump.rdb
cp /var/lib/redis/dump.rdb /backup/
```

---

## 🎯 Summary

| Aspect | Status |
|--------|--------|
| **Redis Config** | ✅ Already configured |
| **Error Handling** | ✅ Graceful fallback |
| **Caching API** | ✅ Ready to use |
| **Session Store** | ✅ Ready to use |
| **Installation** | ⚠️ User needs to install |

**Your app works without Redis** - it's optional for performance optimization.

**Install Redis when:**
- You want faster API responses
- You need session persistence
- You're deploying to production
