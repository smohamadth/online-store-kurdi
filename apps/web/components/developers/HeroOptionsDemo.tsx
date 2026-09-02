// HeroOptionsDemo — an interactive, LIVE-from-code demo of the hero
// design contract (apps/web/lib/heroOptions.ts). The selects below are
// driven by the exported constants and the JSON output is produced by
// the very normaliser the storefront runs, so what you see here is
// exactly what a store renders.

'use client';

import { useMemo, useState } from 'react';
import {
  HERO_DEFAULTS,
  HERO_HEIGHT_PX,
  HERO_LAYOUTS,
  HERO_HEIGHTS,
  heroOptionsFromConfig,
} from '@/lib/heroOptions';
import { C, CodeBlock, Pill } from './ui';

export default function HeroOptionsDemo() {
  const [layout, setLayout] = useState<string>(HERO_DEFAULTS.layout);
  const [height, setHeight] = useState<string>(HERO_DEFAULTS.height);
  const [autoPlay, setAutoPlay] = useState(HERO_DEFAULTS.autoPlay);
  const [intervalSec, setIntervalSec] = useState(HERO_DEFAULTS.autoPlayMs / 1000);
  const [arrows, setArrows] = useState(HERO_DEFAULTS.showArrows);
  const [dots, setDots] = useState(HERO_DEFAULTS.showDots);

  const input = useMemo(
    () => ({ layout, height, autoPlay, intervalSec, arrows, dots }),
    [layout, height, autoPlay, intervalSec, arrows, dots]
  );
  const normalised = heroOptionsFromConfig(input);

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px',
    fontSize: 13,
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    backgroundColor: C.cardBg,
    color: C.ink,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: C.muted,
    display: 'block',
    marginBottom: 4,
  };

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        backgroundColor: C.cardBg,
        padding: 16,
        margin: '10px 0',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        <label>
          <span style={labelStyle}>layout</span>
          <select style={selectStyle} value={layout} onChange={(e) => setLayout(e.target.value)}>
            {HERO_LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>height</span>
          <select style={selectStyle} value={height} onChange={(e) => setHeight(e.target.value)}>
            {HERO_HEIGHTS.map((h) => (
              <option key={h} value={h}>
                {h} ({HERO_HEIGHT_PX[h].desktop}px)
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>autoPlay</span>
          <input
            type="checkbox"
            checked={autoPlay}
            onChange={(e) => setAutoPlay(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
        </label>
        <label>
          <span style={labelStyle}>intervalSec ({intervalSec}s)</span>
          <input
            type="range"
            min={3}
            max={10}
            step={1}
            value={intervalSec}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          <span style={labelStyle}>arrows</span>
          <input
            type="checkbox"
            checked={arrows}
            onChange={(e) => setArrows(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
        </label>
        <label>
          <span style={labelStyle}>dots</span>
          <input
            type="checkbox"
            checked={dots}
            onChange={(e) => setDots(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <Pill tone={layout === 'slideshow' ? 'ok' : 'warn'}>
          {layout === 'slideshow'
            ? 'slideshow: autoplay + arrows + dots apply'
            : `${layout}: motion chrome is forced off by the normaliser`}
        </Pill>
      </div>
      <CodeBlock
        label="config.hero → heroOptionsFromConfig() output"
        code={JSON.stringify(normalised, null, 2)}
      />
      <p style={{ fontSize: 12.5, color: C.faint, margin: '6px 0 0' }}>
        This JSON is produced live by the same normaliser the storefront uses; the keys the admin
        sets in the Home builder are{' '}
        <code style={{ fontFamily: C.mono }}>layout · height · autoPlay · intervalSec · arrows · dots</code>{' '}
        and are stored in the home section&apos;s <code style={{ fontFamily: C.mono }}>config.hero</code>.
      </p>
    </div>
  );
}
