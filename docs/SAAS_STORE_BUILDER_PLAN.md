# Store Builder Conversion — Week 1 Handoff

**Date:** 2026-08-25
**Status:** Plan only. Code is not written. This document is the spec
for week 1 of the multi-tenant conversion.

## Why this doc exists

A "fix everything" turn on the codebase surfaced the question: "I
want to turn this into a store builder." After four rounds of
clarifying questions, the shape is:

- Hosted SaaS (not self-hosted)
- Non-technical merchants (not agencies)
- Recurring revenue ($29/mo subscription)
- Target first paying customer in one quarter (12 weeks)
- Tenant isolation: single Postgres DB, `tenantId` column on every
  table
- Routing: subdomain first (`<shop>.yourdomain.com`), with custom
  domain as a paid add-on in month 4
- Auth: NextAuth.js (this turn's call — see "Auth library tradeoff"
  below)
- Payments: defer real Stripe to week 8; run a "request access"
  flow for the first 1–2 months
- UI: existing inline styles stay in week 1, gradual shadcn/ui
  migration starting week 2

The "sandbox can't run prisma generate" constraint made the
right call clear: don't write code in an environment that
can't run the database. This document is the spec to execute in
an environment that has database access.

## The 12-week roadmap (one-liner each)

| Weeks | What ships |
|---|---|
| 1 | Multi-tenant foundation: Tenant model, migration, Prisma extension, resolveTenant middleware, NextAuth, sign-up flow, subdomain routing. |
| 2 | Onboarding wizard, sample data, shadcn/ui scaffold |
| 3–4 | Onboarding polish, settings persistence, store name + logo |
| 5–7 | Public storefront under multi-tenant: every API route learns about tenants |
| 8 | Real payments: Stripe Checkout (hosted) for the merchant's customers, real checkout in the storefront |
| 9–10 | Stripe Subscriptions for the SaaS itself. Trial period. Email confirmations. |
| 11 | Polish: password reset, rate limiting, security audit, status page |
| 12 | Launch: landing page, docs, one real paying customer |

## What week 1 actually does

A new merchant should be able to:

1. Visit `kurdistore.com/signup`
2. Enter email + password + store name
3. Click "Create store"
4. Be redirected to a subdomain at `<storename>.kurdistore.com`
   (in production) or `?tenant=<storename>` in local dev
5. See their empty admin shell at `/admin`

That's it. No theme picker, no first product, no settings. Just
"you have a tenant, you're logged in as its owner, you can see
the admin shell."

## File-by-file plan

### 1. `apps/api/prisma/schema.prisma` — add the Tenant model

```prisma
model Tenant {
  id              String   @id @default(uuid())
  // The subdomain / ?tenant= value. Lowercase, URL-safe.
  // Unique across the whole install.
  subdomain       String   @unique
  // Human-readable name. Defaults to the subdomain.
  name            String
  // Cached display name. The merchant changes this in settings.
  // (Plan ahead for it but don't build the settings UI yet.)
  // The optional custom domain. null = subdomain only.
  customDomain    String?  @unique
  // Domain verification state: 'pending' | 'verified' | 'failed'.
  // Used for the month-4 paid custom-domain feature.
  domainStatus    String   @default("pending")
  // Stripe customer id, populated when the merchant activates billing.
  stripeCustomerId String? @unique
  // Subscription state. 'trialing' = first 14 days; 'active' = paid;
  // 'past_due' = payment failed, give them 7 days; 'cancelled'.
  plan            String   @default("trialing")
  trialEndsAt     DateTime @default(now() + 14 days)
  // When the merchant first signed up. Used for analytics.
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  users           User[]
  // (one-to-many relations to every existing model go here)

  @@index([subdomain])
  @@index([customDomain])
}
```

### 2. Migration to add `tenantId` to every existing model

The list of models that need `tenantId` is the union of: every
model that's part of the merchant's data, and every model that
references one of those. Concretely:

