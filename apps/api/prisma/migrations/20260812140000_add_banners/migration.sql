-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "image" TEXT NOT NULL,
    "mobileImage" TEXT,
    "linkUrl" TEXT,
    "buttonText" TEXT,
    "secondaryText" TEXT,
    "secondaryUrl" TEXT,
    "badge" TEXT,
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "overlayColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,0.35)',
    "align" TEXT NOT NULL DEFAULT 'left',
    "position" TEXT NOT NULL DEFAULT 'hero',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Banner_position_idx" ON "Banner"("position");

-- CreateIndex
CREATE INDEX "Banner_isActive_idx" ON "Banner"("isActive");

-- CreateIndex
CREATE INDEX "Banner_sortOrder_idx" ON "Banner"("sortOrder");

