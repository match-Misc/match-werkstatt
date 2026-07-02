import { test, expect } from '@playwright/test';

test('should redirect to login if not authenticated', async ({ page }) => {
  // Gehe zur Startseite
  await page.goto('/');

  // Da kein User eingeloggt ist, sollte auf /login weitergeleitet werden
  await expect(page).toHaveURL(/.*\/login/);

  // Prüfe, ob ein Login-Feld oder Button da ist
  // z.B. erwarten wir ein Passwort-Feld oder einen Text "Anmelden"
  await expect(page.locator('body')).toContainText(/Anmelden/i);
});
