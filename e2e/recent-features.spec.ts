import { test, expect } from '@playwright/test';

test.describe('Recent Features & i18n', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login as admin
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Werkstatt-Verwaltung')).toBeVisible();
  });

  test('Dashboard loads successfully', async ({ page }) => {
    // Just verify that the dashboard loaded after login
    await expect(page.locator('h1', { hasText: 'Werkstatt-Verwaltung' })).toBeVisible();
  });
});
