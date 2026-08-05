import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const USERS = [
  { role: 'Admin', username: process.env.E2E_TEST_USER_ADMIN_USERNAME, password: process.env.E2E_TEST_USER_ADMIN_PASSWORD, canOrder: true },
  { role: 'Werkstattleitung', username: process.env.E2E_TEST_USER_MANAGER_USERNAME, password: process.env.E2E_TEST_USER_MANAGER_PASSWORD, canOrder: true },
  { role: 'Werkstattmitarbeiter', username: process.env.E2E_TEST_USER_WORKSHOP_USERNAME, password: process.env.E2E_TEST_USER_WORKSHOP_PASSWORD, canOrder: true },
  { role: 'Auftraggeber', username: process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME, password: process.env.E2E_TEST_USER_AUFTRAGGEBER_PASSWORD, canOrder: true },
  { role: 'Gast', username: process.env.E2E_TEST_USER_GUEST_USERNAME, password: process.env.E2E_TEST_USER_GUEST_PASSWORD, canOrder: false },
];

test.describe('Auftragserstellung (Sandbox / Cleanup)', () => {
  let createdOrderId: string | null = null;

  // TEARDOWN
  test.afterEach(async ({ page }) => {
    if (createdOrderId) {
      console.log(`🧹 Teardown: Lösche Test-Auftrag ${createdOrderId} aus der Datenbank...`);
      const deleteResponse = await page.request.delete(`/api/orders/${createdOrderId}`);
      expect(deleteResponse.ok()).toBeTruthy();
      console.log('✅ Teardown erfolgreich.');
      createdOrderId = null;
    }
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

        await expect(page.locator('button:has-text("Abmelden")')).toBeVisible({ timeout: 10000 });
      });

      test('kann einen neuen Auftrag (ohne Bauteil) erstellen', async ({ page }) => {
        if (!user.canOrder) {
          await expect(page.locator('button:has-text("Neuer Auftrag")')).not.toBeVisible();
          await expect(page.locator('button:has-text("Auftrag anlegen")')).not.toBeVisible();
          return;
        }

        if (user.role === 'Auftraggeber') {
          await page.click('button:has-text("Neuer Auftrag")');
        } else {
          await page.click('button:has-text("Auftrag anlegen")');
        }
        
        const titleInput = page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung');
        await expect(titleInput).toBeVisible();

        await titleInput.fill(`E2E Sandbox Test Auftrag (Ohne Bauteil) - ${user.role}`);
        await page.getByLabel(/Beschreibung/i).fill('Dies ist ein automatisiert erstellter Test-Auftrag aus der E2E Pipeline.');
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
        
        await page.waitForTimeout(500); // Wait for CostCenter picker fetch just in case
        
        const ccNumber1 = `CC-TEST-${Date.now()}-1`;
        await page.getByTitle('Neue Kostenstelle anlegen').click();
        await page.getByPlaceholder('z.B. KOSTEN-001').fill(ccNumber1);
        await page.getByPlaceholder('z.B. Projekt X').fill('E2E Test Projekt');
        await page.click('button:has-text("Anlegen & Auswählen")');
        
        await expect(page.locator('text=Anlegen & Auswählen')).not.toBeVisible();
        await expect(page.locator('#costCenter')).toHaveValue(ccNumber1);

        const responsePromise = page.waitForResponse(response => 
          response.url().includes('/api/orders') && response.request().method() === 'POST'
        );

        await page.click('button:has-text("Auftrag einreichen")');
        // Warnungs-Modal bestätigen
        await page.click('button:has-text("Auftrag trotzdem einreichen")');

        const response = await responsePromise;
        const responseData = await response.json();
        createdOrderId = responseData._id || responseData.id || responseData.order?._id || responseData.order?.id || null;

        expect(response.ok(), `API Error: ${await response.text()}`).toBeTruthy();
        
        await expect(page.locator(`text=E2E Sandbox Test Auftrag (Ohne Bauteil) - ${user.role}`).first()).toBeVisible();
      });

      test('kann einen Auftrag mit mehreren Bauteilen erstellen', async ({ page }) => {
        if (!user.canOrder) {
          // Anstatt den Test zu überspringen, prüfen wir auch hier nochmal, dass die Buttons unsichtbar sind
          await expect(page.locator('button:has-text("Neuer Auftrag")')).not.toBeVisible();
          await expect(page.locator('button:has-text("Auftrag anlegen")')).not.toBeVisible();
          return;
        }

        if (user.role === 'Auftraggeber') {
          await page.click('button:has-text("Neuer Auftrag")');
        } else {
          await page.click('button:has-text("Auftrag anlegen")');
        }

        const titleInput = page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung');
        await expect(titleInput).toBeVisible();

        await titleInput.fill(`E2E Sandbox Test Auftrag (Mit Bauteilen) - ${user.role}`);
        await page.getByLabel(/Beschreibung/i).fill('Test-Auftrag mit Komponenten.');
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
        
        await page.waitForTimeout(500);
        
        const ccNumber2 = `CC-TEST-${Date.now()}-2`;
        await page.getByTitle('Neue Kostenstelle anlegen').click();
        await page.getByPlaceholder('z.B. KOSTEN-001').fill(ccNumber2);
        await page.getByPlaceholder('z.B. Projekt X').fill('E2E Test Projekt');
        await page.click('button:has-text("Anlegen & Auswählen")');
        await expect(page.locator('text=Anlegen & Auswählen')).not.toBeVisible();
        await expect(page.locator('#costCenter')).toHaveValue(ccNumber2);

        // Bauteil 1
        await page.click('button:has-text("Bauteil hinzufügen")');
        await page.getByPlaceholder('z.B. Gehäuse, Schraube, etc.').nth(0).fill('Gehäuse A');
        await page.getByPlaceholder('Detaillierte Beschreibung des Bauteils...').nth(0).fill('Dies ist das erste Bauteil.');

        // Bauteil 2
        await page.click('button:has-text("Bauteil hinzufügen")');
        await page.getByPlaceholder('z.B. Gehäuse, Schraube, etc.').nth(1).fill('Schraube B');
        await page.getByPlaceholder('Detaillierte Beschreibung des Bauteils...').nth(1).fill('Dies ist das zweite Bauteil.');

        const responsePromise = page.waitForResponse(response => 
          response.url().includes('/api/orders') && response.request().method() === 'POST'
        );

        // Bei Aufträgen mit Bauteilen darf KEIN Warnmodal kommen, direkt einreichen!
        await page.click('button:has-text("Auftrag einreichen")');

        const response = await responsePromise;
        const responseData = await response.json();
        createdOrderId = responseData._id || responseData.id || responseData.order?._id || responseData.order?.id || null;
        
        expect(response.ok(), `API Error: ${await response.text()}`).toBeTruthy();
        
        await expect(page.locator(`text=E2E Sandbox Test Auftrag (Mit Bauteilen) - ${user.role}`).first()).toBeVisible();

        // Navigieren zur Detailansicht und UI verifizieren
        await page.locator(`text=E2E Sandbox Test Auftrag (Mit Bauteilen) - ${user.role}`).first().click();
        await expect(page.locator('h2', { hasText: 'E2E Sandbox Test Auftrag' })).toBeVisible();
        
        // Tab "Bauteilübersicht" öffnen
        await page.click('button:has-text("Bauteilübersicht")');
        
        // Prüfen, ob die Bauteile in der UI angezeigt werden
        await expect(page.locator('text=Gehäuse A')).toBeVisible();
        await expect(page.locator('text=Schraube B')).toBeVisible();
      });

      test('kann Dateien allgemein und am Bauteil hochladen', async ({ page }) => {
        if (!user.canOrder) {
          // Anstatt den Test zu überspringen, prüfen wir auch hier nochmal, dass die Buttons unsichtbar sind
          await expect(page.locator('button:has-text("Neuer Auftrag")')).not.toBeVisible();
          await expect(page.locator('button:has-text("Auftrag anlegen")')).not.toBeVisible();
          return;
        }

        if (user.role === 'Auftraggeber') {
          await page.click('button:has-text("Neuer Auftrag")');
        } else {
          await page.click('button:has-text("Auftrag anlegen")');
        }
        
        const titleInput = page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung');
        await expect(titleInput).toBeVisible();

        await titleInput.fill(`E2E Sandbox Test Auftrag (Mit Dateien und Umlaute) - ${user.role}`);
        await page.getByLabel(/Beschreibung/i).fill('Test-Auftrag mit Datei-Uploads (inkl. Umlaute).');
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
        
        await page.waitForTimeout(500);

        const ccNumber3 = `CC-TEST-${Date.now()}-3`;
        await page.getByTitle('Neue Kostenstelle anlegen').click();
        await page.getByPlaceholder('z.B. KOSTEN-001').fill(ccNumber3);
        await page.getByPlaceholder('z.B. Projekt X').fill('E2E Test Projekt');
        await page.click('button:has-text("Anlegen & Auswählen")');
        await expect(page.locator('text=Anlegen & Auswählen')).not.toBeVisible();
        await expect(page.locator('#costCenter')).toHaveValue(ccNumber3);

        // Allgemeines Dokument hochladen (input[type=file])
        const fileInputs = page.locator('input[type="file"]');
        await fileInputs.nth(0).setInputFiles({
          name: 'allgemeines-dokument.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4 mock pdf content...', 'utf-8'),
        });

        // UI-Prüfung, ob die Datei angezeigt wird
        await expect(page.locator('text=allgemeines-dokument.pdf')).toBeVisible();

        // Bauteil hinzufügen
        await page.click('button:has-text("Bauteil hinzufügen")');
        await page.getByPlaceholder('z.B. Gehäuse, Schraube, etc.').nth(0).fill('Bauteil für Upload');

        // Dokument am Bauteil hochladen
        await fileInputs.nth(1).setInputFiles({
          name: 'bauteil-modell.stl',
          mimeType: 'model/stl',
          buffer: Buffer.from('solid mock_stl\nendsolid mock_stl', 'utf-8'),
        });

        // UI-Prüfung, ob die Datei am Bauteil angezeigt wird
        await expect(page.locator('text=bauteil-modell.stl')).toBeVisible();

        // 2. Allgemeines Dokument als Bild mit Umlauten hochladen
        await fileInputs.nth(0).setInputFiles({
          name: 'ÄÖÜ-Müller-Testbild.png',
          mimeType: 'image/png',
          buffer: Buffer.from('mock png content', 'utf-8'),
        });

        // UI-Prüfung, ob die Datei mit Umlauten richtig angezeigt wird
        await expect(page.locator('text=ÄÖÜ-Müller-Testbild.png')).toBeVisible();

        const responsePromise = page.waitForResponse(response => 
          response.url().includes('/api/orders') && response.request().method() === 'POST'
        );

        // Einreichen
        await page.click('button:has-text("Auftrag einreichen")');

        const response = await responsePromise;
        const responseData = await response.json();
        createdOrderId = responseData._id || responseData.id || responseData.order?._id || responseData.order?.id || null;
        
        expect(response.ok(), `API Error: ${await response.text()}`).toBeTruthy();
        
        // Hole den kompletten Auftrag über die GET-Route, um die gemappten Bauteile und Dokumente zu sehen
        const getResponse = await page.request.get(`/api/orders/${createdOrderId}`);
        const getOrder = await getResponse.json();
        
        // Prüfen, ob die Dateien in der Antwort verknüpft wurden
        const documents = getOrder.documents;
        const components = getOrder.components;
        
        expect(documents).toBeDefined();
        expect(documents.length).toBeGreaterThan(1);
        expect(documents.some((d: any) => d.name === 'allgemeines-dokument.pdf')).toBe(true);
        expect(documents.some((d: any) => d.name === 'ÄÖÜ-Müller-Testbild.png')).toBe(true);
        
        expect(components).toBeDefined();
        expect(components[0].documents).toBeDefined();
        expect(components[0].documents.length).toBeGreaterThan(0);
        expect(components[0].documents[0].name).toBe('bauteil-modell.stl');
        
        // Prüfen, ob der Auftrag im Dashboard ist
        await expect(page.locator(`text=E2E Sandbox Test Auftrag (Mit Dateien und Umlaute) - ${user.role}`).first()).toBeVisible();

        // In die Detailansicht navigieren und überprüfen
        await page.locator(`text=E2E Sandbox Test Auftrag (Mit Dateien und Umlaute) - ${user.role}`).first().click();
        await expect(page.locator('h2', { hasText: 'E2E Sandbox Test Auftrag' })).toBeVisible();
        
        // Allgemeine Dateien sind im Tab "Auftragsinformationen"
        await page.click('button:has-text("Auftragsinformationen")');
        await expect(page.locator('text=allgemeines-dokument.pdf').first()).toBeVisible();
        await expect(page.locator('text=ÄÖÜ-Müller-Testbild.png').first()).toBeVisible();

        // Test: Bild im Overlay anzeigen
        const viewImageButton = page.locator('button[title="Bild anzeigen"]').first();
        await viewImageButton.click();
        
        // Overlay sollte sichtbar sein
        const overlayImage = page.locator('img[alt="Vorschau"]');
        await expect(overlayImage).toBeVisible();
        
        // Overlay schließen
        const closeButton = page.locator('button[title="Schließen"]').first();
        await closeButton.click();
        
        // Overlay sollte weg sein
        await expect(overlayImage).not.toBeVisible();

        // Überprüfen, ob die Bauteile und Dateien in der UI sichtbar sind
        await page.click('button:has-text("Bauteilübersicht")');
        await expect(page.locator('text=Bauteil für Upload')).toBeVisible();
        await expect(page.locator('text=bauteil-modell.stl').first()).toBeVisible();

        // -- NEU: Physische Dateien auf Server überprüfen --
        const orderFolderName = getOrder.networkFolderName || `${getOrder.orderNumber || getOrder._id} - ${getOrder.title.trim().replace(/[\\/:*?"<>|]/g, '_')}`;
        const uploadsDir = path.resolve(process.cwd(), 'storage');
        const orderPath = path.join(uploadsDir, orderFolderName);

        console.log(`Prüfe physische Pfade für Auftrag: ${orderFolderName}`);
        expect(fs.existsSync(orderPath)).toBeTruthy();

        expect(fs.existsSync(path.join(orderPath, 'allgemeines-dokument.pdf'))).toBeTruthy();
        expect(fs.existsSync(path.join(orderPath, 'ÄÖÜ-Müller-Testbild.png'))).toBeTruthy();

        // Bauteil-Ordner prüfen
        const sanitizedCompName = 'Bauteil für Upload'.trim().replace(/[\\/:*?"<>|]/g, '_');
        const compFolderName = `01_${sanitizedCompName}_x1`;
        const compFolderPath = path.join(orderPath, compFolderName);
        
        expect(fs.existsSync(compFolderPath)).toBeTruthy();
        expect(fs.existsSync(path.join(compFolderPath, 'bauteil-modell.stl'))).toBeTruthy();
      });

    });
  }
});
