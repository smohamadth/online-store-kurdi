#!/usr/bin/env node
/**
 * Render a storefront mockup PNG for every bundled theme.
 *
 * Why this exists
 * ---------------
 * Every bundled theme declares `"preview": "/themes/<key>/preview.png"` in its
 * theme.json, but none of those files exist on disk. So the admin theme
 * gallery renders broken images and GET /api/themes/<key>/preview.png 404s for
 * all five themes. This script generates them.
 *
 * The mockup is drawn as SVG and rasterised with sharp. It is NOT a browser
 * screenshot - it deliberately reads the SAME token values the storefront
 * reads (apps/web/themes/<key>/theme.json) and applies them the same way
 * apps/web/lib/theme.tsx does, so what you see is each theme's real palette,
 * radii, shadows, type scale, grid density and container width.
 *
 * Usage:  node scripts/render-theme-previews.js [--out <dir>] [--width 1280]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const THEMES_DIR = path.resolve(__dirname, '../apps/web/themes');

// ---------------------------------------------------------------------------
// Mirrors of apps/web/lib/theme.tsx. Kept in sync by
// scripts/render-theme-previews.test.js, which fails if theme.tsx changes.
// ---------------------------------------------------------------------------
const FONT_STACKS = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  inter: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  georgia: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: '"SF Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
  tahoma: 'Tahoma, Verdana, Segoe, sans-serif',
  vazirmatn: 'Vazirmatn, sans-serif',
  'noto-naskh': '"Noto Naskh Arabic", sans-serif',
  'noto-kufi': '"Noto Kufi Arabic", sans-serif',
  readex: '"Readex Pro", sans-serif',
  cairo: 'Cairo, sans-serif',
  tajawal: 'Tajawal, sans-serif',
};

// theme.tsx uses CSS box-shadow; SVG has no direct equivalent, so each level
// maps to a feDropShadow with matching opacity/offset/blur.
const SHADOWS = {
  none: null,
  soft: { dy: 1, blur: 2, opacity: 0.06 },
  strong: { dy: 10, blur: 12, opacity: 0.12 },
};

/** Sample catalog - the same four products the real /preview page uses. */
const PRODUCTS = [
  { name: 'Aero Headphones', price: '$199.00', category: 'Electronics', accent: '#2563eb' },
  { name: 'Field Notebook', price: '$28.00', category: 'Stationery', accent: '#8b6f47' },
  { name: 'Linen Throw', price: '$145.00', category: 'Home', accent: '#a89580' },
  { name: 'Ceramic Mug', price: '$32.00', category: 'Home', accent: '#d6c5a8' },
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Mix two hex colours - used for the placeholder image gradients. */
function mix(hex, other, amount) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex);
  const [r2, g2, b2] = p(other);
  const c = (a, b) => Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function buildSvg(theme, W) {
  const t = theme.tokens || {};
  // Font stacks contain double quotes ("Segoe UI"), which would terminate the
  // font-family="..." attribute early and produce invalid SVG. Escape them.
  const font = esc(FONT_STACKS[t.fontFamily] || FONT_STACKS.system);
  const radius = Number(t.radius ?? 8);
  const btnRadius = Math.min(Number(t.buttonRadius ?? 8), 40); // 999 = pill
  const base = Number(t.baseFontSize ?? 16);
  const perRow = Number(t.productsPerRow ?? 4);
  const headingWeight = Number(t.headingWeight ?? 700);
  const shadow = SHADOWS[t.cardShadow] ?? SHADOWS.soft;

  // Scale the mock to the theme's real container width, so a 960px theme
  // (Minimal) genuinely looks narrower than a 1400px one (Bold).
  const container = Number(t.containerWidth ?? 1200);
  const pad = Math.round(((1440 - container) / 1440) * (W * 0.14)) + 40;
  const inner = W - pad * 2;

  const announceH = 34;
  const headerH = 68;
  const heroH = 250;

  // Product grid geometry.
  const gap = 20;
  const cardW = (inner - gap * (perRow - 1)) / perRow;
  // Cap the image box: at 2-per-row (Bold) a 0.78 aspect would make each card
  // ~700px tall and swamp the mock. Real grids letterbox wide cards instead.
  const imgH = Math.round(Math.min(cardW * 0.78, 300));
  const cardH = imgH + 78;

  const gridTop = announceH + headerH + heroH + 62;
  const H = gridTop + cardH + 96;

  const filter = shadow
    ? `<filter id="sh" x="-20%" y="-20%" width="140%" height="160%">
         <feDropShadow dx="0" dy="${shadow.dy}" stdDeviation="${shadow.blur}"
                       flood-color="#000" flood-opacity="${shadow.opacity}"/>
       </filter>`
    : '';
  const shAttr = shadow ? ' filter="url(#sh)"' : '';

  // ---- product cards ----
  const cards = PRODUCTS.slice(0, perRow)
    .map((p, i) => {
      const x = pad + i * (cardW + gap);
      const g = `g${i}`;
      return `
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${mix(p.accent, '#ffffff', 0.55)}"/>
          <stop offset="100%" stop-color="${mix(p.accent, '#000000', 0.12)}"/>
        </linearGradient>
      </defs>
      <g${shAttr}>
        <rect x="${x}" y="${gridTop}" width="${cardW}" height="${cardH}" rx="${radius}"
              fill="${t.cardBg}" stroke="${t.borderColor}" stroke-width="1"/>
      </g>
      <path d="M${x} ${gridTop + radius} a${radius} ${radius} 0 0 1 ${radius} -${radius}
               h${cardW - radius * 2} a${radius} ${radius} 0 0 1 ${radius} ${radius}
               v${imgH - radius} h-${cardW} z" fill="url(#${g})"/>
      <text x="${x + 16}" y="${gridTop + imgH + 26}" font-family="${font}"
            font-size="${Math.round(base * 0.68)}" fill="${t.mutedText}"
            letter-spacing="0.6">${esc(p.category.toUpperCase())}</text>
      <text x="${x + 16}" y="${gridTop + imgH + 48}" font-family="${font}"
            font-size="${Math.round(base * 0.92)}" font-weight="${Math.min(headingWeight, 700)}"
            fill="${t.bodyText}">${esc(p.name)}</text>
      <text x="${x + 16}" y="${gridTop + imgH + 70}" font-family="${font}"
            font-size="${Math.round(base * 0.95)}" font-weight="700"
            fill="${t.priceColor}">${esc(p.price)}</text>`;
    })
    .join('');

  const heroY = announceH + headerH;
  const heroTitleSize = Math.round(base * 2.5);
  const btnW = 168;
  const btnH = 46;
  const btnY = heroY + heroH / 2 + 18;

  // Nav items - denser themes show more.
  const nav = ['Shop', 'Collections', 'About', 'Journal'];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${filter}
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <!-- A light wash of the accent. Kept subtle because some themes
           (Dawnlight) use a near-black accent, where a strong mix reads as
           muddy grey rather than as the theme's actual airy look. -->
      <stop offset="0%" stop-color="${mix(t.accentColor, t.bodyBg, 0.90)}"/>
      <stop offset="100%" stop-color="${mix(t.accentColor, t.bodyBg, 0.74)}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${t.bodyBg}"/>

  <!-- announcement bar -->
  <rect width="${W}" height="${announceH}" fill="${t.announcementBg || t.primaryColor}"/>
  <text x="${W / 2}" y="${announceH / 2 + 5}" text-anchor="middle" font-family="${font}"
        font-size="13" fill="${t.announcementText2 || t.primaryTextColor || '#fff'}">
    Free shipping on orders over $50
  </text>

  <!-- header -->
  <rect y="${announceH}" width="${W}" height="${headerH}" fill="${t.headerBg}"/>
  <line x1="0" y1="${announceH + headerH}" x2="${W}" y2="${announceH + headerH}"
        stroke="${t.borderColor}" stroke-width="1"/>
  <text x="${pad}" y="${announceH + headerH / 2 + 7}" font-family="${font}"
        font-size="${Math.round(base * 1.25)}" font-weight="${headingWeight}"
        fill="${t.headerText || t.bodyText}">The Sample Store</text>
  ${nav
    .map(
      (n, i) =>
        `<text x="${pad + inner * 0.42 + i * 96}" y="${announceH + headerH / 2 + 5}"
               font-family="${font}" font-size="${Math.round(base * 0.85)}"
               fill="${t.mutedText}">${esc(n)}</text>`,
    )
    .join('')}
  <circle cx="${W - pad - 12}" cy="${announceH + headerH / 2}" r="13"
          fill="none" stroke="${t.headerText || t.bodyText}" stroke-width="1.6"/>

  <!-- hero -->
  <rect x="${pad}" y="${heroY + 22}" width="${inner}" height="${heroH - 44}"
        rx="${radius}" fill="url(#hero)"/>
  <text x="${pad + 44}" y="${heroY + heroH / 2 - 16}" font-family="${font}"
        font-size="${heroTitleSize}" font-weight="${headingWeight}" fill="${t.bodyText}">
    New season, new staples
  </text>
  <text x="${pad + 44}" y="${heroY + heroH / 2 + 14}" font-family="${font}"
        font-size="${Math.round(base * 0.95)}" fill="${t.mutedText}">
    Considered pieces, built to last.
  </text>
  <rect x="${pad + 44}" y="${btnY}" width="${btnW}" height="${btnH}" rx="${btnRadius}"
        fill="${t.primaryColor}"/>
  <text x="${pad + 44 + btnW / 2}" y="${btnY + btnH / 2 + 5}" text-anchor="middle"
        font-family="${font}" font-size="${Math.round(base * 0.9)}" font-weight="600"
        fill="${t.primaryTextColor || '#ffffff'}">Shop now</text>

  <!-- section heading -->
  <text x="${pad}" y="${gridTop - 24}" font-family="${font}"
        font-size="${Math.round(base * 1.3)}" font-weight="${headingWeight}"
        fill="${t.bodyText}">Featured</text>

  ${cards}

  <!-- footer strip -->
  <rect y="${H - 56}" width="${W}" height="56" fill="${t.footerBg}"/>
  <text x="${pad}" y="${H - 24}" font-family="${font}" font-size="13"
        fill="${t.footerText && t.footerBg !== t.footerText ? t.footerText : mix(t.footerBg, '#808080', 0.75)}">
    © The Sample Store
  </text>
</svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  const outFlag = args.indexOf('--out');
  const wFlag = args.indexOf('--width');
  const outDir = outFlag > -1 ? path.resolve(args[outFlag + 1]) : null;
  const W = wFlag > -1 ? Number(args[wFlag + 1]) : 1280;

  const keys = fs
    .readdirSync(THEMES_DIR)
    .filter((k) => fs.existsSync(path.join(THEMES_DIR, k, 'theme.json')))
    .sort();

  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  for (const key of keys) {
    const theme = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, key, 'theme.json'), 'utf8'));
    const svg = buildSvg(theme, W);
    // Default destination is the theme's own directory, which is exactly the
    // path theme.json advertises and the API serves.
    const dest = outDir
      ? path.join(outDir, `${key}.png`)
      : path.join(THEMES_DIR, key, 'preview.png');
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(dest);
    console.log(`${key.padEnd(12)} -> ${path.relative(process.cwd(), dest)}`);
  }
}

// Only run when invoked directly. Guarding this means `require()`ing the
// module for its buildSvg() export (tests, other tooling) does not silently
// rewrite every theme's preview.png as an import side effect.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { buildSvg, FONT_STACKS, SHADOWS };
