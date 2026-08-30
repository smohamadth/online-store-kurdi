-- AlterTable
-- Blog post layout blocks (JSON string: array of { id, type, config }),
-- the same block model as the Page model. NULL = no blocks; the
-- storefront falls back to the content column.
ALTER TABLE "BlogPost" ADD COLUMN "blocks" TEXT;
