import { test, expect } from '@playwright/test';

/**
 * Read-only smoke that the data-heavy pages render after the refactors/perf changes
 * (inventory overview, orders list + departure board). A seeded row / the page
 * heading proves the route and its query path work in the real app.
 */
test('inventory overview lists a seeded variant', async ({ page }) => {
  await page.goto('/dashboard/inventory');
  await expect(page.getByRole('heading', { name: 'Inventaris' })).toBeVisible();
  await page.getByPlaceholder('Cari SKU atau varian...').fill('KAOS');
  // The list collapses to a (hidden-on-desktop) card list + a desktop table; scope to
  // the table so we assert the visible instance, not the hidden mobile card.
  await expect(page.getByRole('table').getByText('Kaos Polos Premium').first()).toBeVisible();
});

test('orders list and departure board render', async ({ page }) => {
  await page.goto('/dashboard/orders');
  await expect(page.getByRole('heading', { name: 'Pesanan' })).toBeVisible();
  await expect(page.getByText('Gagal memuat')).toHaveCount(0);

  await page.goto('/dashboard/orders/board');
  await expect(page.getByRole('heading', { name: 'Papan keberangkatan' })).toBeVisible();
  await expect(page.getByText('Gagal memuat')).toHaveCount(0);
});
