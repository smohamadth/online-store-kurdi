// ---------------------------------------------------------------------------
// Storefront E2E — the customer-facing journey against the real stack.
//
// These exercise the actual server-rendered pages plus the client cart, so
// they catch regressions that the API-mock suites cannot (SSR metadata, the
// real product payload, localStorage cart sync, link wiring).
// ---------------------------------------------------------------------------
import { test, expect } from '@playwright/test';

test.describe('storefront', () => {
  test('home page renders the catalogue section', async ({ page }) => {
    await page.goto('/');
    // The home page is server-rendered; the catalogue heading must be present
    // without waiting on any client fetch.
    await expect(page.getByText('Featured Products').first()).toBeVisible();
  });

  test('a seeded product page renders its name and price', async ({ page }) => {
    await page.goto('/products/web-development-course');
    await expect(page.getByText('Web Development Course').first()).toBeVisible();
    await expect(page.getByTestId('current-price')).toContainText('49.99');
  });

  test('add a digital product to the cart and see it at checkout', async ({ page }) => {
    await page.goto('/products/web-development-course');

    const addButton = page.getByRole('button', { name: /Add to Cart/i }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    // The button flips to a confirmation state.
    await expect(page.getByText('✓ Added!').first()).toBeVisible({ timeout: 5000 });

    await page.goto('/cart');
    await expect(page.getByText(/Shopping Cart/i).first()).toBeVisible();
    await expect(page.getByText('Web Development Course')).toBeVisible();
  });

  test('a non-existent product returns a real 404', async ({ page }) => {
    const response = await page.goto('/products/definitely-not-a-real-product-slug');
    expect(response?.status()).toBe(404);
  });
});
