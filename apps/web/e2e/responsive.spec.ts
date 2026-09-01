// ---------------------------------------------------------------------------
// Responsive E2E — "different displays" check across phone / tablet / desktop.
//
// The storefront deliberately keeps <html> free of `overflow-x` so a too-wide
// child shows up as `documentElement.scrollWidth > clientWidth`, while <body>
// clips the scrollbar so shoppers aren't stuck (see app/globals.css). These
// specs assert no hidden horizontal overflow on the customer-facing pages that
// the Theme Studio builder can render (products, product detail). The per-block
// collapse decisions themselves are asserted in the jsdom unit suite
// (lib/layouts/render.test.tsx); this suite proves the real browser has no
// overflow at any of the three target widths.
// ---------------------------------------------------------------------------
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function overflowOf(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
}

for (const { name, width, height } of VIEWPORTS) {
  test.describe(`storefront at ${name} width (${width}px)`, () => {
    test.use({ viewport: { width, height } });

    test('home page has no horizontal overflow', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText('Featured Products').first()).toBeVisible();
      const overflow = await overflowOf(page);
      expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test('a product page has no horizontal overflow', async ({ page }) => {
      await page.goto('/products/web-development-course');
      await expect(page.getByText('Web Development Course').first()).toBeVisible();
      const overflow = await overflowOf(page);
      expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  });
}
