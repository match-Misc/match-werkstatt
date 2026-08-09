import { test, expect } from '@playwright/test';

test.describe('Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/');
    await page.fill('input[type="text"]', process.env.E2E_TEST_USER_ADMIN_USERNAME || 'test-user-admin');
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_ADMIN_PASSWORD || 'test123');
    const loginResponse = page.waitForResponse('**/api/login');
    await page.click('button[type="submit"]');
    await loginResponse;
    await page.waitForSelector('header', { state: 'visible' });
    
    // Navigate to Analytics Dashboard
    await page.goto('/analytics');
    await expect(page).toHaveURL(/.*\/analytics/);
  });

  test('should display the analytics dashboard title', async ({ page }) => {
    await expect(page.locator('h1').last()).toBeVisible();
  });

  test('should render the KPIs and charts', async ({ page }) => {
    // Switch to DE
    await page.selectOption('[data-testid="language-select"]', 'de');

    // Check KPIs
    await expect(page.locator('text=Gesamtaufträge').first()).toBeVisible();
    await expect(page.locator('text=Bauteile gesamt').first()).toBeVisible();
    await expect(page.locator('text=Nacharbeits-Quote').first()).toBeVisible();

    // Check at least one recharts container exists
    const charts = page.locator('.recharts-wrapper svg');
    await expect(charts.first()).toBeVisible();
  });
});
