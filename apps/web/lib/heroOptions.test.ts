import { describe, it, expect } from 'vitest';
import { heroOptionsFromConfig, HERO_DEFAULTS } from './heroOptions';

describe('heroOptionsFromConfig', () => {
  it('returns the classic slideshow defaults for an empty/missing block', () => {
    expect(heroOptionsFromConfig(undefined)).toEqual(HERO_DEFAULTS);
    expect(heroOptionsFromConfig(null)).toEqual(HERO_DEFAULTS);
    expect(heroOptionsFromConfig({})).toEqual(HERO_DEFAULTS);
  });

  it('reads a full block', () => {
    expect(
      heroOptionsFromConfig({
        layout: 'single',
        height: 'tall',
        autoPlay: false,
        intervalSec: 4,
        arrows: false,
        dots: false,
      })
    ).toEqual({
      layout: 'single',
      height: 'tall',
      autoPlay: false,
      autoPlayMs: 4000,
      showArrows: false,
      showDots: false,
    });
  });

  it('falls back per key on junk values', () => {
    const o = heroOptionsFromConfig({
      layout: 'sideways',
      height: 42,
      autoPlay: 'yes',
      intervalSec: 'soon',
      arrows: 1,
      dots: null,
    });
    expect(o.layout).toBe('slideshow');
    expect(o.height).toBe('standard');
    expect(o.autoPlay).toBe(true);
    expect(o.autoPlayMs).toBe(6000);
    expect(o.showArrows).toBe(true);
    expect(o.showDots).toBe(true);
  });

  it('accepts numeric strings and clamps the interval', () => {
    expect(heroOptionsFromConfig({ intervalSec: '2' }).autoPlayMs).toBe(3000);
    expect(heroOptionsFromConfig({ intervalSec: 99 }).autoPlayMs).toBe(10000);
    expect(heroOptionsFromConfig({ intervalSec: 5.6 }).autoPlayMs).toBe(6000);
  });

  it('forces autoplay/arrows/dots off for the single layout', () => {
    const o = heroOptionsFromConfig({ layout: 'single', autoPlay: true, arrows: true });
    expect(o).toMatchObject({ layout: 'single', autoPlay: false, showArrows: false, showDots: false });
    expect(o.autoPlayMs).toBe(6000);
  });
});
