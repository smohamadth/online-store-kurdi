-- Marketing feature set: newsletter consent, abandoned-cart recovery,
-- per-customer coupon limits, product bundles, and email capture.
--
-- Every table here is additive and every new NewsletterSubscriber column is
-- nullable or defaulted, so existing rows and existing code keep working.

-- ---------------------------------------------------------------------------
-- 1. Newsletter consent + unsubscribe.
--
-- The table was id/email/createdAt only: no unsubscribe path and no record of
-- consent, so the list was legally unmailable even though the API collected
-- addresses. Unsubscribing flips `status`; we never delete the row, because a
-- later signup would otherwise silently re-add someone who opted out.
-- ---------------------------------------------------------------------------
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'subscribed';
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "unsubscribeToken" TEXT;
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "consentAt" DATETIME;
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "source" TEXT;
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "consentIp" TEXT;
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "unsubscribedAt" DATETIME;

-- Backfill existing rows: they consented at signup time (the only evidence we
-- have), and each needs a token so the unsubscribe link works for them too.
-- hex(randomblob(16)) gives a 32-char opaque token, unique per row.
UPDATE "NewsletterSubscriber"
   SET "consentAt" = "createdAt",
       "source" = 'legacy',
       "unsubscribeToken" = lower(hex(randomblob(16)))
 WHERE "unsubscribeToken" IS NULL;

CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");
CREATE INDEX "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- ---------------------------------------------------------------------------
-- 2. Abandoned-cart recovery.
--
-- The UNIQUE on (userId, stage) is what makes the sweep idempotent: a second
-- run for the same user and stage hits the constraint instead of sending a
-- duplicate email.
-- ---------------------------------------------------------------------------
CREATE TABLE "AbandonedCartEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "cartValue" REAL NOT NULL DEFAULT 0,
    "recoveredAt" DATETIME,
    "orderId" TEXT,
    CONSTRAINT "AbandonedCartEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AbandonedCartEmail_userId_stage_key" ON "AbandonedCartEmail"("userId", "stage");
CREATE INDEX "AbandonedCartEmail_sentAt_idx" ON "AbandonedCartEmail"("sentAt");
CREATE INDEX "AbandonedCartEmail_userId_idx" ON "AbandonedCartEmail"("userId");

-- ---------------------------------------------------------------------------
-- 3. Per-customer coupon usage.
--
-- Coupon.usedCount is a single global counter, so "one per customer" could not
-- be expressed and a single-use code could be shared publicly and drained.
-- ---------------------------------------------------------------------------
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CouponRedemption_couponId_userId_idx" ON "CouponRedemption"("couponId", "userId");
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");

-- Per-customer cap on the coupon itself. NULL = no per-customer limit, which
-- is the pre-existing behaviour, so nothing changes for current coupons.
ALTER TABLE "Coupon" ADD COLUMN "perCustomerLimit" INTEGER;
-- When true, only customers with no prior completed order may redeem.
ALTER TABLE "Coupon" ADD COLUMN "newCustomersOnly" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. Product bundles.
-- ---------------------------------------------------------------------------
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'percentage',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Bundle_slug_key" ON "Bundle"("slug");
CREATE INDEX "Bundle_isActive_idx" ON "Bundle"("isActive");
CREATE INDEX "Bundle_slug_idx" ON "Bundle"("slug");

CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BundleItem_bundleId_productId_key" ON "BundleItem"("bundleId", "productId");
CREATE INDEX "BundleItem_bundleId_idx" ON "BundleItem"("bundleId");

-- ---------------------------------------------------------------------------
-- 5. Email capture (exit-intent / welcome-discount popup).
-- ---------------------------------------------------------------------------
CREATE TABLE "EmailCapture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'exit_intent',
    "couponCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailCapture_email_idx" ON "EmailCapture"("email");
CREATE INDEX "EmailCapture_createdAt_idx" ON "EmailCapture"("createdAt");
