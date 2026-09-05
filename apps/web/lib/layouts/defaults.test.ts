import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_HOME_LAYOUT } from './defaults';
import defaultTheme from '@/themes/default/theme.json';

const SEED_KEYS = [
  'hero',
  'promo',
  'trustBar',
  'categories',
  'featured',
  'newArrivals',
  'dealCountdown',
  'bannerStrip',
  'trending',
  'testimonials',
  'gallery',
  'stats',
  'features',
  'cta',
  'newsletter',
];

describe('DEFAULT_HOME_LAYOUT', () => {
  it('uses the same section keys as HOME_SECTION_SEED (cta before newsletter)', () => {
    expect(DEFAULT_HOME_LAYOUT.blocks.map((b) => b.id)).toEqual(SEED_KEYS);
    const cta = DEFAULT_HOME_LAYOUT.blocks.find((b) => b.id === 'cta')!;
    const news = DEFAULT_HOME_LAYOUT.blocks.find((b) => b.id === 'newsletter')!;
    expect(cta.rowStart).toBeLessThan(news.rowStart);
  });

  it('ships the same home block ids on default/theme.json', () => {
    const home = (defaultTheme as { layouts?: { home?: { blocks: { id: string }[] } } }).layouts?.home;
    expect(home?.blocks.map((b) => b.id)).toEqual(SEED_KEYS);
  });

  it('api seed includes cta before newsletter', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../api/src/modules/home/home.defaults.ts'),
      'utf8',
    );
    const cta = src.indexOf("key: 'cta'");
    const news = src.indexOf("key: 'newsletter'");
    expect(cta).toBeGreaterThan(0);
    expect(news).toBeGreaterThan(cta);
  });
});
