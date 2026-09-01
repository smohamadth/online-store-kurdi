-- Synchronizes the migrations with schema.prisma after the session-01a022ee

-- feature set (first-class variants, digital downloads, multi-currency,

-- stock system, store credit/gift cards, review photos). DDL conventions

-- mirror the Prisma-generated migrations in this directory. Verified by

-- applying the full chain to a fresh SQLite database and cross-checking

-- every table, column, nullability, index and foreign key against

-- schema.prisma.



-- 1. Variant: first-class rename (ProductVariant -> Variant) + new columns

ALTER TABLE "ProductVariant" RENAME TO "Variant";

ALTER TABLE "Variant" ADD COLUMN "slug" TEXT;

ALTER TABLE "Variant" ADD COLUMN "compareAtPrice" REAL;

ALTER TABLE "Variant" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Variant_slug_key" ON "Variant"("slug");

CREATE INDEX "Variant_isActive_idx" ON "Variant"("isActive");

CREATE INDEX "Variant_productId_isActive_idx" ON "Variant"("productId", "isActive");



-- 2. Columns added to pre-existing tables by the feature set

ALTER TABLE "CartItem" ADD COLUMN "reservedUntil" DATETIME;

ALTER TABLE "CartItem" ADD COLUMN "variantSnapshot" TEXT;

ALTER TABLE "OrderItem" ADD COLUMN "isBackorder" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Page" ADD COLUMN "pageType" TEXT NOT NULL DEFAULT 'info';

ALTER TABLE "Product" ADD COLUMN "allowBackorder" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Product" ADD COLUMN "backorderLimit" INTEGER;

ALTER TABLE "Product" ADD COLUMN "expectedRestockAt" DATETIME;

ALTER TABLE "StoreSettings" ADD COLUMN "enabledCurrencies" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ThemeSettings" ADD COLUMN "activeTheme" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX "CartItem_reservedUntil_idx" ON "CartItem"("reservedUntil");

CREATE INDEX "Page_pageType_idx" ON "Page"("pageType");

CREATE INDEX "Review_isVerified_idx" ON "Review"("isVerified");



-- 3. New tables (FK dependency order)

CREATE TABLE "Currency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimalPlaces" INTEGER,
    "rateToBase" REAL NOT NULL,
    "manuallySet" BOOLEAN NOT NULL DEFAULT false,
    "lastFetchedAt" DATETIME,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

CREATE INDEX "Currency_code_idx" ON "Currency"("code");

CREATE INDEX "Currency_isEnabled_idx" ON "Currency"("isEnabled");



CREATE TABLE "ExchangeRateSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "rateToBase" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ExchangeRateSnapshot_code_fetchedAt_idx" ON "ExchangeRateSnapshot"("code", "fetchedAt");



CREATE TABLE "Option" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Option_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Option_productId_name_key" ON "Option"("productId", "name");

CREATE INDEX "Option_productId_idx" ON "Option"("productId");



CREATE TABLE "OptionValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "swatch" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OptionValue_optionId_value_key" ON "OptionValue"("optionId", "value");

CREATE INDEX "OptionValue_optionId_idx" ON "OptionValue"("optionId");



CREATE TABLE "VariantImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "thumbnail" TEXT,
    "medium" TEXT,
    "large" TEXT,
    "zoom" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VariantImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "VariantImage_variantId_idx" ON "VariantImage"("variantId");



CREATE TABLE "VariantOptionValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VariantOptionValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VariantOptionValue_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "OptionValue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VariantOptionValue_variantId_optionValueId_key" ON "VariantOptionValue"("variantId", "optionValueId");

CREATE INDEX "VariantOptionValue_variantId_idx" ON "VariantOptionValue"("variantId");

CREATE INDEX "VariantOptionValue_optionValueId_idx" ON "VariantOptionValue"("optionValueId");



CREATE TABLE "ReviewPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewPhoto_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReviewPhoto_reviewId_idx" ON "ReviewPhoto"("reviewId");



CREATE TABLE "ProductDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "ProductDownload_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductDownload_token_key" ON "ProductDownload"("token");

CREATE INDEX "ProductDownload_orderItemId_idx" ON "ProductDownload"("orderItemId");

CREATE INDEX "ProductDownload_expiresAt_idx" ON "ProductDownload"("expiresAt");



CREATE TABLE "DownloadLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "downloadId" TEXT NOT NULL,
    "userId" TEXT,
    "orderItemId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "DownloadLog_downloadId_idx" ON "DownloadLog"("downloadId");

CREATE INDEX "DownloadLog_userId_idx" ON "DownloadLog"("userId");

CREATE INDEX "DownloadLog_orderItemId_idx" ON "DownloadLog"("orderItemId");

CREATE INDEX "DownloadLog_createdAt_idx" ON "DownloadLog"("createdAt");



CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "initialAmount" REAL NOT NULL,
    "balance" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'active',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "redeemedByUserId" TEXT,
    "redeemedAt" DATETIME,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GiftCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

CREATE INDEX "GiftCard_code_idx" ON "GiftCard"("code");

CREATE INDEX "GiftCard_status_idx" ON "GiftCard"("status");

CREATE INDEX "GiftCard_expiresAt_idx" ON "GiftCard"("expiresAt");



CREATE TABLE "GiftCardTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "giftCardId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftCardTransaction_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GiftCardTransaction_giftCardId_idx" ON "GiftCardTransaction"("giftCardId");

CREATE INDEX "GiftCardTransaction_orderId_idx" ON "GiftCardTransaction"("orderId");



