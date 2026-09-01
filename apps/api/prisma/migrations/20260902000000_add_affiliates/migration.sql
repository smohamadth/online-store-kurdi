-- Affiliate marketing program (docs/AFFILIATES_PLAN.md).
--
-- Four new tables plus attribution columns on Order and the two program
-- switches on StoreSettings. The program defaults OFF (affiliateEnabled
-- false); nothing changes for stores that never turn it on.

-- Program switches on the singleton settings row.
ALTER TABLE "StoreSettings" ADD COLUMN "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSettings" ADD COLUMN "affiliateRate" REAL NOT NULL DEFAULT 10;

-- Affiliate profiles: one per user, unique referral code.
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rateOverride" REAL,
    "totalEarned" REAL NOT NULL DEFAULT 0,
    "totalPaid" REAL NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Affiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Affiliate_userId_key" ON "Affiliate"("userId");
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");

-- One row per tracked click on an affiliate link (best-effort metric).
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateClick_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AffiliateClick_affiliateId_createdAt_idx" ON "AffiliateClick"("affiliateId", "createdAt");

-- Commissions on paid orders; one per order, ever (orderId unique).
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderAmount" REAL NOT NULL,
    "rate" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvedAt" DATETIME,
    CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffiliateCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AffiliateCommission_orderId_key" ON "AffiliateCommission"("orderId");
CREATE INDEX "AffiliateCommission_affiliateId_status_idx" ON "AffiliateCommission"("affiliateId", "status");
CREATE INDEX "AffiliateCommission_status_idx" ON "AffiliateCommission"("status");

-- Payout requests, resolved by an admin.
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "adminNotes" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AffiliatePayout_affiliateId_idx" ON "AffiliatePayout"("affiliateId");
CREATE INDEX "AffiliatePayout_status_idx" ON "AffiliatePayout"("status");

-- Attribution captured at order placement from the aff_ref cookie.
ALTER TABLE "Order" ADD COLUMN "affiliateId" TEXT REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "affiliateCode" TEXT;
CREATE INDEX "Order_affiliateId_idx" ON "Order"("affiliateId");
