import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { env, isDevelopment } from './config/environment';
import { logger, loggerStream } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { csrfTokenRoute } from './middleware/csrf';

// Import routes
import productRoutes from './modules/products/product.routes';
import variantRoutes from './modules/products/variant.routes';
import orderRoutes from './modules/orders/order.routes';
import userRoutes from './modules/users/user.routes';
import authRoutes from './modules/auth/auth.routes';
import paymentRoutes from './modules/payments/payment.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import recommendationRoutes from './modules/recommendations/recommendation.routes';
import storageRoutes from './modules/storage/storage.routes';
import reviewRoutes from './modules/reviews/review.routes';
import couponRoutes from './modules/coupons/coupon.routes';
import settingsRoutes from './modules/settings/settings.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import shippingRoutes from './modules/shipping/shipping.routes';
import taxRoutes from './modules/tax/tax.routes';
import cartRoutes from './modules/cart/cart.routes';
import wishlistRoutes from './modules/wishlist/wishlist.routes';
import uploadRoutes from './modules/upload/upload.routes';
import categoryRoutes from './modules/categories/category.routes';
import newsletterRoutes from './modules/newsletter/newsletter.routes';
import addressRoutes from './modules/addresses/address.routes';
import contactRoutes from './modules/contact/contact.routes';
import stockAlertRoutes from './modules/stock-alerts/stock-alert.routes';
import menuRoutes from './modules/menus/menu.routes';
import bannerRoutes from './modules/banners/banner.routes';
import dashboardRoutes from './modules/analytics/dashboard.routes';
import themeRoutes from './modules/theme/theme.routes';
import homeSectionRoutes from './modules/home/home.routes';
import pageRoutes from './modules/pages/page.routes';
import blogRoutes from './modules/blog/blog.routes';

// Create Express app
const app = express();
const httpServer = createServer(app);

// Socket.IO for real-time features
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io accessible in routes
app.set('io', io);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: isDevelopment ? false : undefined,
  crossOriginEmbedderPolicy: false,
  // The storefront runs on a different origin (:3000) than this API (:3001),
  // so helmet's default 'same-origin' policy blocks every product/banner image
  // with ERR_BLOCKED_BY_RESPONSE.NotSameOrigin. Uploaded media is public
  // content and is meant to be embedded by the storefront.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
// 127.0.0.1 and localhost are DIFFERENT origins to a browser. The dev servers
// now bind 127.0.0.1 (to avoid EACCES on Windows), so a developer browsing
// http://127.0.0.1:3000 was blocked by CORS while http://localhost:3000 worked
// - every API call failed and even login silently did nothing.
// In development accept both loopback spellings on any port.
const extraOrigins = (process.env.CORS_EXTRA_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [env.FRONTEND_URL, ...extraOrigins];
const loopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

app.use(cors({
  origin: (origin, cb) => {
    // Non-browser clients (curl, server-to-server) send no Origin header.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (isDevelopment && loopback.test(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Session-ID'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
  // A single page view makes ~8 API calls (settings, menus, categories,
  // products, banners...), so a 100/15min budget locked the whole storefront
  // out after roughly a dozen page views and every request returned 429.
  // Development gets a generous budget; production keeps a real limit.
  max: isDevelopment ? 10000 : parseInt(env.RATE_LIMIT_MAX),
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMITED',
    retryAfter: Math.ceil(parseInt(env.RATE_LIMIT_WINDOW_MS) / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Read-only GETs are cheap and are what page loads are made of; only count
  // mutations plus auth attempts against the budget.
  skip: (req) => isDevelopment && req.method === 'GET',
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Body parsing middleware. The 3PL webhook handler needs the raw body
// for HMAC verification, so we register a verify hook that stashes it
// on req.rawBody before express.json parses the JSON.
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
// Plain-text body parser for the CSV bulk-import endpoint. Without
// this, supertest's `.set('Content-Type', 'text/csv').send(string)`
// leaves req.body empty (express.json refuses non-JSON content).
app.use(express.text({
  type: ['text/csv', 'text/plain'],
  limit: '10mb',
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// Compression middleware
app.use(compression());

// HTTP request logging
if (isDevelopment) {
  app.use(morgan('dev', { stream: loggerStream }));
} else {
  app.use(morgan('combined', { stream: loggerStream }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    version: '1.0.0',
  });
});

// CSRF token endpoint
app.get('/api/csrf-token', csrfTokenRoute);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Store API v1',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      orders: '/api/orders',
      users: '/api/users',
      payments: '/api/payments',
      analytics: '/api/analytics',
      recommendations: '/api/recommendations',
      storage: '/api/storage',
    },
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
// Variant routes are mounted at two prefixes to keep the URL space
// clean: /api/products/:productId/variants for the nested CRUD
// (handled by the router's own paths) and /api/variants/:id for the
// standalone lookup. Mounting variantRoutes twice in the same
// app.use chain is supported by Express - the router is the same
// instance and registers its routes on the layer each time.
app.use('/api/products', variantRoutes);
app.use('/api/variants', variantRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api', reviewRoutes);
app.use('/api', couponRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', categoryRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/stock-alerts', stockAlertRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/theme', themeRoutes);
app.use('/api/home-sections', homeSectionRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/blog', blogRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Join user-specific room
  socket.on('join-user-room', (userId: string) => {
    socket.join(`user:${userId}`);
    logger.info(`User ${userId} joined their room`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

export { app, httpServer, io };
export default app;