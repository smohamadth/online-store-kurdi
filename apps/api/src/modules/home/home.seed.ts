import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { HOME_SECTION_SEED } from './home.defaults';

/**
 * Insert shipped home blocks whose keys are missing.
 *
 * Called from admin reset and from `prisma db seed` — never from public GET.
 * Missing keys after a platform upgrade therefore stay gone until an admin
 * resets (or a deploy seed runs against an empty table).
 */
export async function seedMissingHomeSections() {
  const existing = await prisma.homeSection.findMany({ select: { key: true } });
  const have = new Set(existing.map((s) => s.key));
  const missing = HOME_SECTION_SEED.filter((s) => !have.has(s.key));
  if (missing.length === 0) return 0;

  for (const s of missing) {
    try {
      await prisma.homeSection.create({
        data: {
          key: s.key,
          type: s.type,
          title: s.title ?? null,
          subtitle: s.subtitle ?? null,
          isVisible: s.isVisible,
          sortOrder: s.sortOrder,
          config: s.config ? JSON.stringify(s.config) : null,
        },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
    }
  }
  logger.info(`Seeded ${missing.length} home section(s)`);
  return missing.length;
}
