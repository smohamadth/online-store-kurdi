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

  // Theme studio: where admin-created themes are stored (as theme.json files).
  // Defaults to the web app's themes dir so a generated theme is picked up by
  // the registry on the next build. Overridable in tests to a temp dir.
  THEMES_DIR: z.string().default('../web/themes'),

  // Plugins: where installed plugins + their state live (file-based, no DB).
  // Bundled plugins are code in the repo; installed plugins are data-only
  // (signed webhooks). Overridable in tests to a temp dir.
  PLUGINS_DIR: z.string().default('plugins'),
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

// ---------------------------------------------------------------------------
// Refuse to boot a PRODUCTION server on placeholder credentials.
//
// `.env.example` ships working-looking values so a developer can copy it and
// have the stack run immediately. Two of them are dangerous if they survive
// to production:
//
//   JWT_SECRET=your-super-secret-jwt-key-change-in-production
//   MINIO_SECRET_KEY=minioadmin
//
// The JWT placeholder is 46 characters, so `z.string().min(32)` above accepts
// it happily. Anyone who copies .env.example, deploys, and forgets to rotate
// is signing tokens with a value published in this repository - an attacker
// can mint a token with `role: "admin"` and the API will honour it. Length
// validation cannot catch this; only a value check can.
//
// Enforced only when NODE_ENV=production so local dev and CI are unaffected.
// ---------------------------------------------------------------------------

/** Credentials that must never reach production, lowercased for comparison. */
const PLACEHOLDER_VALUES = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'change-in-production',
  'changeme',
  'minioadmin',
  'secret',
  'password',
  'sk_test_your_stripe_secret_key',
  'whsec_your_webhook_secret',
]);

/** Substrings that mark a value as an unedited template. */
const PLACEHOLDER_MARKERS = [
  'your-',
  'your_',
  'change-in-production',
  'changeme',
  'replace-me',
  'xxxxx',
];

export function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(v)) return true;
  return PLACEHOLDER_MARKERS.some((m) => v.includes(m));
}

if (env.NODE_ENV === 'production') {
  const offenders: string[] = [];
  const guarded: Array<[string, string | undefined]> = [
    ['JWT_SECRET', env.JWT_SECRET],
    ['MINIO_SECRET_KEY', env.MINIO_SECRET_KEY],
    ['MINIO_ACCESS_KEY', env.MINIO_ACCESS_KEY],
    ['STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY],
    ['STRIPE_WEBHOOK_SECRET', process.env.STRIPE_WEBHOOK_SECRET],
    ['SMTP_PASS', env.SMTP_PASS],
  ];
  for (const [name, value] of guarded) {
    if (isPlaceholderSecret(value)) offenders.push(name);
  }

  if (offenders.length > 0) {
    console.error(
      '❌ Refusing to start in production with placeholder credentials:\n' +
        offenders.map((o) => `   - ${o} is still the .env.example value`).join('\n') +
        '\n   Generate a real secret, e.g.  openssl rand -hex 32',
    );
    process.exit(1);
  }
}

// Environment helpers
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';