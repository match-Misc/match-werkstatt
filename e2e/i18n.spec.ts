import { test, expect } from '@playwright/test';

test.describe('i18n Phase 1-3 Dashboards & Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin to access everything
    await page.goto('/');
    await page.fill('input[type="text"]', process.env.E2E_TEST_USER_ADMIN_USERNAME || 'test-user-admin');
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_ADMIN_PASSWORD || 'test123');
    const loginResponse = page.waitForResponse('**/api/login');
    await page.click('button[type="submit"]');
    await loginResponse;
    await page.goto('/dashboard');
    await page.waitForSelector('h2', { timeout: 10000 });
  });

  test('WorkshopDashboard translates correctly', async ({ page }) => {
    // Check DE
    await expect(page.locator('h2')).not.toHaveCount(0, { timeout: 10000 });
    await page.selectOption('[data-testid="language-select"]', 'de');
    await expect(page.locator('h2', { hasText: 'Werkstattaufträge' })).toBeVisible();
    await expect(page.getByPlaceholder('Suchen...')).toBeVisible();

    // Switch to EN
    await page.selectOption('[data-testid="language-select"]', 'en');
    await expect(page.locator('h2', { hasText: 'Workshop Orders' })).toBeVisible();
    await expect(page.getByPlaceholder('Search...')).toBeVisible();
  });

  test('TaskOverview translates correctly', async ({ page }) => {
    await page.goto('/tasks');
    
    // Check DE
    await page.selectOption('[data-testid="language-select"]', 'de');
    await expect(page.locator('h2', { hasText: 'Unteraufgaben' })).toBeVisible();

    // Switch to EN
    await page.selectOption('[data-testid="language-select"]', 'en');
    await expect(page.locator('h2', { hasText: 'Subtasks' })).toBeVisible();
  });

  test('Archive translates correctly', async ({ page }) => {
    await page.goto('/archive');
    
    // Check DE
    await page.selectOption('[data-testid="language-select"]', 'de');
    await expect(page.locator('h2', { hasText: 'Archiv' })).toBeVisible();
    
    // Optional check for "Spalten anpassen" if table exists (empty DB fallback for CI)
    const tableHeaderDe = page.getByTitle('Spalten anpassen');
    const emptyStateDe = page.locator('text=Keine abgeschlossenen Aufträge gefunden.');
    await expect(tableHeaderDe.or(emptyStateDe)).toBeVisible();

    // Switch to EN
    await page.selectOption('[data-testid="language-select"]', 'en');
    await expect(page.locator('h2', { hasText: 'Archive' })).toBeVisible();
    
    const tableHeaderEn = page.getByTitle('Adjust Columns');
    const emptyStateEn = page.locator('text=No completed orders found.');
    await expect(tableHeaderEn.or(emptyStateEn)).toBeVisible();
  });

  test('Admin translates correctly', async ({ page }) => {
    await page.goto('/admin/users');
    
    // Check DE
    await page.selectOption('[data-testid="language-select"]', 'de');
    await expect(page.locator('h2', { hasText: 'Benutzerverwaltung' })).toBeVisible();
    await expect(page.locator('text=Verwalten Sie Rollen und Berechtigungen der Benutzer.')).toBeVisible();

    // Switch to EN
    await page.selectOption('[data-testid="language-select"]', 'en');
    await expect(page.locator('h2', { hasText: 'User Management' })).toBeVisible();
    await expect(page.locator('text=Manage user roles and permissions.')).toBeVisible();
  });

  test('Settings translates correctly', async ({ page }) => {
    await page.goto('/settings');
    
    // Check DE
    await page.selectOption('[data-testid="language-select"]', 'de');
    await expect(page.locator('h2', { hasText: 'Einstellungen' })).toBeVisible();

    // Switch to EN
    await page.selectOption('[data-testid="language-select"]', 'en');
    await expect(page.locator('h2', { hasText: 'Settings' })).toBeVisible();
  });

  test('ClientDashboard translates correctly', async ({ page }) => {
    test.setTimeout(30000); // Increase timeout due to order creation
    
    // Logout and login as client
    await page.locator('button', { hasText: 'Abmelden' }).or(page.locator('button', { hasText: 'Logout' })).click();
    await page.goto('/');
    await page.fill('input[type="text"]', process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME || 'test-user-auftraggeber');
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_AUFTRAGGEBER_PASSWORD || 'test123');
    const clientLoginResponse = page.waitForResponse('**/api/login');
    await page.click('button[type="submit"]');
    await clientLoginResponse;
    await page.goto('/dashboard');
    await page.waitForSelector('h2', { timeout: 10000 });
    
    // Check DE
    await page.selectOption('[data-testid="language-select"]', 'de');
    await expect(page.locator('h2', { hasText: 'Meine Aufträge' })).toBeVisible();
    await expect(page.locator('text=Keine Aufträge in dieser Ansicht.')).toBeVisible();

    // Switch to EN
    await page.selectOption('[data-testid="language-select"]', 'en');
    await expect(page.locator('h2', { hasText: 'My Orders' })).toBeVisible();
    await expect(page.locator('text=No orders in this view.')).toBeVisible();

    // Create an order to test populated state table headers
    await page.selectOption('[data-testid="language-select"]', 'de');
    
    // Create a cost center first (needed for order creation)
    const costCenterNumber = `CC-TEST-I18N-${Date.now()}`;
    await page.request.post('/api/cost-centers', {
      data: {
        number: costCenterNumber,
        projectName: 'i18n Test Project'
      },
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}`
      }
    });

    await page.goto('/orders/new');
    await page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung').fill('E2E i18n Test Auftrag');
    await page.getByLabel(/Beschreibung/i).fill('Test Description');
    // Set deadline
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
    // Set Cost Center (required)
    await page.locator('select#costCenter').selectOption(costCenterNumber);
    // Submit
    await page.click('button:has-text("Auftrag einreichen")');
    await page.click('button:has-text("Auftrag trotzdem einreichen")');
    
    // Wait for the navigation to finish (it uses navigate(-1) so we go back to dashboard)
    await page.waitForURL('**/dashboard*');
    
    // Check DE table headers
    await expect(page.locator('th', { hasText: 'Auftragsnummer' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Auftragstitel' })).toBeVisible();
    
    // Switch to EN and check headers
    await page.selectOption('[data-testid="language-select"]', 'en');
    await expect(page.locator('th', { hasText: 'Order Number' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Order Title' })).toBeVisible();
  });
});
