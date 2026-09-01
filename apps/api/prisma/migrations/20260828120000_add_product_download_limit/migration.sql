-- AlterTable: snapshot the per-purchase download limit on the token row
-- (matches schema.prisma ProductDownload.downloadLimit, Int?).
ALTER TABLE "ProductDownload" ADD COLUMN "downloadLimit" INTEGER;
