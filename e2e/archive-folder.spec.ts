import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Archiv Ordner Verhalten', () => {
  let createdOrderId: string | null = null;
  let orderNumber: string | null = null;

  test.afterEach(async ({ page }) => {
    if (createdOrderId) {
      await page.request.delete(`/api/orders/${createdOrderId}`);
      createdOrderId = null;
    }
  });

  test('verschiebt physischen Ordner nach Archiv und zurück', async ({ page }) => {
    // Login als Admin
    await page.goto('/login');
    await page.fill('#username', process.env.E2E_TEST_USER_ADMIN_USERNAME || 'admin');
    await page.fill('#password', process.env.E2E_TEST_USER_ADMIN_PASSWORD || 'adminpass');
    await page.click('button:has-text("Anmelden")');
    await expect(page.locator('button:has-text("Abmelden")')).toBeVisible();

    // Auftrag erstellen
    await page.click('button:has-text("Neuer Auftrag")');
    const titleInput = page.getByPlaceholder('Kurze, aussagekräftige Bezeichnung');
    await titleInput.fill(`E2E Archive Test`);
    
    // Pflichtfelder Beschreibung und Deadline
    await page.getByLabel(/Beschreibung/i).fill('Test für Archiv-Verhalten');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    await page.getByLabel(/Deadline/i).fill(futureDate.toISOString().split('T')[0]);
    
    // Kostenstelle
    const ccNumber = `CC-ARCH-${Date.now()}`;
    await page.getByTitle('Neue Kostenstelle').click();
    await page.getByPlaceholder('z.B. KOSTEN-001').fill(ccNumber);
    await page.getByPlaceholder('z.B. Projekt X').fill('Archive Projekt');
    await page.click('button:has-text("Anlegen & Auswählen")');
    await expect(page.locator('text=Anlegen & Auswählen')).not.toBeVisible();

    // Als Serviceauftrag einreichen, um das Bauteil-Warn-Modal zu umgehen
    await page.getByLabel(/Auftragstyp/i).selectOption('service');

    // Dokument hochladen, um den Ordner zu erzwingen
    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.nth(0).setInputFiles({
      name: 'test-archive.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('test archive file', 'utf-8'),
    });
    await expect(page.locator('text=test-archive.txt')).toBeVisible();

    const responsePromise = page.waitForResponse(r => r.url().includes('/api/orders') && r.request().method() === 'POST');
    await page.click('button:has-text("Auftrag einreichen")');

    const response = await responsePromise;
    const responseData = await response.json();
    createdOrderId = responseData.id || responseData._id;
    orderNumber = responseData.orderNumber;

    // Finde den Ordnernamen (storage/F-... - E2E Archive Test)
    const storageDir = path.join(process.cwd(), 'storage');
    const dirs = fs.readdirSync(storageDir).filter(f => fs.statSync(path.join(storageDir, f)).isDirectory());
    const orderFolderName = dirs.find(d => d.startsWith(orderNumber!));
    expect(orderFolderName).toBeDefined();

    const basePath = path.join(storageDir, orderFolderName!);
    const archivPath = path.join(storageDir, 'Archiv', orderFolderName!);

    expect(fs.existsSync(basePath)).toBeTruthy();
    expect(fs.existsSync(archivPath)).toBeFalsy();

    // Auftrag per API archivieren
    await page.request.put(`/api/orders/${createdOrderId}`, {
      data: { status: 'archived' }
    });

    // Prüfen, ob Ordner verschoben wurde
    expect(fs.existsSync(basePath)).toBeFalsy();
    expect(fs.existsSync(archivPath)).toBeTruthy();

    // Auftrag per API wieder ent-archivieren
    await page.request.put(`/api/orders/${createdOrderId}`, {
      data: { status: 'completed' }
    });

    // Prüfen, ob Ordner zurück verschoben wurde
    expect(fs.existsSync(basePath)).toBeTruthy();
    expect(fs.existsSync(archivPath)).toBeFalsy();
  });
});
