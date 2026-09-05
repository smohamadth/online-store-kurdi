-- Home featured merchandising. Additive, default false so existing catalogue
-- keeps the previous “popular then newest” fallback until an admin flags SKUs.
ALTER TABLE "Product" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Product_isFeatured_idx" ON "Product"("isFeatured");
