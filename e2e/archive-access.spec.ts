import { expect, test, type Page } from '@playwright/test';

const adminCredentials = {
  username: process.env.E2E_TEST_USER_ADMIN_USERNAME || 'test-user-admin',
  password: process.env.E2E_TEST_USER_ADMIN_PASSWORD || 'test123',
};

const clientCredentials = {
  username: process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME || 'test-user-auftraggeber',
  password: process.env.E2E_TEST_USER_AUFTRAGGEBER_PASSWORD || 'test123',
};

async function login(page: Page, credentials: { username: string; password: string }) {
  const logoutButton = page.getByRole('button', { name: 'Abmelden' });
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
  }

  await page.goto('/login');
  await page.fill('#username', credentials.username);
  await page.fill('#password', credentials.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(logoutButton).toBeVisible({ timeout: 10_000 });
}

async function clickAndExpectStatus(page: Page, orderId: string, label: string, status: string) {
  const updateResponse = page.waitForResponse(response =>
    response.url().includes(`/api/orders/${orderId}`) &&
    response.request().method() === 'PUT'
  );

  await page.getByRole('button', { name: label, exact: true }).click();
  const response = await updateResponse;
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).status).toBe(status);
}

test.describe('Archivzugriff für Auftraggeber', () => {
  let createdOrderId: string | null = null;
  let createdCostCenterId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Die API-Anmeldung sorgt dafür, dass der Cleanup auch nach einem fehlgeschlagenen
    // Sichtbarkeitstest mit Adminrechten erfolgt.
    await page.request.post('/api/login', { data: adminCredentials });

    if (createdOrderId) {
      const response = await page.request.delete(`/api/orders/${createdOrderId}`);
      expect(response.ok()).toBeTruthy();
      createdOrderId = null;
    }

    if (createdCostCenterId) {
      const response = await page.request.delete(`/api/cost-centers/${createdCostCenterId}`);
      expect(response.ok()).toBeTruthy();
      createdCostCenterId = null;
    }
  });

  test('zeigt einem Auftraggeber keine archivierten Aufträge anderer Nutzer', async ({ page }) => {
    const title = `E2E Archivzugriff fremder Auftrag ${Date.now()}`;
    const costCenterNumber = `CC-ACCESS-${Date.now()}`;

    await login(page, adminCredentials);

    const usersResponse = await page.request.get('/api/users');
    expect(usersResponse.ok()).toBeTruthy();
    const users = await usersResponse.json();
    const admin = users.find((user: { role: string }) => user.role === 'admin');
    expect(admin).toBeDefined();
    const adminId = admin.id || admin._id;

    await page.getByRole('button', { name: 'Neuer Auftrag' }).click();
    await page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung').fill(title);
    await page.getByLabel(/Beschreibung/i).fill('E2E-Test für die Archivberechtigung.');

    const deadline = new Date();
    deadline.setFullYear(deadline.getFullYear() + 1);
    await page.getByLabel(/Deadline/i).fill(deadline.toISOString().slice(0, 10));

    const costCenterResponse = page.waitForResponse(response =>
      response.url().includes('/api/cost-centers') &&
      response.request().method() === 'POST'
    );
    await page.getByTitle('Neue Kostenstelle').click();
    await page.getByPlaceholder('z.B. KOSTEN-001').fill(costCenterNumber);
    await page.getByPlaceholder('z.B. Projekt X').fill('E2E Archivzugriff');
    await page.getByRole('button', { name: 'Anlegen & Auswählen' }).click();
    const createdCostCenter = await (await costCenterResponse).json();
    createdCostCenterId = createdCostCenter.id;

    await page.getByLabel(/Auftragstyp/i).selectOption('service');
    const createResponse = page.waitForResponse(response =>
      response.url().includes('/api/orders') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Auftrag einreichen' }).click();
    const createdOrder = await (await createResponse).json();
    createdOrderId = createdOrder.id || createdOrder._id;
    const orderNumber = createdOrder.orderNumber;
    expect(createdOrderId).toBeTruthy();
    expect(orderNumber).toBeTruthy();

    await page.getByText(title, { exact: true }).first().click();
    const assigneeSelect = page.locator('label:has-text("Zugewiesen an") + select');
    await assigneeSelect.selectOption(adminId);
    await clickAndExpectStatus(page, createdOrderId!, 'Änderungen speichern', 'pending');

    await clickAndExpectStatus(page, createdOrderId!, 'Annehmen', 'accepted');
    await clickAndExpectStatus(page, createdOrderId!, 'Starten', 'in_progress');
    await clickAndExpectStatus(page, createdOrderId!, 'Zur Abnahme freigeben', 'waiting_confirmation');

    await page.getByRole('button', { name: 'Endabnahme bestätigen', exact: true }).click();
    await clickAndExpectStatus(page, createdOrderId!, 'Bestätigen', 'completed');
    await clickAndExpectStatus(page, createdOrderId!, 'Archivieren', 'archived');

    await login(page, clientCredentials);
    await page.locator('a[href="/archive"]').click();
    await expect(page.getByText(title, { exact: true })).not.toBeVisible();
  });
});
