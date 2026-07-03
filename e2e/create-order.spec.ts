import { test, expect } from '@playwright/test';

test.describe('Auftragserstellung (Sandbox / Cleanup)', () => {
  let createdOrderId: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Sicherstellen, dass die Env-Variablen gesetzt sind
    expect(process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME).toBeDefined();
    expect(process.env.E2E_TEST_USER_AUFTRAGGEBER_PASSWORD).toBeDefined();

    // 1. Login
    await page.goto('/login');
    await page.fill('#username', process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME!);
    await page.fill('#password', process.env.E2E_TEST_USER_AUFTRAGGEBER_PASSWORD!);
    await page.click('button:has-text("Anmelden")');

    // Warten bis das Dashboard geladen ist
    await expect(page).toHaveURL(/.*\//);
  });

  // TEARDOWN (Option A)
  test.afterEach(async ({ page }) => {
    if (createdOrderId) {
      console.log(`🧹 Teardown: Lösche Test-Auftrag ${createdOrderId} aus der Datenbank...`);
      const deleteResponse = await page.request.delete(`/api/orders/${createdOrderId}`);
      expect(deleteResponse.ok()).toBeTruthy();
      console.log('✅ Teardown erfolgreich.');
      createdOrderId = null;
    }
  });

  test('Auftraggeber kann einen neuen Auftrag (ohne Bauteil) erstellen', async ({ page }) => {
    await page.click('button:has-text("Neuer Auftrag")');
    const titleInput = page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung');
    await expect(titleInput).toBeVisible();

    await titleInput.fill('E2E Sandbox Test Auftrag (Ohne Bauteil)');
    await page.getByLabel(/Beschreibung/i).fill('Dies ist ein automatisiert erstellter Test-Auftrag aus der E2E Pipeline.');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
    await page.getByLabel(/Kostenstelle/i).fill('999999-TEST');

    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/api/orders') && response.request().method() === 'POST'
    );

    // Erster Klick
    await page.click('button:has-text("Auftrag einreichen")');
    // Warnungs-Modal bestätigen
    await page.click('button:has-text("Auftrag trotzdem einreichen")');

    const response = await responsePromise;
    const responseData = await response.json();
    createdOrderId = responseData._id || responseData.id || responseData.order?._id || responseData.order?.id || null;

    expect(response.ok(), `API Error: ${await response.text()}`).toBeTruthy();
    
    await expect(page.locator('text=E2E Sandbox Test Auftrag').first()).toBeVisible();
  });

  test('Auftraggeber kann einen Auftrag mit mehreren Bauteilen erstellen', async ({ page }) => {
    await page.click('button:has-text("Neuer Auftrag")');
    const titleInput = page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung');
    await expect(titleInput).toBeVisible();

    await titleInput.fill('E2E Sandbox Test Auftrag (Mit Bauteilen)');
    await page.getByLabel(/Beschreibung/i).fill('Test-Auftrag mit Komponenten.');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
    await page.getByLabel(/Kostenstelle/i).fill('999999-TEST');

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
    
    await expect(page.locator('text=E2E Sandbox Test Auftrag (Mit Bauteilen)').first()).toBeVisible();

    // Navigieren zur Detailansicht und UI verifizieren
    await page.locator('text=E2E Sandbox Test Auftrag (Mit Bauteilen)').first().click();
    await expect(page.locator('h2:has-text("E2E Sandbox Test Auftrag")')).toBeVisible();
    
    // Tab "Bauteilübersicht" öffnen
    await page.click('button:has-text("Bauteilübersicht")');
    
    // Prüfen, ob die Bauteile in der UI angezeigt werden
    await expect(page.locator('text=Gehäuse A')).toBeVisible();
    await expect(page.locator('text=Schraube B')).toBeVisible();
  });

  test('Auftraggeber kann Dateien allgemein und am Bauteil hochladen', async ({ page }) => {
    await page.click('button:has-text("Neuer Auftrag")');
    const titleInput = page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung');
    await expect(titleInput).toBeVisible();

    await titleInput.fill('E2E Sandbox Test Auftrag (Mit Dateien)');
    await page.getByLabel(/Beschreibung/i).fill('Test-Auftrag mit Datei-Uploads.');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
    await page.getByLabel(/Kostenstelle/i).fill('999999-TEST');

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
    expect(documents.length).toBeGreaterThan(0);
    expect(documents[0].name).toBe('allgemeines-dokument.pdf');
    
    expect(components).toBeDefined();
    expect(components[0].documents).toBeDefined();
    expect(components[0].documents.length).toBeGreaterThan(0);
    expect(components[0].documents[0].name).toBe('bauteil-modell.stl');
    
    // Prüfen, ob der Auftrag im Dashboard ist
    await expect(page.locator('text=E2E Sandbox Test Auftrag (Mit Dateien)').first()).toBeVisible();

    // In die Detailansicht navigieren und überprüfen
    await page.locator('text=E2E Sandbox Test Auftrag (Mit Dateien)').first().click();
    await expect(page.locator('h2:has-text("E2E Sandbox Test Auftrag")')).toBeVisible();
    
    // Allgemeine Dateien sind im Tab "Auftragsinformationen" (oder falls Dashboard, dann klicke nicht)
    await page.click('button:has-text("Auftragsinformationen")');
    await expect(page.locator('text=allgemeines-dokument.pdf').first()).toBeVisible();

    // Überprüfen, ob die Bauteile und Dateien in der UI sichtbar sind
    await page.click('button:has-text("Bauteilübersicht")');
    await expect(page.locator('text=Bauteil für Upload')).toBeVisible();
    await expect(page.locator('text=bauteil-modell.stl').first()).toBeVisible();
  });
});
