import { test, expect } from '@playwright/test';

const USERS = [
  { role: 'Admin', username: process.env.E2E_TEST_USER_ADMIN_USERNAME, password: process.env.E2E_TEST_USER_ADMIN_PASSWORD, canManageSettings: true, canOrder: true },
  { role: 'Werkstattleitung', username: process.env.E2E_TEST_USER_MANAGER_USERNAME, password: process.env.E2E_TEST_USER_MANAGER_PASSWORD, canManageSettings: true, canOrder: true },
  { role: 'Werkstattmitarbeiter', username: process.env.E2E_TEST_USER_WORKSHOP_USERNAME, password: process.env.E2E_TEST_USER_WORKSHOP_PASSWORD, canManageSettings: false, canOrder: true },
  { role: 'Auftraggeber', username: process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME, password: process.env.E2E_TEST_USER_AUFTRAGGEBER_PASSWORD, canManageSettings: false, canOrder: true },
  { role: 'Gast', username: process.env.E2E_TEST_USER_GUEST_USERNAME, password: process.env.E2E_TEST_USER_GUEST_PASSWORD, canManageSettings: false, canOrder: false },
];

test.describe('Kostenstellen Verwaltung und RBAC', () => {
  let createdCostCenterIds: string[] = [];

  // API Cleanup to ensure a clean state even if UI tests fail
  test.afterEach(async ({ request }) => {
    for (const id of createdCostCenterIds) {
      await request.delete(`/api/cost-centers/${id}`);
    }
    createdCostCenterIds = [];
  });

  for (const user of USERS) {
    test.describe(`Als Rolle: ${user.role}`, () => {
      
      test.beforeEach(async ({ page }) => {
        expect(user.username).toBeDefined();
        expect(user.password).toBeDefined();

        await page.goto('/login');
        await page.fill('#username', user.username!);
        await page.fill('#password', user.password!);
        await page.click('button:has-text("Anmelden")');
        await expect(page.locator('button:has-text("Abmelden")')).toBeVisible({ timeout: 10000 }); // Wait for dashboard
      });

      test('Kostenstellen in Einstellungen verwalten', async ({ page }) => {
        await page.goto('/settings');
        
        if (user.canManageSettings) {
          await expect(page.locator('h2', { hasText: 'Einstellungen' })).toBeVisible();
          await page.click('button:has-text("Kostenstellen")');
          
          await page.click('button:has-text("Neue Kostenstelle")');
          
          const uniqueNumber = `CC-SET-${Date.now()}`;
          await page.getByPlaceholder('z.B. 123456').fill(uniqueNumber);
          await page.getByPlaceholder('z.B. Forschungsprojekt Alpha').fill('Test Projekt');
          
          const responsePromise = page.waitForResponse(response => 
            response.url().includes('/api/cost-centers') && response.request().method() === 'POST'
          );
          await page.click('button:has-text("Speichern")');
          
          const response = await responsePromise;
          const data = await response.json();
          createdCostCenterIds.push(data.id);
          
          await expect(page.locator('text=Kostenstelle erfolgreich erstellt')).toBeVisible();
          await expect(page.locator(`text=${uniqueNumber}`)).toBeVisible();
        } else {
          // Guest is redirected to dashboard, Client sees "Sie haben keine Berechtigung".
          // In either case, the Kostenstellen tab should not be visible.
          await expect(page.locator('button:has-text("Kostenstellen")')).not.toBeVisible();
        }
      });

      test('Kostenstelle bei Auftragserstellung: Auswählen, Anlegen & Fehler bei Duplikat', async ({ page, request }) => {
        if (user.canOrder) {
          const manualCCNumber = `CC-MANUAL-${Date.now()}`;
          const createRes = await request.post('/api/cost-centers', {
            data: { number: manualCCNumber, projectName: 'Manual Select Test' }
          });
          const createdData = await createRes.json();
          createdCostCenterIds.push(createdData.id);

          if (user.role === 'Auftraggeber') {
            await page.click('button:has-text("Neuer Auftrag")');
          } else {
            await page.click('button:has-text("Auftrag anlegen")');
          }
          await expect(page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung')).toBeVisible();
          
          // Test: Manually select an existing cost center
          await page.locator('#costCenter').selectOption(manualCCNumber);
          expect(await page.locator('#costCenter').inputValue()).toBe(manualCCNumber);
          
          // Test: Create a new cost center during order creation
          const newOrderCCNumber = `CC-ORDER-${Date.now()}`;
          await page.getByTitle('Neue Kostenstelle anlegen').click();
          await page.getByPlaceholder('z.B. KOSTEN-001').fill(newOrderCCNumber);
          await page.getByPlaceholder('z.B. Projekt X').fill('Order Test Project');
          
          const responsePromise = page.waitForResponse(response => 
            response.url().includes('/api/cost-centers') && response.request().method() === 'POST'
          );
          await page.click('button:has-text("Anlegen & Auswählen")');
          
          const response = await responsePromise;
          const data = await response.json();
          createdCostCenterIds.push(data.id);
          
          await expect(page.locator('text=Anlegen & Auswählen')).not.toBeVisible();
          expect(await page.locator('#costCenter').inputValue()).toBe(newOrderCCNumber);

          // Test: Try to create a duplicate cost center
          await page.getByTitle('Neue Kostenstelle anlegen').click();
          await page.getByPlaceholder('z.B. KOSTEN-001').fill(newOrderCCNumber);
          await page.getByPlaceholder('z.B. Projekt X').fill('Duplicate Project');
          await page.click('button:has-text("Anlegen & Auswählen")');
          
          // Verify duplicate error is shown
          await expect(page.locator('text=Eine Kostenstelle mit dieser Nummer existiert bereits')).toBeVisible();
          await page.click('button:has-text("Abbrechen")'); // close modal

        } else {
          if (user.role === 'Auftraggeber') {
            await expect(page.locator('button:has-text("Neuer Auftrag")')).not.toBeVisible();
          } else {
            await expect(page.locator('button:has-text("Auftrag anlegen")')).not.toBeVisible();
          }
        }
      });
    });
  }

  test.describe('Admin UI Cleanup Test', () => {
    test.beforeEach(async ({ page }) => {
      // Login als Admin für den finalen Cleanup Test
      const admin = USERS.find(u => u.role === 'Admin')!;
      await page.goto('/login');
      await page.fill('#username', admin.username!);
      await page.fill('#password', admin.password!);
      await page.click('button:has-text("Anmelden")');
      await expect(page.locator('button:has-text("Abmelden")')).toBeVisible({ timeout: 10000 });
    });

    test('Admin kann eine bestehende Kostenstelle über die UI entfernen', async ({ page, request }) => {
      // 1. Kostenstelle per API anlegen, um sie dann per UI zu löschen
      const ccToDelete = `CC-DELETE-${Date.now()}`;
      const createRes = await request.post('/api/cost-centers', {
        data: { number: ccToDelete, projectName: 'To Be Deleted' }
      });
      const data = await createRes.json();
      
      // Zur Sicherheit ins Cleanup-Array, falls der UI-Test fehlschlägt
      createdCostCenterIds.push(data.id);

      // 2. Zu den Einstellungen navigieren und löschen
      await page.goto('/settings');
      await page.click('button:has-text("Kostenstellen")');
      
      // Die Zeile mit der Nummer suchen und auf Löschen klicken
      const row = page.locator('tr', { hasText: ccToDelete });
      
      // Der "Löschen" Button (Wir simulieren das alert/confirm Fenster)
      page.on('dialog', dialog => dialog.accept());
      await row.locator('button[title="Löschen"]').click();

      // Überprüfen, dass die Kostenstelle weg ist
      await expect(page.locator('text=Kostenstelle gelöscht')).toBeVisible();
      await expect(page.locator(`text=${ccToDelete}`)).not.toBeVisible();
      
      // Da erfolgreich gelöscht, müssen wir es nicht mehr per API clearen
      createdCostCenterIds = createdCostCenterIds.filter(id => id !== data.id);
    });
  });
});
