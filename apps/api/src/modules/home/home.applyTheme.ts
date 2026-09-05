/**
 * Map a theme's layouts.home onto HomeSection rows (replace live home).
 */
import { prisma } from '../../config/database';
import { getThemeConfig } from '../themeStudio/themeStudio.service';
import { HOME_SECTION_SEED } from './home.defaults';
import { layoutHomeToSeeds } from './home.layoutMap';
import { scrubBuilderConfig } from '../../utils/scrubBuilderConfig';

export { layoutHomeToSeeds } from './home.layoutMap';

export async function applyThemeHomeLayout(themeKey: string): Promise<{
  themeKey: string;
  usedFallback: boolean;
  count: number;
}> {
  const cfg = await getThemeConfig(themeKey);
  if (!cfg) {
    const err = new Error(`Theme "${themeKey}" was not found on disk.`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  let seeds = layoutHomeToSeeds(cfg.layouts?.home);
  const usedFallback = seeds.length === 0;
  if (usedFallback) seeds = HOME_SECTION_SEED;

  await prisma.homeSection.deleteMany({});
  for (const s of seeds) {
    const config = s.config ? JSON.stringify(scrubBuilderConfig(s.config)) : null;
    await prisma.homeSection.create({
      data: {
        key: s.key,
        type: s.type,
        title: s.title ?? null,
        subtitle: s.subtitle ?? null,
        isVisible: s.isVisible,
        sortOrder: s.sortOrder,
        config,
      },
    });
  }

  return { themeKey, usedFallback, count: seeds.length };
}
