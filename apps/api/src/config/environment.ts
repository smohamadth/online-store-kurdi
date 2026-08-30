// ---------------------------------------------------------------------------
// Environment loading + validation (Zod).
//
// This is the single gate between "someone's .env" and the running server:
// a missing/invalid variable makes the process EXIT AT IMPORT TIME with the
// field names, instead of surfacing later as a confusing 500. .env.ci in
// apps/api is the canonical set of values that must keep passing here -
// scripts/verify-env-config.py checks the templates against this schema.
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  API_VERSION: z.string().default('v1'),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Search provider. 'postgres' is the default and needs nothing extra:
  // product search runs a Prisma `contains` query. 'elasticsearch' turns on
  // the optional Elasticsearch-backed search (index maintained on product
  // writes); if Elasticsearch is unreachable the server logs and falls back
  // to the Postgres search for the affected request, it never hard-fails.
  SEARCH_PROVIDER: z.enum(['postgres', 'elasticsearch']).default('postgres'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('products'),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  
  // MinIO
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.string().default('9000'),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string().default('store-files'),
  MINIO_USE_SSL: z.string().default('false'),
  
  // Email
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.string().default('1025'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email(),
  
  // Frontend
  FRONTEND_URL: z.string().url(),

  // Public base URL of the API (e.g. https://api.example.com/api), used to
  // build absolute links that leave the server (digital-download links in
  // order emails). Optional: without it those fall back to localhost,
  // which is only right for local development.
  API_URL: z.string().url().optional(),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX: z.string().default('100'),
  
  // File Upload
  MAX_FILE_SIZE: z.string().default('10485760'),
  ALLOWED_FILE_TYPES: z.string(),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Error tracking (optional): with no DSN the app runs with Sentry
  // fully disabled - it is an observability add-on, never a dependency.
  SENTRY_DSN: z.string().url().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('logs/app.log'),
  
  // Security
  BCRYPT_ROUNDS: z.string().default('12'),
  CORS_ORIGIN: z.string(),
});

// Validate environment variables. console (not the logger) is deliberate:
// the logger itself depends on validated env (LOG_LEVEL), so using it here
// would be circular.
const envParse = envSchema.safeParse(process.env);

if (!envParse.success) {
  console.error('❌ Invalid environment variables:');
  console.error(envParse.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = envParse.data;

// Environment helpers
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';