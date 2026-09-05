/**
 * Map a theme's layouts.home onto HomeSection rows (replace live home).
 */
import { prisma } from '../../config/database';
import { getThemeConfig } from '../themeStudio/themeStudio.service';
import { HOME_SECTION_SEED, ALL_TYPES, type HomeSectionSeed } from './home.defaults';
import { scrubBuilderConfig } from '../../utils/scrubBuilderConfig';

const BLOCK_TO_SECTION: Record<string, string> = {
  hero: 'hero',
  promo: 'promo',
  bannerStrip: 'bannerStrip',
  trustBar: 'trustBar',
  features: 'features',
  categories: 'categories',
  featured: 'featured',
  newArrivals: 'carouselNew',
  trending: 'carouselTrending',
  dealCountdown: 'dealCountdown',
  testimonials: 'testimonials',
  stats: 'stats',
  gallery: 'gallery',
  richText: 'richText',
  custom: 'custom',
  newsletter: 'newsletter',
  cta: 'cta',
  video: 'video',
  image: 'lookbook',
  textImage: 'lookbook',
  divider: 'custom',
  faq: 'faq',
  steps: 'steps',
  logoStrip: 'logos',
  pricing: 'pricing',
  quote: 'quote',
  iconsGrid: 'features',
  productDetail: 'custom',
  productList: 'featured',
  categoryGrid: 'categories',
  blogList: 'custom',
  blogPostBody: 'richText',
  pageContent: 'custom',
};

const ALLOWED = new Set(ALL_TYPES);

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function slugKey(raw: string, used: Set<string>): string {
  const base = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'block';
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base.slice(0, 32)}-${n++}`;
  }
  used.add(key);
  return key;
}

export function layoutHomeToSeeds(layoutsHome: unknown): HomeSectionSeed[] {
  const layout = asRecord(layoutsHome);
  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  const used = new Set<string>();
  const sorted = [...blocks].sort((a, b) => {
    const aa = asRecord(a);
    const bb = asRecord(b);
    return (Number(aa.rowStart) || 0) - (Number(bb.rowStart) || 0) || (Number(aa.colStart) || 0) - (Number(bb.colStart) || 0);
  });
  const seeds: HomeSectionSeed[] = [];
  sorted.forEach((raw, i) => {
    const b = asRecord(raw);
    const blockType = String(b.type || '');
    const type = BLOCK_TO_SECTION[blockType] || 'custom';
    if (!ALLOWED.has(type)) return;
    const cfg = asRecord(b.config);
    const rowStart = Number(b.rowStart) || i + 1;
    const colStart = Number(b.colStart) || 1;
    const id = typeof b.id === 'string' && b.id ? b.id : blockType || `block-${i}`;
    seeds.push({
      key: slugKey(id, used),
      type,
      title: typeof cfg.title === 'string' ? cfg.title : null,
      subtitle: typeof cfg.subtitle === 'string' ? cfg.subtitle : null,
      isVisible: true,
      sortOrder: rowStart * 100 + colStart,
      config: cfg,
    });
  });
  return seeds;
}

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
