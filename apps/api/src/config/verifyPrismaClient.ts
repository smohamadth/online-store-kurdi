import type { PrismaClient } from '@prisma/client';

/**
 * Guard against a STALE generated Prisma client.
 *
 * `@prisma/client` is not the real client - it is a thin stub that re-exports
 * whatever was written into node_modules/.prisma/client by `prisma generate`.
 * That generated output is NOT tracked by git and is destroyed by
 * `npm install`, `npm ci` and `rm -rf node_modules`.
 *
 * So a client generated before a model existed simply has no property for it:
 *
 *   prisma.product       -> object     (was in the old schema)
 *   prisma.themeSettings -> undefined  (added later)
 *
 * The failure that produces is deeply unhelpful:
 *
 *   TypeError: Cannot read properties of undefined (reading 'findUnique')
 *
 * ...and, worse, `prisma.$connect()` still SUCCEEDS, so the server logs
 * "✅ Database connected successfully" and starts serving. Every endpoint that
 * touches a newer model then 500s at runtime, which in the admin UI reads as
 * "my settings won't save".
 *
 * We therefore assert up-front that every model the codebase actually uses is
 * present, and refuse to start with an instruction that fixes it.
 */

/**
 * Models referenced anywhere in apps/api/src.
 *
 * Regenerate with:
 *   grep -rhoP 'prisma\.\K[a-z][a-zA-Z]+(?=\.(findUnique|findFirst|findMany|\
 *   create|createMany|update|updateMany|upsert|delete|deleteMany|count|\
 *   aggregate|groupBy))' apps/api/src --include=*.ts | sort -u
 */
export const REQUIRED_MODELS = [
  'address',
  'banner',
  'cartItem',
  'category',
  'coupon',
  'emailTemplate',
  'homeSection',
  'inventoryLog',
  'menu',
  'menuItem',
  'order',
  'orderItem',
  'passwordReset',
  'payment',
  'product',
  'productImage',
  'productVariant',
  'recommendationLog',
  'review',
  'session',
  'shippingMethod',
  'shippingZone',
  'stockAlert',
  'storeSettings',
  'taxClass',
  'taxRate',
  'themeSettings',
  'user',
  'userEvent',
  'wishlistItem',
] as const;

export class StalePrismaClientError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(
      `The generated Prisma client is out of date - ${missing.length} model(s) ` +
        `are missing: ${missing.join(', ')}.`
    );
    this.name = 'StalePrismaClientError';
    this.missing = missing;
  }
}

/** Returns the models the code needs that the generated client does not have. */
export function findMissingModels(client: PrismaClient): string[] {
  const anyClient = client as unknown as Record<string, unknown>;
  return REQUIRED_MODELS.filter((m) => {
    const delegate = anyClient[m];
    // A real delegate is an object exposing query methods. Anything else -
    // undefined, or a stray non-delegate property - means it is unusable.
    return (
      !delegate ||
      typeof delegate !== 'object' ||
      typeof (delegate as { findFirst?: unknown }).findFirst !== 'function'
    );
  });
}

/**
 * Throws StalePrismaClientError if the client cannot serve the whole codebase.
 * Call this BEFORE the HTTP server starts listening.
 */
export function assertPrismaClientIsCurrent(client: PrismaClient): void {
  const missing = findMissingModels(client);
  if (missing.length > 0) throw new StalePrismaClientError(missing);
}

/** The exact commands that fix it, formatted for a terminal. */
export function stalePrismaClientHelp(missing: string[]): string[] {
  return [
    '❌ The generated Prisma client is out of date.',
    '',
    `   Missing model(s): ${missing.join(', ')}`,
    '',
    '   This happens after `npm install`, `npm ci`, deleting node_modules, or',
    '   pulling changes that add a model. The generated client lives in',
    '   node_modules/.prisma/client and is not tracked by git.',
    '',
    '   Fix (from the repo root):',
    '',
    '     cd apps/api',
    '     npx prisma generate',
    '     npm run db:deploy      # only if you also pulled new migrations',
    '',
    '   Then start the API again.',
  ];
}
