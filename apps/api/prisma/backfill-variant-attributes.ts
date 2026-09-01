/**
 * One-off backfill: populate the VariantAttribute query index from the
 * existing Variant.attributes JSON columns.
 *
 * Run it once after deploying the 20260830030000_variant_attribute_index
 * migration on a store that already has variants:
 *
 *   cd apps/api && npx tsx prisma/backfill-variant-attributes.ts
 *
 * Idempotent: it rewrites each variant's index rows from its current
 * attributes column, so re-running it (e.g. after a partial run or to
 * repair drift) converges to the same state. New variants created
 * through the normal API paths keep the index in sync on their own -
 * this script is only for the pre-existing rows.
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

function parseAttributes(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
  } catch {
    return {};
  }
}

async function main() {
  const variants = await prisma.variant.findMany({
    select: { id: true, attributes: true },
  });

  let rowsWritten = 0;
  for (const v of variants) {
    await prisma.variantAttribute.deleteMany({ where: { variantId: v.id } });
    const entries = Object.entries(parseAttributes(v.attributes));
    if (entries.length > 0) {
      await prisma.variantAttribute.createMany({
        data: entries.map(([key, value]) => ({
          variantId: v.id,
          key,
          value: String(value),
        })),
      });
      rowsWritten += entries.length;
    }
  }

  const total = await prisma.variantAttribute.count();
  console.log(`Backfilled ${variants.length} variants -> ${total} index rows (${rowsWritten} written this run).`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
