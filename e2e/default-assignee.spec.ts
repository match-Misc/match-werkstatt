import { test, expect } from '@playwright/test';

test.describe('Standard-Zuweisung', () => {
  let adminId: string = '';
  let createdOrderIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    // 1. Admin login
    await page.goto('/login');
    await page.fill('#username', process.env.E2E_TEST_USER_ADMIN_USERNAME!);
    await page.fill('#password', process.env.E2E_TEST_USER_ADMIN_PASSWORD!);
    await page.click('button:has-text("Anmelden")');
    await expect(page.locator('button:has-text("Abmelden")')).toBeVisible({ timeout: 10000 });

    // 2. Fetch admin user id
    const usersRes = await page.request.get('/api/users');
    const users = await usersRes.json();
    const adminUser = users.find((u: any) => u.role === 'admin');
    expect(adminUser).toBeDefined();
    adminId = adminUser.id || adminUser._id;
  });

  test.afterEach(async ({ page }) => {
    // Cleanup orders
    for (const id of createdOrderIds) {
      console.log(`🧹 Teardown: Lösche Test-Auftrag ${id}...`);
      await page.request.delete(`/api/orders/${id}`);
    }
    createdOrderIds = [];

    // Reset default assignee to null
    await page.request.post('/api/admin/default-assignee', {
      data: { userId: null }
    });
  });

  test('setzt den Standard-Zuweisung korrekt bei neuen Aufträgen', async ({ page }) => {
    // 1. Niemand als Standard
    await page.request.post('/api/admin/default-assignee', {
      data: { userId: null }
    });

    // Create order 1
    await page.click('button:has-text("Auftrag anlegen")');
    await page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung').fill('E2E Assignee Test 1 (None)');
    await page.getByLabel(/Beschreibung/i).fill('Test 1');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);

    await page.waitForTimeout(500);
    const ccNumber1 = `CC-ASSIGN-${Date.now()}-1`;
    await page.getByTitle('Neue Kostenstelle anlegen').click();
    await page.getByPlaceholder('z.B. KOSTEN-001').fill(ccNumber1);
    await page.getByPlaceholder('z.B. Projekt X').fill('E2E Test Projekt');
    await page.click('button:has-text("Anlegen & Auswählen")');
    await expect(page.locator('text=Anlegen & Auswählen')).not.toBeVisible();

    const responsePromise1 = page.waitForResponse(response => 
      response.url().includes('/api/orders') && response.request().method() === 'POST'
    );
    await page.click('button:has-text("Auftrag einreichen")');
    await page.click('button:has-text("Auftrag trotzdem einreichen")');
    const response1 = await responsePromise1;
    const data1 = await response1.json();
    const orderId1 = data1._id || data1.id || data1.order?._id || data1.order?.id;
    createdOrderIds.push(orderId1);

    // Verify order 1 has no assignee via API
    const getOrderRes1 = await page.request.get(`/api/orders/${orderId1}`);
    const orderData1 = await getOrderRes1.json();
    expect(orderData1.assignedTo).toBeFalsy();

    // Verify UI has no assignee selected
    await page.locator('text=E2E Assignee Test 1 (None)').first().click();
    await expect(page.locator('select').first()).toHaveValue('');

    // 2. Admin als Standard
    await page.request.post('/api/admin/default-assignee', {
      data: { userId: adminId }
    });

    // Go back to dashboard
    await page.goto('/');

    // Create order 2
    await page.click('button:has-text("Auftrag anlegen")');
    await page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung').fill('E2E Assignee Test 2 (Admin)');
    await page.getByLabel(/Beschreibung/i).fill('Test 2');
    await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);

    await page.waitForTimeout(500);
    const ccNumber2 = `CC-ASSIGN-${Date.now()}-2`;
    await page.getByTitle('Neue Kostenstelle anlegen').click();
    await page.getByPlaceholder('z.B. KOSTEN-001').fill(ccNumber2);
    await page.getByPlaceholder('z.B. Projekt X').fill('E2E Test Projekt');
    await page.click('button:has-text("Anlegen & Auswählen")');
    await expect(page.locator('text=Anlegen & Auswählen')).not.toBeVisible();

    const responsePromise2 = page.waitForResponse(response => 
      response.url().includes('/api/orders') && response.request().method() === 'POST'
    );
    await page.click('button:has-text("Auftrag einreichen")');
    await page.click('button:has-text("Auftrag trotzdem einreichen")');
    const response2 = await responsePromise2;
    const data2 = await response2.json();
    const orderId2 = data2._id || data2.id || data2.order?._id || data2.order?.id;
    createdOrderIds.push(orderId2);

    // Verify order 2 is assigned to admin via API
    const getOrderRes2 = await page.request.get(`/api/orders/${orderId2}`);
    const orderData2 = await getOrderRes2.json();
    expect(orderData2.assignedTo).toBe(adminId);

    // Verify UI has admin selected
    await page.locator('text=E2E Assignee Test 2 (Admin)').first().click();
    await expect(page.locator('select').first()).toHaveValue(adminId);
  });
});