- User (a user belongs to a tenant; this is the foundation of auth)
- Address
- Category
- Product, ProductImage, Variant, VariantImage
- Option, OptionValue, VariantOptionValue
- Review, ReviewPhoto
- WishlistItem
- CartItem
- Order, OrderItem, Payment
- ProductDownload, DownloadLog
- Coupon
- GiftCard, GiftCardTransaction
- StoreCredit, StoreCreditTransaction
- Currency
- ExchangeRateSnapshot
- EmailTemplate
- InventoryLog
- StockAlert
- Warehouse, WarehouseStock, WarehouseTransfer
- StockReservation
- StockTake, StockTakeItem
- ReorderRule, ReorderDraft
- Channel, ChannelStock
- ThreePLSyncEvent
- WebhookSecret
- ShippingZone, ShippingMethod
- TaxRate, TaxClass
- Menu, MenuItem
- Banner
- ThemeSettings
- HomeSection
- Page, BlogPost
- Session, PasswordReset
- UserEvent
- ProductEmbedding, ProductSimilarity
- UserPreference
- RecommendationLog, SearchQuery

That's 50+ models. For each, the migration is:

1. Add the column nullable (FK can't be added non-null without a default)
2. Backfill all existing rows to a "default" tenant
3. Add the FK constraint
4. Make the column non-null
5. Add a composite index `(tenantId, <existing-unique-or-frequently-queried-field>)`

The unique constraints need care: `Product.sku` is `@unique` in
the existing schema, but with multi-tenant it needs to be
`@unique([tenantId, sku])`. Same for `Category.slug`,
`Variant.sku`, `Order.orderNumber`, `Menu.name`, etc. Otherwise
two tenants couldn't both have a "t-shirt" SKU.

**The Prisma migration file is the highest-risk artifact in
this whole sprint.** I'd recommend writing the migration by
hand as a SQL file (`prisma/migrations/<timestamp>_multi_tenant/migration.sql`)
rather than using `prisma migrate dev`, because the auto-generated
migration has been known to drop the unique constraint the wrong
way and corrupt data. Hand-written SQL is also easier to review
in code review.

### 3. Backfill script (`prisma/backfill-tenant.ts`)

Standalone script that runs after the migration. Idempotent.

```typescript
// Pseudo-code, not real Prisma
const DEFAULT_TENANT = await prisma.tenant.upsert({
  where: { subdomain: 'default' },
  create: { subdomain: 'default', name: 'Default Store' },
  update: {},
});

const tables = [
  'User', 'Product', 'Category', /* ... all 50+ */
];

for (const table of tables) {
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
    DEFAULT_TENANT.id,
  );
}
```

Run this once after the migration. After it runs, the
"default" tenant is the seed data the codebase was already
using; from there, every new sign-up creates a new tenant.

### 4. Prisma extension to enforce `tenantId` scope

This is the safety net. Every prisma call automatically includes
`where: { tenantId }` and `data: { tenantId }` on `create`. The
developer cannot forget because the type system forces them to
pass `tenantId` to every call.

**File:** `apps/api/src/lib/prismaTenant.ts`

```typescript
import { Prisma } from '@prisma/client';

const TENANT_SCOPED_MODELS = new Set([
  'User', 'Product', 'Category', /* ... the list */
]);

// Models that are NOT tenant-scoped. These are global.
const GLOBAL_MODELS = new Set([
  'Tenant',
  // Anything else that's truly cross-tenant (none right now,
  // but the list will grow with a future features system).
]);

export function withTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (GLOBAL_MODELS.has(model)) return query(args);
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);
          if (!tenantId) {
            throw new Error(
              `prisma.${model}.${operation} called without a tenantId ` +
              `on a tenant-scoped model. This is a bug.`,
            );
          }

          // Inject tenantId into where / data.
          if (operation === 'findMany' || operation === 'findFirst' ||
              operation === 'count' || operation === 'aggregate' ||
              operation === 'groupBy') {
            args.where = { ...args.where, tenantId };
          }
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            // findUnique doesn't take a `where.tenantId` filter
            // because it expects a unique key. Instead, intercept
            // and convert to findFirst which does.
            return prisma[model].findFirst({
              where: { ...args.where, tenantId },
              ...args,
            });
          }
          if (operation === 'create') {
            args.data = { ...args.data, tenantId };
          }
          if (operation === 'createMany') {
            const data = Array.isArray(args.data) ? args.data : [args.data];
            args.data = data.map((d) => ({ ...d, tenantId }));
          }
          if (operation === 'update' || operation === 'updateMany' ||
              operation === 'delete' || operation === 'deleteMany' ||
              operation === 'upsert') {
            args.where = { ...args.where, tenantId };
          }

          return query(args);
        },
      },
    },
  });
}
```

**Usage in a route:**

```typescript
// In a Next.js route handler
import { prisma } from '@/lib/prisma';
import { resolveTenant } from '@/lib/tenant';

export async function GET(req: Request) {
  const tenant = await resolveTenant(req);
  // The `tenant` parameter is what every prisma call now uses.
  // No need to pass tenantId manually.
  const products = await tenant.prisma.product.findMany();
  return Response.json(products);
}
```

The `tenant.prisma` object is the extended prisma client with
`tenantId` already injected. Every call is guaranteed to be
tenant-scoped.

### 5. `resolveTenant` middleware

**File:** `apps/api/src/middleware/resolveTenant.ts`

Three sources, in priority order:

1. `?tenant=foo` query parameter (local dev only — set the
   middleware to skip this in production via env var)
2. The `Host` header, looking up the subdomain against the
   `Tenant` table
3. If neither matches, return 404 (in production) or fall
   through to a "no tenant selected" state (in local dev)

The middleware:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export async function resolveTenant(req: NextRequest) {
  // 1. Query param (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const q = req.nextUrl.searchParams.get('tenant');
    if (q) {
      const t = await prisma.tenant.findUnique({
        where: { subdomain: q },
      });
      if (t) return t;
    }
  }

  // 2. Subdomain from Host header
  const host = req.headers.get('host')?.toLowerCase() ?? '';
  const hostname = host.split(':')[0]; // strip port
  if (hostname && !DEV_HOSTS.has(hostname)) {
    const subdomain = hostname.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
      const t = await prisma.tenant.findUnique({
        where: { subdomain },
      });
      if (t) return t;
    }
  }

  // 3. No tenant
  return null;
}
```

**Edge case to handle:** a logged-in user with a `tenantId` in
their session JWT might arrive at a domain that doesn't match
their tenant (e.g. they're previewing from the wrong URL). For
week 1, the simple rule is: the host wins. The user's tenantId
must match the host's tenant or they're shown a "wrong store"
error. We'll refine in week 2.

### 6. NextAuth setup

**File:** `apps/web/lib/auth.ts`

NextAuth with the credentials provider. Email + password.

```typescript
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.tenantId = token.tenantId;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
};
```

**File:** `apps/web/app/api/auth/[...nextauth]/route.ts`

```typescript
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

