-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ThemeSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "primaryColor" TEXT NOT NULL DEFAULT '#111111',
    "primaryTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "accentColor" TEXT NOT NULL DEFAULT '#2563eb',
    "bodyBg" TEXT NOT NULL DEFAULT '#ffffff',
    "cardBg" TEXT NOT NULL DEFAULT '#ffffff',
    "bodyText" TEXT NOT NULL DEFAULT '#111111',
    "mutedText" TEXT NOT NULL DEFAULT '#666666',
    "borderColor" TEXT NOT NULL DEFAULT '#e5e5e5',
    "headerBg" TEXT NOT NULL DEFAULT '#ffffff',
    "headerText" TEXT NOT NULL DEFAULT '#111111',
    "footerBg" TEXT NOT NULL DEFAULT '#fafafa',
    "footerText" TEXT NOT NULL DEFAULT '#111111',
    "priceColor" TEXT NOT NULL DEFAULT '#111111',
    "saleColor" TEXT NOT NULL DEFAULT '#dc2626',
    "fontFamily" TEXT NOT NULL DEFAULT 'system',
    "baseFontSize" INTEGER NOT NULL DEFAULT 16,
    "headingWeight" INTEGER NOT NULL DEFAULT 800,
    "radius" INTEGER NOT NULL DEFAULT 8,
    "buttonRadius" INTEGER NOT NULL DEFAULT 8,
    "containerWidth" INTEGER NOT NULL DEFAULT 1200,
    "cardShadow" TEXT NOT NULL DEFAULT 'soft',
    "productsPerRow" INTEGER NOT NULL DEFAULT 4,
    "showTrustBar" BOOLEAN NOT NULL DEFAULT true,
    "showTestimonials" BOOLEAN NOT NULL DEFAULT true,
    "showStats" BOOLEAN NOT NULL DEFAULT true,
    "showNewsletter" BOOLEAN NOT NULL DEFAULT true,
    "showDealCountdown" BOOLEAN NOT NULL DEFAULT true,
    "showCategories" BOOLEAN NOT NULL DEFAULT true,
    "showFeatured" BOOLEAN NOT NULL DEFAULT true,
    "showNewArrivals" BOOLEAN NOT NULL DEFAULT true,
    "announcementText" TEXT,
    "announcementLink" TEXT,
    "announcementBg" TEXT NOT NULL DEFAULT '#111111',
    "announcementText2" TEXT NOT NULL DEFAULT '#ffffff',
    "showAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "customCss" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ThemeSettings" ("accentColor", "announcementBg", "announcementLink", "announcementText", "announcementText2", "baseFontSize", "bodyBg", "bodyText", "borderColor", "buttonRadius", "cardShadow", "containerWidth", "createdAt", "customCss", "fontFamily", "footerBg", "footerText", "headerBg", "headerText", "headingWeight", "id", "mutedText", "priceColor", "primaryColor", "primaryTextColor", "productsPerRow", "radius", "saleColor", "showAnnouncement", "showCategories", "showDealCountdown", "showFeatured", "showNewArrivals", "showNewsletter", "showStats", "showTestimonials", "showTrustBar", "updatedAt") SELECT "accentColor", "announcementBg", "announcementLink", "announcementText", "announcementText2", "baseFontSize", "bodyBg", "bodyText", "borderColor", "buttonRadius", "cardShadow", "containerWidth", "createdAt", "customCss", "fontFamily", "footerBg", "footerText", "headerBg", "headerText", "headingWeight", "id", "mutedText", "priceColor", "primaryColor", "primaryTextColor", "productsPerRow", "radius", "saleColor", "showAnnouncement", "showCategories", "showDealCountdown", "showFeatured", "showNewArrivals", "showNewsletter", "showStats", "showTestimonials", "showTrustBar", "updatedAt" FROM "ThemeSettings";
DROP TABLE "ThemeSettings";
ALTER TABLE "new_ThemeSettings" RENAME TO "ThemeSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
