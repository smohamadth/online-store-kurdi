-- CreateTable
CREATE TABLE "VariantAttribute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "VariantAttribute_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttribute_variantId_key_value_key" ON "VariantAttribute"("variantId", "key", "value");

-- CreateIndex
CREATE INDEX "VariantAttribute_key_value_idx" ON "VariantAttribute"("key", "value");

-- CreateIndex
CREATE INDEX "VariantAttribute_variantId_idx" ON "VariantAttribute"("variantId");
