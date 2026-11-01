const { test, expect } = require('@playwright/test');

test.describe('Hesyra Labs — Custom QR & Packaging Label Studio', () => {

  test('qr.html loads cleanly with header, controls and live preview', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const res = await page.goto('/qr.html');
    expect(res.status()).toBe(200);
    expect(consoleErrors).toEqual([]);

    await expect(page).toHaveTitle(/Custom QR & Packaging Label Studio/);
    await expect(page.locator('#input-crown-id')).toHaveValue('ZIR-4510');
    await expect(page.locator('#box-qr-slot-50x30 svg')).toBeVisible();
    await expect(page.locator('#box-qr-slot-50x30 svg image')).toBeVisible();
    await expect(page.locator('#prev-id-50x30')).toHaveText('ZIR-4510');
  });

  test('query parameter ?id= pre-fills Crown ID and encodes deep-link URL', async ({ page }) => {
    await page.goto('/qr.html?id=CER-8942');
    await expect(page.locator('#input-crown-id')).toHaveValue('CER-8942');
    await expect(page.locator('#label-target-url')).toContainText('?id=CER-8942');
    await expect(page.locator('#prev-id-50x30')).toHaveText('CER-8942');
    await expect(page.locator('#btn-test-link')).toHaveAttribute('href', /id=CER-8942/);
  });

  test('typing a custom ID updates preview and test link in real time', async ({ page }) => {
    await page.goto('/qr.html');
    await page.locator('#input-crown-id').fill('EMX-9000');
    await expect(page.locator('#prev-id-50x30')).toHaveText('EMX-9000');
    await expect(page.locator('#label-target-url')).toContainText('?id=EMX-9000');
  });

  test('switching label format updates active preview container', async ({ page }) => {
    await page.goto('/qr.html');

    // Default 50x30 visible
    await expect(page.locator('#sticker-preview-50x30')).toBeVisible();
    await expect(page.locator('#sticker-preview-40x40')).toBeHidden();

    // Switch to 40x40 Square
    await page.locator('.format-pill[data-format="40x40"]').click();
    await expect(page.locator('#sticker-preview-40x40')).toBeVisible();
    await expect(page.locator('#sticker-preview-50x30')).toBeHidden();

    // Switch to Credit Card / Cert format
    await page.locator('.format-pill[data-format="card"]').click();
    await expect(page.locator('#sticker-preview-card')).toBeVisible();

    // Switch to Clean QR Only
    await page.locator('.format-pill[data-format="qr-only"]').click();
    await expect(page.locator('#sticker-preview-qr-only')).toBeVisible();
  });

  test('batch generator renders a printable multi-sticker sheet', async ({ page }) => {
    await page.goto('/qr.html');
    await page.locator('#tab-batch').click();

    await expect(page.locator('#panel-batch')).toBeVisible();
    await expect(page.locator('#batch-preview-container')).toBeVisible();

    // Default batch has 3 IDs: ZIR-4510, CER-8942, EMX-1001
    const stickers = page.locator('#batch-grid .dental-sticker-50x30');
    await expect(stickers).toHaveCount(3);

    // Enter 2 new IDs
    await page.locator('#input-batch-ids').fill('TEST-111, TEST-222');
    await expect(page.locator('#batch-grid .dental-sticker-50x30')).toHaveCount(2);
  });

  test('navigation link in index.html connects to qr.html', async ({ page }) => {
    await page.goto('/');
    const qrLink = page.locator('#nav-qr-studio');
    await expect(qrLink).toBeVisible();
    await expect(qrLink).toHaveAttribute('href', 'qr.html');
  });

});
