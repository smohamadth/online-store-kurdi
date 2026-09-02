// ---------------------------------------------------------------------------
// Admin E2E — the real login flow plus the admin shell, using the seeded
// admin account (admin@store.com / admin123). These verify that the admin
// auth guard (localStorage token + /auth/me role check) actually admits the
// admin and that key admin surfaces render.
// ---------------------------------------------------------------------------
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@store.com';
const ADMIN_PASSWORD = 'admin123';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Successful login redirects home and stores the token + user.
  await expect(page).toHaveURL(/\/$/);
}

test.describe('admin', () => {
  test('an admin can log in and reach the dashboard', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin');
    // The admin layout must admit an admin (it calls /auth/me) and render
    // the dashboard's stat cards.
    await expect(page.getByText('Recent Orders').first()).toBeVisible();
    await expect(page.getByText('Total Products').first()).toBeVisible();
  });

  test('admin sidebar exposes inventory and shipping', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');

    await expect(page.getByRole('link', { name: /Inventory/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Shipping/i }).first()).toBeVisible();

    // A customer-only account must not pass the admin auth guard.
  });

  test('a customer cannot access the admin panel', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'customer@example.com');
    await page.fill('input[type="password"]', 'customer123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/$/);

    // Navigating to /admin with a customer token bounces the user away
    // (either to /login or back to the storefront).
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/\/admin$/);
  });
});
