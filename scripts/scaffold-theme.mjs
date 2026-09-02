#!/usr/bin/env node
/**
 * scaffold-theme — add a new theme to the store builder in one command.
 *
 * Usage:
 *   node scripts/scaffold-theme.mjs <key> [--name "Theme Name"]
 *
 * Example:
 *   node scripts/scaffold-theme.mjs solar --name "Solar"
 *
 * The registry docs (THEME_SYSTEM_PLAN.md) list the touch points for a
 * new theme; this script performs all of them:
 *
 *   1. apps/web/themes/<key>/theme.json          (valid vs themeConfigSchema)
 *      + .bundled marker (platform theme flag) + README.md
 *   2. apps/web/themes/<key>/sections/{Hero,Featured,Categories}.tsx
 *      (contract-compliant, RTL-safe: no physical CSS properties)
 *   3. lib/themeRegistry.ts                      (import + THEMES entry)
 *   4. lib/themeSections.tsx                     (imports + component map)
 *   5. lib/theme-rtl.test.tsx                    (SECTION_MATRIX entry -
 *      the RTL sync test fails at build time if this is forgotten)
 *   6. app/admin/appearance/ThemePicker.test.tsx (pinned card count +1)
 *
 * What it does NOT do:
 *   - Generate the preview image (public/themes/<key>/preview.png).
 *     The admin gallery shows a placeholder until you add one.
 *   - Commit. Review the scaffold, tweak the tokens, run the tests,
 *     then commit.
 *
 * Idempotent: refuses to overwrite an existing theme key.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web');

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length < 1 || args.includes('-h') || args.includes('--help')) {
  console.log('Usage: node scripts/scaffold-theme.mjs <key> [--name "Theme Name"]');
  console.log('Example: node scripts/scaffold-theme.mjs solar --name "Solar"');
  process.exit(args.length < 1 ? 1 : 0);
}

const key = args[0];
const nameIdx = args.indexOf('--name');
const name = nameIdx >= 0 ? args[nameIdx + 1] : key
  .split(/[-_]/)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ');

// Match the schema's key regex: /^[a-z0-9][a-z0-9-_]*$/
if (!/^[a-z0-9][a-z0-9-_]*$/.test(key) || key.length > 40) {
  console.error(`x invalid theme key "${key}" - use lowercase a-z, 0-9, "-" or "_" (max 40 chars)`);
  process.exit(1);
}
if (key === 'default') {
  console.error('x "default" is reserved as the platform fallback theme');
  process.exit(1);
}

const themeDir = join(root, 'themes', key);
if (existsSync(themeDir)) {
  console.error(`x theme "${key}" already exists at apps/web/themes/${key}`);
  process.exit(1);
}

const Pascal = key
  .split(/[-_]/)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join('');

mkdirSync(join(themeDir, 'sections'), { recursive: true });

console.log(`==> scaffolding theme "${key}" (${name})`);

// ---------------------------------------------------------------------------
// 1. theme.json
// ---------------------------------------------------------------------------
const themeJson = {
  key,
  name,
  description: `A ${name} theme for the store builder. Edit this description to tell merchants what the theme is for.`,
  version: '1.0.0',
  author: 'Store Builder Platform',
  preview: `/themes/${key}/preview.png`,
  features: { rtl: true, darkMode: false, paid: false },
  // Adjust these tokens to define the theme's identity. The section
  // components below read them via CSS variables, so changing a token
  // restyles the whole theme.
  tokens: {
    primaryColor: '#111111',
    primaryTextColor: '#ffffff',
    accentColor: '#2563eb',
    bodyBg: '#ffffff',
    cardBg: '#ffffff',
    bodyText: '#111111',
    mutedText: '#6b7280',
    borderColor: '#e5e7eb',
    headerBg: '#ffffff',
    headerText: '#111111',
    footerBg: '#111111',
    footerText: '#ffffff',
    priceColor: '#111111',
    saleColor: '#dc2626',
    fontFamily: 'system',
    baseFontSize: 16,
    headingWeight: 700,
    radius: 8,
    buttonRadius: 8,
    containerWidth: 1200,
    cardShadow: 'soft',
    productsPerRow: 4,
    showTrustBar: true,
    showTestimonials: false,
    showStats: false,
    showNewsletter: true,
    showDealCountdown: false,
    showCategories: true,
    showFeatured: true,
    showNewArrivals: false,
    announcementBg: '#111111',
    announcementText2: '#ffffff',
  },
  sections: {
    hero: `@/themes/${key}/sections/Hero`,
    featured: `@/themes/${key}/sections/Featured`,
    categories: `@/themes/${key}/sections/Categories`,
  },
};
writeFileSync(join(themeDir, 'theme.json'), JSON.stringify(themeJson, null, 2) + '\n');
console.log(`    wrote themes/${key}/theme.json`);

// 1b. bundled marker + README. The `.bundled` marker is what tells the API
//     this theme is part of the platform release (not overwritable by an
//     install, not deletable by an admin). The README is shown to merchants
//     when the theme ships as a package (docs/THEME_DEVELOPMENT.md §1).
writeFileSync(
  join(themeDir, '.bundled'),
  `Platform-bundled theme. This marker tells the API that "${key}" is part of the platform release: it cannot be overwritten by an install or removed by an admin.\n`
);
console.log(`    wrote themes/${key}/.bundled (platform theme marker)`);
writeFileSync(
  join(themeDir, 'README.md'),
  `# ${name}\n\n${themeJson.description}\n\n## Tokens\n\nAdjust the design tokens in \`theme.json\` to define the theme's identity; the\nsection components read them via CSS variables.\n\n## Sections\n\nThis bundled theme ships custom \`sections/\` components (build-time only). To\nhand the theme to a store as an installable package, run:\n\n    npm run theme:pack -- ${key}\n\nSee docs/THEME_DEVELOPMENT.md for the full developer guide.\n`
);
console.log(`    wrote themes/${key}/README.md`);

// ---------------------------------------------------------------------------
// 2. section components
//    IMPORTANT (RTL): use only LOGICAL CSS properties in inline styles
//    (marginInline, paddingInline, insetInlineStart, textAlign: start).
//    The theme-rtl ratchet test fails the build on physical properties.
// ---------------------------------------------------------------------------
const sections = {
  Hero: `/**
 * ${name} theme — Hero section.
 *
 * SCAFFOLDED by scripts/scaffold-theme.mjs. Replace the body with the
 * theme's actual hero design. Keep the contract:
 *   - 'use client' + default export receiving SectionProps
 *   - data-section="hero" on the root element
 *   - only LOGICAL css properties (the theme-rtl ratchet test
 *     fails the build on left/right/marginLeft/... inline styles)
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import type { SectionProps } from '@/lib/themeSections';

export default function ${Pascal}Hero({ title, subtitle, banners }: SectionProps) {
  const theme = useTheme();
  const banner = banners?.[0];

  return (
    <section
      data-section="hero"
      data-theme={theme.activeTheme}
      style={{
        backgroundColor: 'var(--body-bg, #ffffff)',
        color: 'var(--body-text, #111111)',
        padding: 'clamp(48px, 8vw, 96px) 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto' }}>
        {banner?.badge && (
          <span
            style={{
              display: 'inline-block',
              padding: '6px 14px',
              borderRadius: 999,
              backgroundColor: 'var(--accent, #2563eb)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '24px',
            }}
          >
            {banner.badge}
          </span>
        )}
        <h1
          style={{
            fontSize: 'clamp(30px, 5vw, 52px)',
            lineHeight: 1.1,
            fontWeight: 'var(--heading-weight, 700)',
            margin: 0,
          }}
        >
          {banner?.title || title || 'Your store, your style'}
        </h1>
        {(banner?.subtitle || subtitle) && (
          <p
            style={{
              fontSize: '17px',
              lineHeight: 1.6,
              color: 'var(--muted, #6b7280)',
              margin: '20px auto 0',
              maxWidth: '560px',
            }}
          >
            {banner?.subtitle || subtitle}
          </p>
        )}
        <Link
          href={banner?.linkUrl || '/products'}
          style={{
            display: 'inline-block',
            marginTop: '32px',
            padding: '14px 32px',
            backgroundColor: 'var(--primary, #111111)',
            color: 'var(--primary-text, #ffffff)',
            fontSize: '15px',
            fontWeight: 600,
            textDecoration: 'none',
            borderRadius: 'var(--button-radius, 8px)',
          }}
        >
          {banner?.buttonText || 'Shop now'}
        </Link>
      </div>
    </section>
  );
}
`,
  Featured: `/**
 * ${name} theme — Featured products section.
 * SCAFFOLDED by scripts/scaffold-theme.mjs. Replace with the theme's
 * actual product grid design (same contract notes as Hero).
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function ${Pascal}Featured({ title, subtitle, products, config }: SectionProps) {
  const theme = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      style={{
        backgroundColor: 'var(--body-bg, #ffffff)',
        padding: '64px 24px',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto' }}>
        {title && (
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 30px)',
              fontWeight: 'var(--heading-weight, 700)',
              margin: '0 0 8px',
            }}
          >
            {title}
          </h2>
        )}
        {subtitle && (
          <p style={{ fontSize: '16px', color: 'var(--muted, #6b7280)', margin: '0 0 32px' }}>
            {subtitle}
          </p>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '24px',
          }}
        >
          {list.map((product) => {
            const image = product.images?.[0];
            return (
              <Link
                key={product.id}
                href={\`/products/\${product.slug}\`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'var(--body-text, #111111)',
                  backgroundColor: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: 'var(--radius, 8px)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    aspectRatio: '1 / 1',
                    backgroundColor: '#f3f4f6',
                    backgroundImage: image ? \`url(\${getImageUrl(image.url)})\` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div style={{ padding: '16px' }}>
                  <p style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>{product.name}</p>
                  <p
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--price, #111111)',
                      margin: '8px 0 0',
                    }}
                  >
                    {formatPrice(product.price, settings.currencySymbol)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
`,
  Categories: `/**
 * ${name} theme — Categories section.
 * SCAFFOLDED by scripts/scaffold-theme.mjs. Replace with the theme's
 * actual category design (same contract notes as Hero).
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import type { SectionProps } from '@/lib/themeSections';

export default function ${Pascal}Categories({ title, categories }: SectionProps) {
  const theme = useTheme();
  const list = categories ?? [];

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      style={{
        backgroundColor: 'var(--body-bg, #ffffff)',
        borderTop: '1px solid var(--border, #e5e7eb)',
        padding: '64px 24px',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto' }}>
        {title && (
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 30px)',
              fontWeight: 'var(--heading-weight, 700)',
              margin: '0 0 32px',
              textAlign: 'center',
            }}
          >
            {title}
          </h2>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
          }}
        >
          {list.map((category) => (
            <Link
              key={category.slug}
              href={\`/category/\${category.slug}\`}
              style={{
                display: 'block',
                textDecoration: 'none',
                padding: '24px 20px',
                textAlign: 'center',
                color: 'var(--body-text, #111111)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 'var(--radius, 8px)',
                backgroundColor: 'var(--card-bg, #ffffff)',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>{category.emoji || '🛍️'}</div>
              <p style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{category.name}</p>
              {typeof category.count === 'number' && (
                <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: '6px 0 0' }}>
                  {category.count} products
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

for (const [file, content] of Object.entries(sections)) {
  writeFileSync(join(themeDir, 'sections', `${file}.tsx`), content);
  console.log(`    wrote themes/${key}/sections/${file}.tsx`);
}

// ---------------------------------------------------------------------------
// 3-5. patch the three source files at their known anchors.
//      Each anchor is asserted: if the platform files were restructured,
//      the script fails loudly instead of half-patching.
// ---------------------------------------------------------------------------
function patch(file, anchor, insertion, label) {
  const path = join(root, file);
  const s = readFileSync(path, 'utf8');
  if (s.includes(anchor)) {
    if (s.includes(insertion)) {
      console.log(`    ${label}: already patched - skipping`);
      return;
    }
    writeFileSync(path, s.replace(anchor, anchor + '\n' + insertion, 1));
    console.log(`    patched ${file} (${label})`);
  } else {
    console.error(`x anchor not found in ${file} - the platform file was restructured. Patch it by hand:\n${anchor}`);
    process.exit(1);
  }
}

patch(
  'lib/themeRegistry.ts',
  `import boldThemeJson from '@/themes/bold/theme.json';`,
  `import ${key}ThemeJson from '@/themes/${key}/theme.json';`,
  'registry import'
);
patch(
  'lib/themeRegistry.ts',
  `  parseTheme(boldThemeJson, 'bold'),`,
  `  parseTheme(${key}ThemeJson, '${key}'),`,
  'registry THEMES entry'
);

patch(
  'lib/themeSections.tsx',
  `import BoldCategories from '@/themes/bold/sections/Categories';`,
  [
    `import ${Pascal}Hero from '@/themes/${key}/sections/Hero';`,
    `import ${Pascal}Featured from '@/themes/${key}/sections/Featured';`,
    `import ${Pascal}Categories from '@/themes/${key}/sections/Categories';`,
  ].join('\n'),
  'sections imports'
);
patch(
  'lib/themeSections.tsx',
  `  'bold/categories': BoldCategories,`,
  [
    `  // ${name} theme overrides.`,
    `  '${key}/hero': ${Pascal}Hero,`,
    `  '${key}/featured': ${Pascal}Featured,`,
    `  '${key}/categories': ${Pascal}Categories,`,
  ].join('\n'),
  'sections component map'
);

patch(
  'lib/theme-rtl.test.tsx',
  `  bold: { hero: BoldHero, featured: BoldFeatured, categories: BoldCategories },`,
  `  ${key}: { hero: ${Pascal}Hero, featured: ${Pascal}Featured, categories: ${Pascal}Categories },`,
  'rtl test matrix'
);
patch(
  'lib/theme-rtl.test.tsx',
  `import BoldCategories from '@/themes/bold/sections/Categories';`,
  [
    `import ${Pascal}Hero from '@/themes/${key}/sections/Hero';`,
    `import ${Pascal}Featured from '@/themes/${key}/sections/Featured';`,
    `import ${Pascal}Categories from '@/themes/${key}/sections/Categories';`,
  ].join('\n'),
  'rtl test imports'
);

// 6. The ThemePicker test pins the card count so a theme added/removed
//    without updating the gallery is caught. Bump it by one.
{
  const file = 'app/admin/appearance/ThemePicker.test.tsx';
  const path = join(root, file);
  const s = readFileSync(path, 'utf8');
  const m = s.match(/expect\(cards\)\.toHaveLength\((\d+)\)/);
  if (m) {
    writeFileSync(path, s.replace(m[0], `expect(cards).toHaveLength(${Number(m[1]) + 1})`));
    console.log(`    patched ${file} (card count ${m[1]} -> ${Number(m[1]) + 1})`);
  } else {
    console.error(`x could not find the pinned card count in ${file} - update it by hand`);
    process.exit(1);
  }
}

console.log(`
==> done. Next steps:
    1. Edit apps/web/themes/${key}/theme.json tokens to define the theme's identity
    2. Replace the scaffolded section bodies with the real design
    3. Add a preview image: apps/web/public/themes/${key}/preview.png
       (the admin gallery shows a placeholder until then)
    4. Run: cd apps/web && npx vitest run --config vitest.components.config.ts
    5. Commit
`);
