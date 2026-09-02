// DevelopersPage — the in-app developer reference (/developers).
//
// Built to be LIVE from code wherever possible:
//   - the HTTP endpoint catalog is rendered from GET /api/developers
//     (the manifest module in apps/api is the single source of truth),
//   - the hero design contract is rendered from the actual exported
//     constants + normaliser in apps/web/lib/heroOptions.ts,
//   - the home section types come from lib/homeSections,
//   - the bundled themes come from the theme registry.
//
// The page is deliberately styled with its own fixed tokens instead of
// the active store theme, so it reads the same under every theme.

'use client';

import { HERO_DEFAULTS, HERO_HEIGHT_PX, HERO_LAYOUTS } from '@/lib/heroOptions';
import { TYPE_LABELS } from '@/lib/homeSections';
import { THEMES } from '@/lib/themeRegistry';
import BootstrapCard from './BootstrapCard';
import EndpointCatalog from './EndpointCatalog';
import HeroOptionsDemo from './HeroOptionsDemo';
import { C, CodeBlock, H2, P, Pill } from './ui';

const themeShape = (t: { key: string; name?: string; description?: string; sections?: Record<string, string> }) => t;

const sectionProps: Array<{ name: string; type: string; description: string }> = [
  { name: 'title', type: 'string | null', description: 'Section heading (from the home row’s title).' },
  { name: 'subtitle', type: 'string | null', description: 'Section subheading (from the home row’s subtitle).' },
  { name: 'banners', type: 'Banner[]', description: 'Active hero banners, already filtered by the API (hero section only).' },
  {
    name: 'products',
    type: 'Array<{ id, name, slug, price, compareAtPrice?, averageRating?, reviewCount?, images?, category? }>',
    description: 'Featured products with the fields a product tile needs (featured section only).',
  },
  {
    name: 'categories',
    type: 'Array<{ name, slug, emoji?, count?, image? }>',
    description: 'Category list with product counts (categories section only).',
  },
  {
    name: 'config',
    type: 'Record<string, unknown>',
    description: 'The home row’s design config — the per-section contract. The hero block reads config.hero (see below).',
  },
];

