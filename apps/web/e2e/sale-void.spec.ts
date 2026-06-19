import { test, expect } from '@playwright/test';

/**
 * Void path: ring up a CASH sale, then cancel it from the sale detail. Exercises
 * voidSale end-to-end — the per-sale advisory lock + the restock of every line —
 * against the real DB. Self-contained and stock-neutral (the sale is immediately
 * voided), so it's safe to run repeatedly.
 */
test('voiding a sale marks it cancelled', async ({ page }) => {
  // 1. Ring up a sale and capture its code from the success toast.
  await page.goto('/dashboard/sales/new');
  await page.getByPlaceholder('Cari SKU atau nama produk...').fill('KAOS-HTM-L');
  await page.getByRole('button', { name: 'Tambah' }).first().click();
  await page.getByRole('button', { name: 'Bayar' }).click();

  const toast = page.getByText(/Penjualan\s+S\d+\s+tercatat/i);
  await expect(toast).toBeVisible();
  const code = (await toast.textContent())?.match(/S\d+/)?.[0];
  expect(code, 'sale code from toast').toBeTruthy();

  // 2. Open it from the sales list.
  await page.goto('/dashboard/sales');
  await page.getByRole('link', { name: code! }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/sales\/[^/]+$/);

  // 3. Cancel it (button is gated on status COMPLETED + the sales.refund permission,
  //    which the demo OWNER has). Confirm in the alert dialog.
  await page.getByRole('button', { name: 'Batalkan penjualan' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Batalkan penjualan' }).click();

  // 4. The sale now shows the cancelled badge.
  await expect(page.getByText('Dibatalkan')).toBeVisible();
});
