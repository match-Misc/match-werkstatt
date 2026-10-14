import { test, expect, Page } from '@playwright/test';

const user = { id: 'manager-test', username: 'leitung', name: 'Werkstattleitung', role: 'manager' };
const makeOrder = (id: string, overrides = {}) => ({
  id, orderNumber: id, title: id, projectName: id, clientId: 'client-test', clientName: 'Auftraggeber',
  description: 'Testauftrag', status: 'in_progress', orderType: 'fertigung', assignedTo: null,
  deadline: '2026-12-01', createdAt: '2026-10-01', updatedAt: '2026-10-01', priority: 'medium',
  estimatedHours: 10, actualHours: 5, subTasks: [], components: [], documents: [],
  notes: '', costCenter: 'Test', revisionHistory: [], reworkComments: [], noteHistory: [], ...overrides
});
async function setup(page: Page, role = 'manager', extraOrders: ReturnType<typeof makeOrder>[] = []) {
  const account = { ...user, id: role === 'client' ? 'client-test' : user.id, role };
  let orders = [makeOrder('Eigen', { assignedTo: user.id }), makeOrder('Fremd'),
    makeOrder('Unteraufgabe', { subTasks: [{ id: 'task', title: 'Teil', assignedTo: user.id, status: 'pending' }] }),
    makeOrder('Abnahme-Z', { status: 'waiting_confirmation', waitingConfirmationSince: '2026-10-02' }),
    makeOrder('Abnahme-A', { status: 'waiting_confirmation', waitingConfirmationSince: '2026-10-03' }),
    makeOrder('Abgeschlossen', { status: 'completed' }), makeOrder('Archiviert', { status: 'archived' }), ...extraOrders];
  await page.addInitScript(account => {
    if (!localStorage.getItem('currentUser')) localStorage.setItem('currentUser', JSON.stringify(account));
    localStorage.setItem('i18nextLng', 'de');
  }, account);
  await page.routeWebSocket('**/ws', socket => socket.onMessage(() => {}));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/users') return route.fulfill({ json: [account] });
    if (path.startsWith('/api/users/') && route.request().method() === 'PUT') return route.fulfill({ json: account });
    if (path === '/api/orders') return route.fulfill({ json: orders });
    if (path === '/api/drafts') return route.fulfill({ json: orders.filter(order => order.status === 'Entwurf') });
    if (path.startsWith('/api/drafts/') && route.request().method() === 'DELETE') {
      const id = decodeURIComponent(path.split('/').pop() || '');
      orders = orders.filter(order => order.id !== id);
      return route.fulfill({ json: { success: true } });
    }

    if (path.endsWith('/duplicate')) {
      const sourceId = decodeURIComponent(path.split('/').at(-2) || '');
      const source = orders.find(order => order.id === sourceId)!;
      const draft = { ...source, id: 'duplicate-draft', orderNumber: 'F-9999-2610', status: 'Entwurf', actualHours: 0,
        notes: `${source.notes ? source.notes + '\n' : ''}Dupliziert von Auftrag ${source.orderNumber}.`,
        duplicatedFrom: { id: source.id, orderNumber: source.orderNumber } };
      orders.push(draft);
      return route.fulfill({ status: 201, json: draft });
    }

    if (path.includes('/network-folder')) return route.fulfill({ json: { exists: false } });
    if (path.endsWith('/sync')) return route.fulfill({ json: { success: false } });
    const id = decodeURIComponent(path.split('/').pop() || '');
    const order = orders.find(order => order.id === id || order.orderNumber === id);
    if (order) {
      if (route.request().method() === 'PUT') {
        Object.assign(order, route.request().postDataJSON());
        orders = [...orders];
      }
      return route.fulfill({ json: order });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/dashboard');
}

test('Werkstattleitung: Rechte, Umschaltung, Abnahmesortierung und persönliche Spalten', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await expect(page.getByRole('link', { name: 'Benutzerverwaltung' })).toBeVisible();
  await expect(page.getByText('Fremd', { exact: true }).first()).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Abarbeitung: nur eigene Aufträge' });
  await toggle.click();
  await expect(page.getByText('Fremd', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Eigen', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Unteraufgabe', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
  await toggle.click();
  const acceptance = page.locator('table').last();
  await acceptance.getByRole('columnheader', { name: 'Auftragstitel' }).click();
  await expect(acceptance.locator('tbody tr').first()).toContainText('Abnahme-A');
  await acceptance.getByRole('columnheader', { name: 'Auftragstitel' }).press('Enter');
  await expect(acceptance.locator('tbody tr').first()).toContainText('Abnahme-Z');
  await expect(page.getByRole('columnheader', { name: 'Aktionen' })).toHaveCount(0);
  const firstTable = page.locator('table').first();
  await page.getByRole('button', { name: /Spalten (konfigurieren|anpassen)/ }).first().click();
  await page.getByRole('button', { name: 'Projektname: nach links', exact: true }).click();
  await expect(firstTable.locator('th').first()).toHaveAttribute('data-column', 'projectName');
  await expect(firstTable.locator('tbody tr').first().locator('td').first()).toHaveAttribute('data-column', 'projectName');
  await page.reload();
  await expect(firstTable.locator('th').first()).toHaveAttribute('data-column', 'projectName');
  await page.screenshot({ path: '/tmp/workshop-dashboard-verified.png', fullPage: true });
  await page.getByRole('link', { name: 'Benutzerverwaltung' }).click();
  await expect(page.getByRole('heading', { name: 'Benutzerverwaltung' })).toBeVisible();
  await page.goto('/dashboard');
  await page.locator('table').last().locator('tbody tr').first().press('Enter');
  await expect(page).toHaveURL(/\/orders\/Abnahme-/);
  expect(errors).toEqual([]);
});

test('Abgeschlossene und archivierte Aufträge lassen sich wieder starten', async ({ page }) => {
  await setup(page);
  await page.goto('/orders/Abgeschlossen');
  await page.getByRole('button', { name: 'Wieder starten' }).click();
  await expect(page.getByRole('button', { name: 'Zur Abnahme freigeben' })).toBeVisible();
  await page.goto('/archive/Archiviert');
  await expect(page.getByRole('button', { name: 'Wieder starten' })).toBeVisible();
  await page.getByRole('button', { name: 'Wieder starten' }).click();
  await expect(page.getByRole('button', { name: 'Zur Abnahme freigeben' })).toBeVisible();
});

test('Auftraggeber sehen weder Stunden noch Aktionsspalten', async ({ page }) => {
  await setup(page, 'client');
  await expect(page.locator('table')).toHaveCount(2);
  await expect(page.getByRole('columnheader', { name: 'Aktionen' })).toHaveCount(0);
  await page.goto('/orders/Eigen');
  await expect(page.getByRole('heading', { name: 'Eigen', exact: true })).toBeVisible();
  await expect(page.getByText('Geschätzte Stunden', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tatsächliche Stunden', { exact: true })).toHaveCount(0);
});


test('Dashboardtabellen sortieren unabhängig und behalten die Scrollposition', async ({ page }) => {
  const extraOrders = ['fertigung', 'service'].flatMap(orderType =>
    Array.from({ length: 25 }, (_, index) => makeOrder(`${orderType}-${String(index).padStart(2, '0')}`, { orderType }))
  );
  await setup(page, 'manager', extraOrders);
  const tables = page.locator('table');
  const manufacturing = tables.nth(0);
  const service = tables.nth(1);
  const acceptance = tables.nth(2);
  const numbers = (table: ReturnType<Page['locator']>) => table.locator('tbody [data-column="orderNumber"]').allTextContents();
  await expect(service.locator('tbody tr')).toHaveCount(25);
  const manufacturingBefore = await numbers(manufacturing);
  const acceptanceBefore = await numbers(acceptance);
  const serviceHeader = service.locator('th[data-column="orderNumber"]');
  await serviceHeader.scrollIntoViewIfNeeded();
  const scrollBefore = await page.locator('main').evaluate(element => element.scrollTop);
  expect(scrollBefore).toBeGreaterThan(500);
  await serviceHeader.click();
  await expect(service.locator('tbody tr').first()).toContainText('service-00');
  expect(await numbers(manufacturing)).toEqual(manufacturingBefore);
  expect(await numbers(acceptance)).toEqual(acceptanceBefore);
  const scrollAfter = await page.locator('main').evaluate(element => element.scrollTop);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(2);
  const serviceAfter = await numbers(service);
  const acceptanceHeader = acceptance.locator('th[data-column="orderNumber"]');
  await acceptanceHeader.scrollIntoViewIfNeeded();
  const acceptanceScroll = await page.locator('main').evaluate(element => element.scrollTop);
  await acceptanceHeader.press('Enter');
  await expect(acceptance.locator('tbody tr').first()).toContainText('Abnahme-A');
  expect(await numbers(manufacturing)).toEqual(manufacturingBefore);
  expect(await numbers(service)).toEqual(serviceAfter);
  expect(Math.abs(await page.locator('main').evaluate(element => element.scrollTop) - acceptanceScroll)).toBeLessThanOrEqual(2);
  await page.reload();
  await expect(service.locator('tbody tr').first()).toContainText('service-00');
  await expect(acceptance.locator('tbody tr').first()).toContainText('Abnahme-A');
  expect(await numbers(manufacturing)).toEqual(manufacturingBefore);
});

test('Auftraggebertabellen haben voneinander unabhängige Sortierungen', async ({ page }) => {
  await setup(page, 'client');
  const waiting = page.locator('table').first();
  const orders = page.locator('table').last();
  await expect(page.locator('table')).toHaveCount(2);
  await expect(orders.locator('tbody tr')).toHaveCount(4);
  const before = await orders.locator('tbody [data-column="orderNumber"]').allTextContents();
  await waiting.locator('th[data-column="orderNumber"]').click();
  await expect(waiting.locator('tbody tr').first()).toContainText('Abnahme-A');
  expect(await orders.locator('tbody [data-column="orderNumber"]').allTextContents()).toEqual(before);
  await orders.locator('th[data-column="orderNumber"]').click();
  await expect(orders.locator('tbody tr').first()).toContainText('Abgeschlossen');
  await expect(waiting.locator('tbody tr').first()).toContainText('Abnahme-A');
});

test('Offene Spaltenkonfiguration überdeckt den Button der nächsten Tabelle', async ({ page }) => {
  await setup(page, 'client');
  await expect(page.locator('table')).toHaveCount(2);
  const buttons = page.getByRole('button', { name: /Spalten (konfigurieren|anpassen)/ });
  await buttons.first().click();
  const panel = page.getByText('Spalten einblenden und anordnen', { exact: true }).locator('..');
  const panelBox = await panel.boundingBox();
  const buttonBox = await buttons.nth(1).boundingBox();
  expect(panelBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  const x = (Math.max(panelBox!.x, buttonBox!.x) + Math.min(panelBox!.x + panelBox!.width, buttonBox!.x + buttonBox!.width)) / 2;
  const y = (Math.max(panelBox!.y, buttonBox!.y) + Math.min(panelBox!.y + panelBox!.height, buttonBox!.y + buttonBox!.height)) / 2;
  expect(x).toBeGreaterThan(panelBox!.x);
  expect(y).toBeGreaterThan(buttonBox!.y);
  expect(y).toBeLessThan(panelBox!.y + panelBox!.height);
  await expect.poll(() => panel.evaluate((element, { x, y }) => element.contains(document.elementFromPoint(x, y)), { x, y })).toBe(true);
});

for (const role of ['manager', 'client']) {
  test(`${role}: Statusspalten zeigen kompakte Fortschrittsbalken ohne Text`, async ({ page }) => {
    await setup(page, role, [makeOrder('Service-Fortschritt', {
      orderType: 'service', subTasks: [{ status: 'completed' }, { status: 'pending' }]
    })]);
    const statusCells = page.locator('tbody td[data-column="status"]');
    await expect(statusCells).toHaveCount(role === 'manager' ? 5 : 7);
    for (const cell of await statusCells.all()) {
      await expect(cell).toHaveText('');
      await expect(cell.getByRole('progressbar')).toHaveCount(1);
    }
    const partial = page.locator('tr').filter({ has: page.getByText('Service-Fortschritt', { exact: true }).first() });
    await expect(partial.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await page.screenshot({ path: `/tmp/compact-progress-${role}.png`, fullPage: true });
  });
}


for (const role of ['manager', 'client']) {
  test(`${role}: Auftrag duplizieren öffnet einen bearbeitbaren Entwurf mit Herkunft und Anhängen`, async ({ page }) => {
    await setup(page, role, [makeOrder('Original-Kopie', {
      notes: 'Vorhandene Notiz', documents: [{ id: 'drawing', name: 'Zeichnung.pdf', url: '/uploads/drawing.pdf', uploadDate: '2026-10-01' }],
      components: [{ id: 'component', title: 'Bauteil-Kopie', description: 'Beschreibung', quantity: 3, documents: [] }]
    })]);
    await page.goto('/orders/Original-Kopie');
    const request = page.waitForRequest(request => request.url().endsWith('/api/orders/Original-Kopie/duplicate'));
    await page.getByRole('button', { name: 'Auftrag duplizieren', exact: true }).click();
    expect((await request).postDataJSON()).toEqual({ resetWork: true });
    await expect(page).toHaveURL(/\/orders\/F-9999-2610\/edit$/);
    await expect(page.getByRole('heading', { name: 'Auftrag bearbeiten', exact: true })).toBeVisible();
    await expect(page.locator('#notes')).toHaveValue('Vorhandene Notiz\nDupliziert von Auftrag Original-Kopie.');
    await expect(page.getByText('Zeichnung.pdf', { exact: true })).toBeVisible();
    await expect(page.locator('input[value="Bauteil-Kopie"]')).toBeVisible();
    const sourceLink = page.getByRole('link', { name: 'Original-Kopie', exact: true });
    await expect(sourceLink).toHaveAttribute('href', '/orders/Original-Kopie');
    await page.screenshot({ path: `/tmp/duplicate-draft-${role}.png`, fullPage: true });
    await page.locator('#notes').fill('Bearbeiteter Hinweis');
    const save = page.waitForRequest(request => request.method() === 'PUT' && request.url().endsWith('/api/orders/duplicate-draft'));
    await page.getByRole('button', { name: /Entwurf speichern/ }).click();
    expect((await save).postDataJSON()).toMatchObject({ status: 'Entwurf', notes: 'Bearbeiteter Hinweis', duplicatedFrom: { orderNumber: 'Original-Kopie' } });
  });
}


test('Auftraggeber: Entwurfsübersicht mit Zeilenklick, Platzhaltern und bestätigtem Löschen', async ({ page }) => {
  await setup(page, 'client', [makeOrder('Entwurf-Z', { status: 'Entwurf', projectName: '', deadline: null }), makeOrder('Entwurf-A', { status: 'Entwurf' })]);
  await page.goto('/drafts');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('columnheader')).toHaveText(['Auftragsnummer', 'Projektname', 'Auftragstitel', 'Deadline', 'Entwurf löschen']);
  await expect(page.getByText('Weitermachen', { exact: true })).toHaveCount(0);
  const row = page.locator('tbody tr').filter({ hasText: 'Entwurf-Z' });
  await expect(row.locator('td')).toHaveText(['Entwurf-Z', '—', 'Entwurf-Z', '—', '']);
  await page.screenshot({ path: '/tmp/drafts-overview-verified.png', fullPage: true });
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('Alle Angaben und Anhänge'); await dialog.dismiss(); });
  await row.getByRole('button', { name: 'Entwurf löschen: Entwurf-Z', exact: true }).click();
  await expect(page).toHaveURL(/\/drafts$/);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  page.once('dialog', async dialog => { await dialog.accept(); });
  await row.getByRole('button', { name: 'Entwurf löschen: Entwurf-Z', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody tr').click();
  await expect(page).toHaveURL(/\/orders\/Entwurf-A\/edit$/);
  const deleteButton = page.getByRole('button', { name: 'Entwurf löschen', exact: true });
  await expect(deleteButton).toBeVisible();
  await deleteButton.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/draft-delete-form-verified.png', fullPage: true });
  page.once('dialog', async dialog => { await dialog.dismiss(); });
  await deleteButton.click();
  await expect(page).toHaveURL(/\/orders\/Entwurf-A\/edit$/);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('Entwurf-A'); await dialog.accept(); });
  await deleteButton.click();
  await expect(page).toHaveURL(/\/drafts$/);
  await expect(page.getByText('Keine Entwürfe gefunden.', { exact: true })).toBeVisible();
});
