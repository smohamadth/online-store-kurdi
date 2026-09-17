/** Explicit, atomic replacement of the live homepage from a saved theme template. */
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { getThemeConfig } from '../themeStudio/themeStudio.service';
import type { HomeSectionSeed } from './home.defaults';
import { layoutHomeToSeeds, BLOCK_TO_SECTION } from './home.layoutMap';
import { scrubBuilderConfig } from '../../utils/scrubBuilderConfig';

export { layoutHomeToSeeds } from './home.layoutMap';

/** Validate everything before deleting anything; one failed insert rolls back the whole replacement. */
export async function replaceHomeSections(seeds: HomeSectionSeed[]) {
  if (seeds.length > 100) throw new AppError('A homepage can contain at most 100 sections.', 400, 'INVALID_HOME_TEMPLATE');
  const data = seeds.map((seed, index) => {
    const config = JSON.stringify(scrubBuilderConfig(seed.config || {}));
    if (Buffer.byteLength(config, 'utf8') > 64 * 1024) {
      throw new AppError('A homepage section exceeds the 64KB configuration limit.', 400, 'INVALID_HOME_TEMPLATE');
    }
    if ((seed.title?.length ?? 0) > 200 || (seed.subtitle?.length ?? 0) > 500) {
      throw new AppError('A homepage section heading or sub-heading is too long.', 400, 'INVALID_HOME_TEMPLATE');
    }
    return {
      key: seed.key, type: seed.type, title: seed.title ?? null, subtitle: seed.subtitle ?? null,
      isVisible: seed.isVisible, sortOrder: (index + 1) * 10, config,
    };
  });
  return prisma.$transaction(async (tx) => {
    await tx.homeSection.deleteMany({});
    for (const row of data) await tx.homeSection.create({ data: row });
    return tx.homeSection.findMany({ orderBy: { sortOrder: 'asc' } });
  });
}

export async function applyThemeHomeLayout(themeKey: string) {
  const cfg = await getThemeConfig(themeKey);
  if (!cfg) throw new AppError(`Theme “${themeKey}” was not found. Your homepage was not changed.`, 404, 'THEME_NOT_FOUND');

  const home = cfg.layouts?.home as { blocks?: unknown[] } | undefined;
  if (!Array.isArray(home?.blocks) || home.blocks.length === 0) {
    throw new AppError(
      `Theme “${cfg.name}” has no saved homepage template. Add sections in Theme Studio and save it first. Your homepage was not changed.`,
      400, 'NO_HOME_TEMPLATE',
    );
  }
  if (home.blocks.some((block) => {
    const b = block as { type?: string; config?: unknown } | null;
    return !b || typeof b.type !== 'string' || !Object.hasOwn(BLOCK_TO_SECTION, b.type) ||
      (b.config != null && (typeof b.config !== 'object' || Array.isArray(b.config)));
  })) {
    throw new AppError('The saved homepage template contains an invalid block. Your homepage was not changed.', 400, 'INVALID_HOME_TEMPLATE');
  }

  const seeds = layoutHomeToSeeds(home);
  const sections = await replaceHomeSections(seeds);
  return { themeKey, themeName: cfg.name, usedFallback: false, count: sections.length, sections };
}
