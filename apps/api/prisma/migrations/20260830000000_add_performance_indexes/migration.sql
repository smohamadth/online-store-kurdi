-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "InventoryLog_variantId_idx" ON "InventoryLog"("variantId");

-- CreateIndex
CREATE INDEX "InventoryLog_orderId_idx" ON "InventoryLog"("orderId");

-- CreateIndex
CREATE INDEX "StockTakeItem_productId_idx" ON "StockTakeItem"("productId");

-- CreateIndex
CREATE INDEX "ShippingZone_isActive_idx" ON "ShippingZone"("isActive");