CREATE TABLE "StoreCredit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "balance" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreCredit_userId_currency_key" ON "StoreCredit"("userId", "currency");

CREATE INDEX "StoreCredit_userId_idx" ON "StoreCredit"("userId");



CREATE TABLE "StoreCreditTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeCreditId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreCreditTransaction_storeCreditId_fkey" FOREIGN KEY ("storeCreditId") REFERENCES "StoreCredit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoreCreditTransaction_storeCreditId_idx" ON "StoreCreditTransaction"("storeCreditId");

CREATE INDEX "StoreCreditTransaction_orderId_idx" ON "StoreCreditTransaction"("orderId");



CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

CREATE INDEX "Warehouse_code_idx" ON "Warehouse"("code");

CREATE INDEX "Warehouse_isActive_idx" ON "Warehouse"("isActive");



CREATE TABLE "WarehouseStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WarehouseStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WarehouseStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WarehouseStock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WarehouseStock_warehouseId_productId_variantId_key" ON "WarehouseStock"("warehouseId", "productId", "variantId");

CREATE INDEX "WarehouseStock_warehouseId_idx" ON "WarehouseStock"("warehouseId");

CREATE INDEX "WarehouseStock_productId_idx" ON "WarehouseStock"("productId");

CREATE INDEX "WarehouseStock_variantId_idx" ON "WarehouseStock"("variantId");



CREATE TABLE "WarehouseTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_transit',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    CONSTRAINT "WarehouseTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WarehouseTransfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WarehouseTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WarehouseTransfer_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "WarehouseTransfer_fromWarehouseId_idx" ON "WarehouseTransfer"("fromWarehouseId");

CREATE INDEX "WarehouseTransfer_toWarehouseId_idx" ON "WarehouseTransfer"("toWarehouseId");

CREATE INDEX "WarehouseTransfer_status_idx" ON "WarehouseTransfer"("status");



CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cartItemId" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "warehouseId" TEXT,
    "quantity" INTEGER NOT NULL,
    "reservedUntil" DATETIME NOT NULL,
    "releasedAt" DATETIME,
    "reason" TEXT NOT NULL DEFAULT 'cart_hold',
    "originType" TEXT,
    "originId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockReservation_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "CartItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockReservation_cartItemId_key" ON "StockReservation"("cartItemId");

CREATE INDEX "StockReservation_productId_idx" ON "StockReservation"("productId");

CREATE INDEX "StockReservation_variantId_idx" ON "StockReservation"("variantId");

CREATE INDEX "StockReservation_reservedUntil_idx" ON "StockReservation"("reservedUntil");

CREATE INDEX "StockReservation_releasedAt_idx" ON "StockReservation"("releasedAt");



CREATE TABLE "StockTake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" DATETIME,
    "cancelledAt" DATETIME,
    CONSTRAINT "StockTake_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StockTake_warehouseId_idx" ON "StockTake"("warehouseId");

CREATE INDEX "StockTake_status_idx" ON "StockTake"("status");



CREATE TABLE "StockTakeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockTakeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL,
    "notes" TEXT,
    CONSTRAINT "StockTakeItem_stockTakeId_fkey" FOREIGN KEY ("stockTakeId") REFERENCES "StockTake" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockTakeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockTakeItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockTakeItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StockTakeItem_stockTakeId_idx" ON "StockTakeItem"("stockTakeId");



CREATE TABLE "ReorderRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "warehouseId" TEXT,
    "threshold" INTEGER NOT NULL DEFAULT 10,
    "reorderQty" INTEGER NOT NULL DEFAULT 50,
    "supplierName" TEXT,
    "supplierEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReorderRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReorderRule_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReorderRule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ReorderRule_productId_idx" ON "ReorderRule"("productId");

CREATE INDEX "ReorderRule_isActive_idx" ON "ReorderRule"("isActive");



CREATE TABLE "ReorderDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "warehouseId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "supplierName" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "cancelledAt" DATETIME,
    "receivedAt" DATETIME,
    CONSTRAINT "ReorderDraft_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReorderRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReorderDraft_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReorderDraft_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReorderDraft_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ReorderDraft_status_idx" ON "ReorderDraft"("status");

CREATE INDEX "ReorderDraft_productId_idx" ON "ReorderDraft"("productId");



CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'online',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Channel_name_key" ON "Channel"("name");

CREATE INDEX "Channel_isActive_idx" ON "Channel"("isActive");



CREATE TABLE "ChannelStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelStock_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelStock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ChannelStock_channelId_productId_variantId_key" ON "ChannelStock"("channelId", "productId", "variantId");

CREATE INDEX "ChannelStock_channelId_idx" ON "ChannelStock"("channelId");

CREATE INDEX "ChannelStock_productId_idx" ON "ChannelStock"("productId");



CREATE TABLE "ThreePLSyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalSku" TEXT NOT NULL,
    "internalProductId" TEXT,
    "internalVariantId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "externalRef" TEXT,
    "raw" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThreePLSyncEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ThreePLSyncEvent_channelId_idx" ON "ThreePLSyncEvent"("channelId");

CREATE INDEX "ThreePLSyncEvent_provider_idx" ON "ThreePLSyncEvent"("provider");

CREATE INDEX "ThreePLSyncEvent_receivedAt_idx" ON "ThreePLSyncEvent"("receivedAt");



CREATE TABLE "WebhookSecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME
);

CREATE UNIQUE INDEX "WebhookSecret_provider_key" ON "WebhookSecret"("provider");

CREATE INDEX "WebhookSecret_provider_idx" ON "WebhookSecret"("provider");