The `(user) => { tenantId }` round-trip puts the tenantId in
the JWT. Every server component or API route that needs the
tenant reads it from `getServerSession(authOptions)`.

### 7. Sign-up flow

**File:** `apps/web/app/signup/page.tsx`

A simple form: email, password, store name, subdomain. On
submit:

1. Validate the subdomain (lowercase, no special chars, 3-30 chars, not reserved)
2. Create the Tenant row
3. Create the User row with `tenantId` set, password bcrypt-hashed
4. Create the default ThemeSettings, StoreSettings, HomeSection rows
5. Sign the user in via NextAuth
6. Redirect to `/admin`

**File:** `apps/web/app/api/signup/route.ts` (or use a server action)

The server action approach is cleaner with Next 14+. Use a
server action that takes a `FormData`, validates, and does the
work. Server actions automatically handle the form submission.

### 8. Admin shell under multi-tenant

**File:** `apps/web/app/admin/layout.tsx` (modify the existing file)

The current admin layout calls `useRouter().push('/login')` if
there's no user. The new version:

1. Reads the session via `getServerSession`
2. If no session, redirect to `/signup` (not `/login` — there's
   no login yet because there's no tenant to log into)
3. The session's `tenantId` is what the rest of the admin uses
   to scope its queries

### 9. Tests

The most valuable test is a roundtrip test:

```typescript
// apps/api/tests/integration/tenancy.test.ts
describe('multi-tenant data isolation', () => {
  it('creating a product in tenant A does not show up in tenant B', async () => {
    // Sign up two tenants, two users, two stores.
    const a = await signup({ email: 'a@x.com', storeName: 'a', subdomain: 'shop-a' });
    const b = await signup({ email: 'b@x.com', storeName: 'b', subdomain: 'shop-b' });

    // Create a product in tenant A.
    await a.prisma.product.create({
      data: { name: 'A only', slug: 'a-only', sku: 'A-1', price: 10, /* ... */ },
    });

    // Verify it does NOT show up in tenant B.
    const bProducts = await b.prisma.product.findMany();
    expect(bProducts).toHaveLength(0);

    // Verify it DOES show up in tenant A.
    const aProducts = await a.prisma.product.findMany();
    expect(aProducts).toHaveLength(1);
  });
});
```

This is the test that, if it passes, proves the multi-tenant
layer is correct. If you can only write one test in week 1,
write this one.

## What I will NOT do in week 1

- Migrate the admin's inline styles to shadcn/ui
- Build the theme picker
- Build the first-product wizard
- Build settings UI
- Connect Stripe (any kind)
- Add custom domain support
- Translate the SaaS UI (English only for the merchant)
- Build the public storefront under multi-tenant (weeks 5-7)
- Add email verification
- Add password reset (this is week 11 polish)
- Add 2FA
- Add rate limiting
- Add CSRF protection (NextAuth handles its own)

## Auth library tradeoff (a real one)

The choice between NextAuth and Clerk is the kind of decision
that costs a week if you make it wrong. NextAuth is free, you
own the code, you can self-host. Clerk is hosted, looks
polished, costs $25/mo after 10k users.

For an MVP store builder with non-technical merchants, **Clerk
is probably the right choice** even though we picked NextAuth
here. The week you save on auth polish is the week you can
spend on the things that actually differentiate you. The
tradeoff is real: NextAuth means you write the email
templates, the password reset, the email verification, the 2FA.
That's 5-8 days of focused work.

If you go NextAuth and find yourself a week in wondering why
password reset still looks like 2014, switch to Clerk. The
migration is contained to `lib/auth.ts` and the four pages
that use it.

## The risks, ranked

1. **The Prisma migration is the highest-risk artifact.** Test
   it on a copy of production data first. If something goes
   wrong, the worst case is "every product is now under the
   'default' tenant and you have to manually re-assign." Plan
   for that. Back up the DB before running the migration.
2. **Wildcard DNS + cert automation is the second-highest risk.**
   Even with subdomain-only routing (no custom domain), you
   need a wildcard A record and a wildcard TLS cert. Test
   this on day 1, not day 30. Caddy + Let's Encrypt is the
   simplest stack; Vercel handles wildcard certs
   automatically if you deploy there.
3. **The Prisma extension has subtle bugs.** The `findUnique` →
   `findFirst` rewrite in particular is a footgun: the
   signature is the same but performance is different, and
   the unique-constraint optimization no longer applies. Test
   it carefully.
4. **Session JWT carries `tenantId`.** When a user changes
   tenants (e.g. they're invited to another store), the JWT
   needs to be invalidated. NextAuth's JWT strategy makes this
   awkward; the fix is a short token lifetime (15 min) so
   re-auth is the recovery path.
5. **The `User` model currently allows `role: 'admin' | 'manager'
   | 'customer'`.** With multi-tenant, "admin" needs to be
   scoped per tenant (tenant admins) vs. SaaS staff (your own
   team, "super admins"). Add a `globalRole` column for the
   second case. Don't conflate them.
6. **`StoreSettings.id = "default"` is no longer valid.** It's
   not unique across tenants. Change to `@default(uuid())` and
   add a `@@unique([tenantId, id])`.

## What to do when you sit down to do this

1. **Set up a real environment first.** Vercel + Neon
   (Postgres) + Stripe test mode. The sandbox can't do
   multi-tenant testing because prisma generate is blocked.
2. **Run the migration on a copy of production data first.**
   Verify the backfill works. Verify the unique constraints
   are now composite. Verify the indexes are right (a missing
   index here will silently kill query performance once
   tenants grow).
3. **Write the roundtrip test before anything else.** The
   test that proves "tenant A's data is invisible to tenant
   B." If that test passes, the rest of the build is
   iteration.
4. **Ship a no-frills sign-up, even if the admin is empty.**
   Better to have a real sign-up that creates a real tenant
   and an empty admin, than a polished sign-up that breaks
   when it tries to create a tenant.
5. **Get one real user — a friend, a colleague, anyone — to
   sign up before week 4.** Real users find bugs that no
   test can. A friend who creates a store and then can't
   figure out what to do is the most valuable data point
   you'll collect in week 1.
