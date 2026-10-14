import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ObjectId } from 'mongodb';
import { hideInternalOrderFields } from '../../../server/utils/orderAccess.cjs';
import { preserveSubTaskHours } from '../../../server/utils/subTaskHours.cjs';
import { shouldAutoStartOrder } from '../../../server/utils/autoStartOrder.cjs';

// Execute the real PUT handler with an isolated database and mail transport.
const serverSource = fs.readFileSync(path.resolve('server.cjs'), 'utf8');
const start = serverSource.indexOf("app.put('/api/orders/:id', async");
const end = serverSource.indexOf('// POST /api/orders/:id/upload-title-image', start);
const handlerSource = serverSource.slice(start, end);

function harness(order) {
  let handler;
  const emails = [];
  const collections = { Order: [structuredClone(order)], Session: [{ token: 'test', userId: order.clientId }], User: [{ _id: new ObjectId(order.clientId), role: 'client' }] };
  function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
      if (key === '$or') return value.some(part => matches(row, part));
      if (value && typeof value === 'object' && '$exists' in value) return (row[key] !== undefined) === value.$exists;
      return String(row[key]) === String(value);
    });
  }
  // structuredClone does not preserve BSON ObjectId instances.
  collections.Order[0]._id = order._id;
  const db = { collection(name) {
    const rows = collections[name] ||= [];
    return {
      findOne: async query => { const row = rows.find(row => matches(row, query)); return row ? { ...row } : null; },
      find: query => { const cursor = { sort: () => cursor, toArray: async () => rows.filter(row => matches(row, query)) }; return cursor; },
      updateOne: async (query, update) => { const row = rows.find(row => matches(row, query)); if (row) { Object.assign(row, update.$set); for (const key of Object.keys(update.$unset || {})) delete row[key]; } },
      insertMany: async values => rows.push(...values),
      deleteMany: async () => {},
    };
  } };
  const emailModule = {
    sendOrderStatusChangeEmails: async (...args) => emails.push({ old: args[4], next: args[5] }),
    sendOrderEditedEmail: async () => emails.push({ edit: true }),
    sendClientAssignmentEmail: async () => emails.push({ assignment: true })
  };
  vm.runInNewContext(handlerSource, {
    app: { put: (_path, callback) => { handler = callback; } },
    getDB: async () => ({ client: { close: async () => {} }, db }), ObjectId,
    parseCookies: () => ({ sessionId: 'test' }), parseViewerRole: async () => 'client', normalizeUserRole: role => role,
    shouldAutoStartOrder, preserveSubTaskHours, hideInternalOrderFields,
    autoMigrateOrderFiles: async () => {}, parseQuantity: value => Number(value) || 1,
    require: () => emailModule, transporter: {}, WebSocket: { OPEN: 1 },
    console: { log: () => {}, error: () => {} }
  });
  return { collections, emails, async save(body) {
    const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ params: { id: String(order._id) }, body, app: { get: () => null } }, response);
    return response;
  } };
}

function draft() {
  return { _id: new ObjectId(), orderNumber: 'F-0044-2610', title: 'Kopie', description: 'Test', notes: 'Dupliziert von Auftrag F-0043-2610.', status: 'Entwurf', clientId: new ObjectId().toString(), deadline: new Date('2026-12-12'), documents: [], components: [], titleImage: null,
    estimatedHours: 3, actualHours: 0, duplicatedFrom: { orderNumber: 'F-0043-2610' },
    subTasks: [{ id: 'task-1', title: 'Fräsen', status: 'pending', estimatedHours: 3, actualHours: 0, assignedTo: new ObjectId().toString() }] };
}

describe('Speichern eines duplizierten Auftrags durch Auftraggeber', () => {
  it.each([false, true])('speichert den Entwurf mit geänderten Angaben: %s', async changed => {
    const original = draft();
    const server = harness(original);
    const body = { ...hideInternalOrderFields(original), status: 'Entwurf', title: changed ? 'Geänderte Kopie' : original.title, components: [] };
    const response = await server.save(body);
    expect(response.statusCode).toBe(200);
    expect(server.collections.Order[0].status).toBe('Entwurf');
    expect(server.collections.Order[0].subTasks[0]).toMatchObject({ actualHours: 0, estimatedHours: 3 });
    expect(response.body.subTasks[0]).not.toHaveProperty('actualHours');
    expect(server.collections.Order[0].duplicatedFrom).toEqual(original.duplicatedFrom);
    expect(server.emails).toEqual([]);
  });
  it('reicht den duplizierten Entwurf ein, ohne versteckte Stunden zu verändern', async () => {
    const original = draft();
    const server = harness(original);
    const response = await server.save({ ...hideInternalOrderFields(original), status: 'pending', components: [] });
    expect(response.statusCode).toBe(200);
    expect(server.collections.Order[0].status).toBe('pending');
    expect(server.collections.Order[0].subTasks[0].actualHours).toBe(0);
    expect(server.emails).toEqual([{ old: 'Entwurf', next: 'pending' }]);
  });
  it('behält auch bereits gespeicherte Stunden bei ausgelassenen Stundenfeldern unverändert bei', async () => {
    const original = draft();
    original.subTasks[0].actualHours = 5;
    const server = harness(original);
    const response = await server.save({ ...hideInternalOrderFields(original), status: 'Entwurf', components: [] });
    expect(response.statusCode).toBe(200);
    expect(server.collections.Order[0].subTasks[0]).toMatchObject({ actualHours: 5, estimatedHours: 3 });
  });
  it('verweigert weiterhin echte, unberechtigte Stundenänderungen', async () => {
    const original = draft();
    const server = harness(original);
    const body = hideInternalOrderFields(original);
    body.subTasks[0].actualHours = 7;
    const response = await server.save({ ...body, status: 'Entwurf' });
    expect(response.statusCode).toBe(403);
    expect(server.collections.Order[0].subTasks[0].actualHours).toBe(0);
  });
});
