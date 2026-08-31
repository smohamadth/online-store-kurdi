-- CreateTable
CREATE TABLE "content_translation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "content_translation_entityType_entityId_locale_key" ON "content_translation"("entityType", "entityId", "locale");

-- CreateIndex
CREATE INDEX "content_translation_entityType_entityId_idx" ON "content_translation"("entityType", "entityId");
