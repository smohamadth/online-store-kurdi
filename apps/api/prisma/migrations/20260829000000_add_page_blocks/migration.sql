-- AlterTable
-- Page layout blocks (JSON string: array of { id, type, config }).
-- NULL = no blocks; the storefront falls back to the content column.
ALTER TABLE "Page" ADD COLUMN "blocks" TEXT;