export default function DevelopersPage() {
  return (
    <div style={{ backgroundColor: C.pageBg, minHeight: '100vh' }}>
      {/* Hero band */}
      <header
        style={{
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          padding: '44px 20px 40px',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Pill tone="accent">Public HTTP API</Pill>
            <Pill tone="accent">Theme sections</Pill>
            <Pill tone="accent">Home design config</Pill>
          </div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Developer reference
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', maxWidth: 720 }}>
            Build a headless storefront, a mobile app, or your own theme sections against this
            store’s API. Everything below is rendered live from the running code — the endpoint
            list comes from the API itself, and the design options from the actual modules the
            storefront uses.
          </p>
          <nav aria-label="On this page" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            {[
              ['#quickstart', 'Quick start'],
              ['#http-api', 'HTTP API'],
              ['#flows', 'Examples'],
              ['#bootstrap', 'Bootstrap'],
              ['#hero-config', 'Hero design'],
              ['#section-types', 'Section types'],
              ['#theme-contract', 'Theme contract'],
              ['#conventions', 'Conventions'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: '#e2e8f0',
                  textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 999,
                  padding: '5px 13px',
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '8px 20px 80px' }}>
        {/* ------------------------------------------------ quick start */}
        <H2 id="quickstart">Quick start</H2>
        <P>
          All endpoints live under <code style={{ fontFamily: C.mono }}>/api</code> on your store
          origin (in development the Next.js dev server proxies <code style={{ fontFamily: C.mono }}>/api/*</code>{' '}
          to the API on <code style={{ fontFamily: C.mono }}>:3001</code>). Every response uses the
          same envelope — <code style={{ fontFamily: C.mono }}>{'{ status: "success", data }'}</code>{' '}
          — and errors add <code style={{ fontFamily: C.mono }}>message</code> and{' '}
          <code style={{ fontFamily: C.mono }}>code</code> fields.
        </P>
        <CodeBlock
          label="curl — public read, no token"
          code={`# Store settings (name, currency, socials, payment flags)
curl https://your-store.example/api/settings

# The home page layout, including each block's design config
curl https://your-store.example/api/home-sections

# Active banners for the hero/promo/strip placements
curl "https://your-store.example/api/banners?position=hero"
`}
        />
        <CodeBlock
          label="curl — sign in and call a customer endpoint"
          code={`# 1) Sign in -> { accessToken, refreshToken, user }
curl -X POST https://your-store.example/api/auth/login \\
  -H 'content-type: application/json' \\
  -d '{"email":"customer@example.com","password":"secret"}'

# 2) Use the access token for account-scoped calls
curl https://your-store.example/api/cart \\
  -H "Authorization: Bearer $ACCESS_TOKEN"
`}
        />
        <CodeBlock
          label="JavaScript (any framework)"
          code={`const base = "https://your-store.example/api";

export async function api(path, { token, ...init } = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: \`Bearer \${token}\` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || \`HTTP \${res.status}\`);
  return body.data; // { status, data } envelope unwrapped
}

const settings = await api("/settings");
const banners  = await api("/banners?position=hero");
`}
        />

        {/* ------------------------------------------------ http api */}
        <H2 id="http-api">HTTP API reference</H2>
        <P>
          The catalog is generated from <code style={{ fontFamily: C.mono }}>GET /api/developers</code>,
          which lists every documented public endpoint served by this API instance. Expand a row
          for parameters, then hit <strong>Try it</strong> to fire the real request from your
          browser.
        </P>
        <EndpointCatalog />

        {/* ------------------------------------------------ flows */}
        <H2 id="flows">End-to-end examples</H2>
        <P>
          Copy-paste flows that put the pieces together. Every endpoint row above also ships its
          own generated <strong>cURL / JavaScript / Python</strong> example — expand any row to
          copy it. Replace <code style={{ fontFamily: C.mono }}>your-store.example</code> with
          your store domain.
        </P>

        <CodeBlock
          label="Headless homepage — bootstrap + catalog rows (JavaScript)"
          code={`// 1. One call for the shell: settings, home layout (with each
//    block's design config), banners, categories, menus
const shell = await fetch("https://your-store.example/api/developers/bootstrap")
  .then((r) => r.json())
  .then((b) => b.data);

// 2. The catalog rows your layout asks for
const featured = await fetch("https://your-store.example/api/products/featured?limit=8")
  .then((r) => r.json())
  .then((b) => b.data);

// 3. Render the sections in order. The hero row tells you which
//    design the merchant picked:
const heroRow = shell.sections.find((s) => s.type === "hero");
// heroRow.config.hero -> { layout: "split", height: "tall", ... }
console.log(shell.settings.storeName, heroRow.config.hero, featured.length);
`}
        />

        <CodeBlock
          label="Sign in and add to cart (JavaScript)"
          code={`// 1. Sign in -> data.accessToken (keep it; refresh with /api/auth/refresh)
const login = await fetch("https://your-store.example/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "customer@example.com", password: "your-password" }),
}).then((r) => r.json());
const token = login.data.accessToken;

// 2. Add to the customer's cart with the bearer token
const add = await fetch("https://your-store.example/api/cart", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + token },
  body: JSON.stringify({ productId: "<product-id>", quantity: 1 }),
}).then((r) => r.json());
console.log(add.data.items);
`}
        />

        <CodeBlock
          label="Checkout estimates — coupon + shipping before the order (Python)"
          code={`import requests

base = "https://your-store.example/api"

# Advisory coupon check (order placement re-validates server-side)
coupon = requests.post(
    base + "/api/coupons/validate",
    json={"code": "SAVE10", "subtotal": 120},
).json()
print("coupon valid:", coupon["data"]["valid"])

# Shipping method estimate for the destination
shipping = requests.post(
    base + "/api/shipping/calculate",
    json={"country": "US", "state": "CA", "zipCode": "90001", "subtotal": 120},
).json()
for method in shipping["data"]:
    print(method["name"], method.get("rate"))

# Place the order with the customer token (POST /api/orders)
`}
        />
        <P>
          Want more? The account-area flows work the same way: browse
          <code style={{ fontFamily: C.mono }}> Customer</code> and{' '}
          <code style={{ fontFamily: C.mono }}>Recommendations</code> entries in the catalog above
          and copy their generated examples.
        </P>

        {/* ------------------------------------------------ bootstrap */}
        <H2 id="bootstrap">One-call storefront bootstrap</H2>
        <P>
          A headless home page needs store settings, the home layout (with each block’s design
          config), banners, categories and the header/footer menus. Fetching them all is five
          round trips; <code style={{ fontFamily: C.mono }}>GET /api/developers/bootstrap</code>{' '}
          returns the same data in one. Each member mirrors its individual public endpoint, so the
          bundle never shows anything the storefront itself would not render.
        </P>
        <BootstrapCard />
        <CodeBlock
          label="response shape — data"
          code={`{
  "settings":    { "storeName": "...", "currency": "USD", /* … */ },
  "sections":    [ { "id": "...", "type": "hero", "title": null,
                     "config": { "hero": { "layout": "slideshow", /* … */ } } },
                   /* … in render order */ ],
  "banners":     [ /* active banners, sorted */ ],
  "categories":  [ { "name": "Clothing", "slug": "clothing", /* counts */ } ],
  "menus":       { "header": { /* menu + nested items */ } | null,
                   "footer": { /* … */ } | null }
}`}
        />

        {/* ------------------------------------------------ hero config */}
        <H2 id="hero-config">Home layout &amp; hero design options</H2>
        <P>
          Home rows are stored by <code style={{ fontFamily: C.mono }}>GET /api/home-sections</code>.
          Each row’s <code style={{ fontFamily: C.mono }}>config</code> object is the design
          contract for that block. The hero block reads <code style={{ fontFamily: C.mono }}>config.hero</code> —
          set it from the admin Home builder or directly via the API, and the platform hero (and
          the default theme) renders it.
        </P>
        <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0 4px' }}>
          <thead>
            <tr>
              {['Key', 'Type', 'Default', 'Meaning'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'start',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: C.faint,
                    padding: '6px 10px',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>layout</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{HERO_LAYOUTS.join(' · ')}</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{HERO_DEFAULTS.layout}</code></td>
              <td style={{ padding: '6px 10px', fontSize: 12.5, color: C.muted }}>
                slideshow rotates through the active banners; single and split show the first
                banner only, with no motion chrome.
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>height</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{Object.keys(HERO_HEIGHT_PX).join(' · ')}</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{HERO_DEFAULTS.height}</code></td>
              <td style={{ padding: '6px 10px', fontSize: 12.5, color: C.muted }}>
                Desktop band heights:{' '}
                {Object.entries(HERO_HEIGHT_PX)
                  .map(([k, v]) => `${k} ${v.desktop}px`)
                  .join(', ')}{' '}
                (mobile scales down automatically).
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>autoPlay</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>boolean</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{String(HERO_DEFAULTS.autoPlay)}</code></td>
              <td style={{ padding: '6px 10px', fontSize: 12.5, color: C.muted }}>Autoplay the slideshow. Only meaningful for the slideshow layout.</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>intervalSec</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>number</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{HERO_DEFAULTS.autoPlayMs / 1000}</code></td>
              <td style={{ padding: '6px 10px', fontSize: 12.5, color: C.muted }}>Seconds between slides, clamped to 3–10. Stored as ms internally (autoPlayMs).</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>arrows</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>boolean</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{String(HERO_DEFAULTS.showArrows)}</code></td>
              <td style={{ padding: '6px 10px', fontSize: 12.5, color: C.muted }}>Prev/next arrows (desktop). Forced off unless layout is slideshow.</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>dots</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>boolean</code></td>
              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: C.mono, fontSize: 12 }}>{String(HERO_DEFAULTS.showDots)}</code></td>
              <td style={{ padding: '6px 10px', fontSize: 12.5, color: C.muted }}>Slide indicator dots. Forced off unless layout is slideshow.</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock
          label="example — a split hero at tall height via the API"
          code={`PUT /api/home-sections/:id
{ "config": {
    "hero": { "layout": "split", "height": "tall" }
  } }
`}
        />
        <P>
          Any missing or invalid key falls back per-key to the defaults above, so a row written
          without a <code style={{ fontFamily: C.mono }}>hero</code> block keeps the classic
          slideshow. Try it — this demo runs the storefront’s own normaliser:
        </P>
        <HeroOptionsDemo />

        {/* ------------------------------------------------ section types */}
        <H2 id="section-types">Home section types</H2>
        <P>
          The home page is a list of rows; each row has a <code style={{ fontFamily: C.mono }}>type</code>{' '}
          from the set below (labels shown are the admin UI’s). Themes can override the
          <em> hero</em>, <em>featured</em> and <em>categories</em> renderers; the other types are
          rendered by the platform and carry their own config keys.
        </P>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 4px' }}>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <span
              key={key}
              style={{
                border: `1px solid ${C.border}`,
                backgroundColor: C.cardBg,
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12.5,
                color: C.ink,
              }}
            >
              <code style={{ fontFamily: C.mono, fontWeight: 700 }}>{key}</code>{' '}
              <span style={{ color: C.muted }}>— {label}</span>
            </span>
          ))}
        </div>

        {/* ------------------------------------------------ themes */}
        <H2 id="theme-contract">Themes &amp; the section contract</H2>
        <P>
          A theme ships tokens + optional section overrides. A section component receives one
          props bag (<code style={{ fontFamily: C.mono }}>SectionProps</code>) with the fields
          below; sections that need theme tokens call <code style={{ fontFamily: C.mono }}>useTheme()</code>{' '}
          themselves. Resolution order: the active theme’s <code style={{ fontFamily: C.mono }}>theme.json</code>{' '}
          <code style={{ fontFamily: C.mono }}>sections</code> map wins; otherwise the platform
          renderer is used. Full authoring guide: <code style={{ fontFamily: C.mono }}>docs/THEME_DEVELOPMENT.md</code>.
        </P>
        <CodeBlock
          label="A custom section — themes/acme/sections/Hero.tsx"
          code={`'use client';
import Link from 'next/link';
import type { SectionProps } from '@/lib/themeSections';

// A section override receives one props bag (see the table below).
// Data comes from the home page; design tokens come from CSS variables
// set by the theme (--brand, --body-bg, --body-text, --muted, ...).
export default function AcmeHero({ banners }: SectionProps) {
  const banner = banners?.[0];
  if (!banner) return null;
  return (
    <section data-section="hero" style={{ padding: '48px 20px' }}>
      <h1 style={{ color: 'var(--body-text, #111)', fontSize: 40 }}>{banner.title}</h1>
      {banner.description && (
        <p style={{ color: 'var(--muted, #666)' }}>{banner.description}</p>
      )}
      <Link
        href={banner.linkUrl || '/products'}
        style={{
          background: 'var(--brand, #111)',
          color: 'var(--brand-text, #fff)',
          padding: '12px 22px',
          borderRadius: 'var(--btn-radius, 8px)',
        }}
      >
        {banner.buttonText || 'Shop now'}
      </Link>
    </section>
  );
}
`}
        />
        <CodeBlock
          label="and register it in the theme's theme.json"
          code={`{
  "key": "acme",
  "name": "Acme",
  "description": "My first theme.",
  "sections": { "hero": "@/themes/acme/sections/Hero" }
}
`}
        />
        <P>
          Add the override to the static import map in{' '}
          <code style={{ fontFamily: C.mono }}>apps/web/lib/themeSections.tsx</code> and the theme
          registry (<code style={{ fontFamily: C.mono }}>apps/web/lib/themeRegistry.ts</code>) for
          bundled themes — details in <code style={{ fontFamily: C.mono }}>docs/THEME_DEVELOPMENT.md</code>.
        </P>

        <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0 4px' }}>
          <thead>
            <tr>
              {['Prop', 'Type', 'Description'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'start',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: C.faint,
                    padding: '6px 10px',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectionProps.map((p) => (
              <tr key={p.name}>
                <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                  <code style={{ fontFamily: C.mono, fontSize: 12 }}>{p.name}</code>
                </td>
                <td style={{ padding: '6px 10px', verticalAlign: 'top', fontSize: 11.5, color: C.muted, fontFamily: C.mono }}>
                  {p.type}
                </td>
                <td style={{ padding: '6px 10px', verticalAlign: 'top', fontSize: 12.5, color: C.muted }}>
                  {p.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <P>
          Bundled themes in this build (from the theme registry): the platform hero is
          theme-independent, while Bold, Dawnlight, Minimal and Pulse ship their own hero /
          featured / categories components.
        </P>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
          {THEMES.map((raw) => {
            const t = themeShape(raw as never);
            return (
              <div
                key={t.key}
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  backgroundColor: C.cardBg,
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <code style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 800, color: C.ink }}>
                    {t.key}
                  </code>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{t.name}</span>
                  {t.sections?.hero ? (
                    <Pill tone="accent">own hero</Pill>
                  ) : (
                    <Pill>platform hero</Pill>
                  )}
                </div>
                {t.description && (
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6, color: C.muted }}>
                    {t.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------ conventions */}
        <H2 id="conventions">Conventions &amp; limits</H2>
        <ul style={{ fontSize: 14, lineHeight: 1.8, color: C.muted, paddingInlineStart: 20, margin: '8px 0' }}>
          <li>
            <strong>Envelope:</strong> success is{' '}
            <code style={{ fontFamily: C.mono }}>{'{ status: "success", data }'}</code>; errors are{' '}
            <code style={{ fontFamily: C.mono }}>{'{ status: "error", message, code? }'}</code> with
            a matching HTTP status (400 validation, 401 unauthenticated, 403 forbidden, 404 not
            found, 409 conflict).
          </li>
          <li>
            <strong>Auth:</strong> send{' '}
            <code style={{ fontFamily: C.mono }}>Authorization: Bearer &lt;accessToken&gt;</code>.
            Customer tokens unlock the Customer group; admin endpoints require an admin/manager
            token and are intentionally not documented here.
          </li>
          <li>
            <strong>Localisation:</strong> endpoints with localisable content accept{' '}
            <code style={{ fontFamily: C.mono }}>?lang=</code> (e.g. <code style={{ fontFamily: C.mono }}>en</code>,{' '}
            <code style={{ fontFamily: C.mono }}>ku</code>, <code style={{ fontFamily: C.mono }}>ar</code>) and fall
            back to the store default language.
          </li>
          <li>
            <strong>Media:</strong> banner/product image fields are paths; resolve them against the
            API origin. In the storefront app the helper <code style={{ fontFamily: C.mono }}>getImageUrl()</code>{' '}
            does exactly this.
          </li>
          <li>
            <strong>Rate limits:</strong> the API applies a global rate limiter under{' '}
            <code style={{ fontFamily: C.mono }}>/api</code>; back off on 429 and honour{' '}
            <code style={{ fontFamily: C.mono }}>Retry-After</code>.
          </li>
        </ul>
      </main>
    </div>
  );
}
