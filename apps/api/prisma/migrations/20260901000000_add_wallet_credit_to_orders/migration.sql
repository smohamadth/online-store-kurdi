-- Wallet credit at checkout: how much of an order was covered by store
-- credit / gift cards. totalAmount remains the full order value; the
-- amount still due is totalAmount - storeCreditApplied - giftCardApplied.
ALTER TABLE "Order" ADD COLUMN "storeCreditApplied" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "giftCardApplied" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "giftCardCode" TEXT;
