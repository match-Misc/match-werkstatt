import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ObjectId } from 'mongodb';
import { canDeleteDraft } from '../../../server/utils/draftAccess.cjs';

const source = fs.readFileSync(path.resolve('server.cjs'), 'utf8');
const handlerSource = source.slice(source.indexOf('async function deleteOrder('), source.indexOf('// === COMPONENTS API ==='));
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function harness({ own = true, authenticated = true, status = 'Entwurf' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-delete-'));
  roots.push(root);
  const userId = new ObjectId();
  const orderId = new ObjectId();
  const originalId = new ObjectId();
  const rows = {
    Order: [{ _id: orderId, status, clientId: own ? String(userId) : String(new ObjectId()), networkFolderName: 'draft' }, { _id: originalId, status: 'completed' }],
    Session: authenticated ? [{ token: 'test', userId: String(userId) }] : [],
    User: [{ _id: userId, role: 'client' }],
    Document: [{ orderId }, { orderId: originalId }], Component: [{ orderId }], NoteHistory: [{ orderId }],
    settings: [{ type: 'network-config', networkPath: path.join(root, 'network') }]
  };
  for (const base of ['storage', 'network']) {
    fs.mkdirSync(path.join(root, base, 'draft'), { recursive: true });
    fs.writeFileSync(path.join(root, base, 'draft', 'drawing.pdf'), 'copy');
    fs.mkdirSync(path.join(root, base, 'original'), { recursive: true });
    fs.writeFileSync(path.join(root, base, 'original', 'drawing.pdf'), 'original');
  }
  const matches = (row, query) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value));
  const db = { collection(name) { return {
    findOne: async query => rows[name]?.find(row => matches(row, query)) || null,
    deleteMany: async query => { rows[name] = (rows[name] || []).filter(row => !matches(row, query)); },
    deleteOne: async query => { rows[name] = (rows[name] || []).filter(row => !matches(row, query)); }
  }; } };
  const routes = {};
  vm.runInNewContext(handlerSource, {
    app: { delete: (url, callback) => { routes[url] = callback; } },
    getDB: async () => ({ db, client: { close: async () => {} } }), ObjectId, fs, path, __dirname: root,
    parseCookies: () => ({ sessionId: 'test' }), normalizeUserRole: role => role, canDeleteDraft,
    getOrCreateOrderFolderName: async (_db, order) => order.networkFolderName,
    console: { log: () => {}, error: () => {} }
  });
  return { root, rows, async remove() {
    const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await routes['/api/drafts/:id']({ params: { id: String(orderId) } }, response);
    return response;
  } };
}

describe('DELETE /api/drafts/:id', () => {
  it('löscht eigenen Entwurf mit Dokumenten und Ordnern, erhält das Original', async () => {
    const server = harness();
    const response = await server.remove();
    expect(response.statusCode).toBe(200);
    expect(server.rows.Order).toHaveLength(1);
    expect(server.rows.Document).toHaveLength(1);
    expect(server.rows.Component).toHaveLength(0);
    expect(server.rows.NoteHistory).toHaveLength(0);
    for (const base of ['storage', 'network']) {
      expect(fs.existsSync(path.join(server.root, base, 'draft'))).toBe(false);
      expect(fs.readFileSync(path.join(server.root, base, 'original', 'drawing.pdf'), 'utf8')).toBe('original');
    }
  });
  it.each([
    [{ own: false }, 403], [{ authenticated: false }, 401], [{ status: 'pending' }, 403]
  ])('verweigert unerlaubtes Löschen ohne Datenverlust: %j', async (options, code) => {
    const server = harness(options);
    const response = await server.remove();
    expect(response.statusCode).toBe(code);
    expect(server.rows.Order).toHaveLength(2);
    expect(server.rows.Document).toHaveLength(2);
    expect(fs.existsSync(path.join(server.root, 'storage', 'draft', 'drawing.pdf'))).toBe(true);
  });
});
