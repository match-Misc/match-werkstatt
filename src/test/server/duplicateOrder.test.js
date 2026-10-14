import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import { canDuplicateOrder, duplicateOrder } from '../../../server/utils/duplicateOrder.cjs';

const temporaryDirectories = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))); });

function database(initial) {
  return { data: initial, collection(name) {
    const rows = initial[name] ||= [];
    const matches = (row, query) => Object.entries(query).every(([key, value]) => value?.$regex ? new RegExp(value.$regex).test(row[key]) : String(row[key]) === String(value));
    return {
      find: (query) => ({ toArray: async () => rows.filter(row => matches(row, query)) }),
      insertOne: async (row) => { rows.push({ ...row }); return { insertedId: row._id }; },
      insertMany: async (values) => { rows.push(...values); },
      updateOne: async (query, update) => { Object.assign(rows.find(row => matches(row, query)), update.$set); },
      deleteMany: async (query) => { initial[name] = rows.filter(row => !matches(row, query)); },
      deleteOne: async (query) => { initial[name] = rows.filter(row => !matches(row, query)); }
    };
  } };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'duplicate-order-'));
  temporaryDirectories.push(root);
  const originalId = new ObjectId();
  const componentId = new ObjectId();
  const folder = 'F-0001-2610 - Bauteil';
  await fs.mkdir(path.join(root, folder, 'CAM'), { recursive: true });
  await fs.writeFile(path.join(root, folder, 'zeichnung.pdf'), 'original drawing');
  await fs.writeFile(path.join(root, folder, 'CAM', 'programm.nc'), 'original CAM');
  const attachment = { name: 'zeichnung.pdf', url: `/uploads/${encodeURIComponent(folder)}/zeichnung.pdf` };
  const source = { _id: originalId, orderNumber: 'F-0001-2610', networkFolderName: folder, title: 'Bauteil', clientId: 'client-1', clientName: 'Kunde', orderType: 'fertigung', status: 'completed', notes: 'Bisherige Notiz', estimatedHours: 8, actualHours: 5, materialAvailable: true, confirmationDate: new Date(), titleImage: { data: Buffer.from('image') }, documents: [attachment], subTasks: [ { id: 'task-1', status: 'completed', actualHours: 5, assignedComponentIds: [String(componentId)], documents: [attachment] }, { id: 'task-2', status: 'pending', dependencies: ['task-1'] } ] };
  const db = database({ Order: [source], Component: [{ _id: componentId, orderId: originalId, title: 'Teil', quantity: 3, status: 'completed' }], Document: [{ _id: new ObjectId(), orderId: originalId, componentId, ...attachment }] });
  const options = { db, source, user: { id: 'manager-1', role: 'manager' }, uploadsDir: root, getFolderName: async (_db, draft) => `${draft.orderNumber} - ${draft.title}` };
  return { ...options, root, componentId };
}

describe('Auftrag als Entwurf duplizieren', () => {
  it('beschränkt Auftraggeber auf eigene Aufträge und verweigert Gästen die Kopie', () => {
    expect(canDuplicateOrder({ id: 'client-1', role: 'client' }, { clientId: 'client-1' })).toBe(true);
    expect(canDuplicateOrder({ id: 'client-2', role: 'client' }, { clientId: 'client-1' })).toBe(false);
    expect(canDuplicateOrder({ id: 'guest', role: 'guest' }, {})).toBe(false);
  });
  it('kopiert Angaben, Bild und unabhängige Anhänge, remappt Verweise und ergänzt die Herkunft', async () => {
    const options = await fixture();
    const result = await duplicateOrder({ ...options, resetWork: false });
    expect(result.status).toBe('Entwurf');
    expect(result.orderNumber).not.toBe(options.source.orderNumber);
    expect(result.actualHours).toBe(5);
    expect(result.notes).toBe('Bisherige Notiz\nDupliziert von Auftrag F-0001-2610.');
    expect(result.duplicatedFrom).toEqual({ id: String(options.source._id), orderNumber: 'F-0001-2610' });
    expect(result.confirmationDate).toBeUndefined();
    expect(result.titleImage.data).toEqual(Buffer.from('image'));
    expect(result.documents[0].url).not.toBe(options.source.documents[0].url);
    expect(result.subTasks[1].dependencies).toEqual([result.subTasks[0].id]);
    expect(result.subTasks[0].assignedComponentIds).toEqual([String(result.components[0]._id)]);
    expect(result.components[0].documents).toHaveLength(1);
    const copiedFile = path.join(options.root, decodeURIComponent(result.documents[0].url.slice('/uploads/'.length)));
    expect(await fs.readFile(copiedFile, 'utf8')).toBe('original drawing');
    await fs.unlink(copiedFile);
    expect(await fs.readFile(path.join(options.root, options.source.networkFolderName, 'zeichnung.pdf'), 'utf8')).toBe('original drawing');
    expect(await fs.readFile(path.join(options.root, result.networkFolderName || `${result.orderNumber} - Bauteil`, 'CAM', 'programm.nc'), 'utf8')).toBe('original CAM');
    expect(options.source.status).toBe('completed');
  });
  it('setzt Bearbeitungswerte auf Wunsch zurück und lässt Angaben und geschätzte Stunden erhalten', async () => {
    const options = await fixture();
    const result = await duplicateOrder(options);
    expect(result.actualHours).toBe(0);
    expect(result.estimatedHours).toBe(8);
    expect(result.subTasks[0].status).toBe('pending');
    expect(result.subTasks[0].actualHours).toBe(0);
    expect(result.components[0].status).toBe('pending');
    expect(result.materialAvailable).toBe(true);
  });
  it('übernimmt ältere Bauteilanhänge, die nur mit dem Bauteil verknüpft sind', async () => {
    const options = await fixture();
    delete options.db.data.Document[0].orderId;
    const result = await duplicateOrder(options);
    expect(result.components[0].documents).toHaveLength(1);
    expect(result.components[0].documents[0].name).toBe('zeichnung.pdf');
  });
  it('kopiert Netzwerkdateien mit unabhängigen Netzwerkpfaden', async () => {
    const options = await fixture();
    const network = await fs.mkdtemp(path.join(os.tmpdir(), 'duplicate-network-'));
    temporaryDirectories.push(network);
    await fs.rename(path.join(options.root, options.source.networkFolderName), path.join(network, options.source.networkFolderName));
    options.source.documents[0].url = `/network-files/${encodeURIComponent(options.source.networkFolderName)}/zeichnung.pdf`;
    const result = await duplicateOrder({ ...options, networkPath: network });
    expect(result.documents[0].url).toMatch(/^\/network-files\//);
    expect(result.documents[0].migrated).toBe(true);
    expect(await fs.readFile(result.documents[0].networkPath, 'utf8')).toBe('original drawing');
    await fs.unlink(result.documents[0].networkPath);
    expect(await fs.readFile(path.join(network, options.source.networkFolderName, 'zeichnung.pdf'), 'utf8')).toBe('original drawing');
  });
  it('verweigert die Kopie fremder Aufträge ohne Dateikopien oder neue Daten', async () => {
    const options = await fixture();
    await expect(duplicateOrder({ ...options, user: { id: 'client-2', role: 'client' } })).rejects.toMatchObject({ status: 403 });
    expect(options.db.data.Order).toEqual([options.source]);
    expect(await fs.readdir(options.root)).toEqual([options.source.networkFolderName]);
  });
  it('kopiert archivierte Anhänge zurück in einen neuen aktiven Entwurfsordner', async () => {
    const options = await fixture();
    await fs.mkdir(path.join(options.root, 'Archiv'));
    await fs.rename(path.join(options.root, options.source.networkFolderName), path.join(options.root, 'Archiv', options.source.networkFolderName));
    options.source.status = 'archived';
    const result = await duplicateOrder(options);
    const file = path.join(options.root, decodeURIComponent(result.documents[0].url.slice('/uploads/'.length)));
    expect(await fs.readFile(file, 'utf8')).toBe('original drawing');
    expect(result.documents[0].url).not.toContain('/Archiv/');
    expect(options.source.status).toBe('archived');
  });
  it('überschreibt oder löscht keine vorhandenen Zielordner', async () => {
    const options = await fixture();
    const target = path.join(options.root, 'existing');
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'keep.txt'), 'keep');
    await expect(duplicateOrder({ ...options, getFolderName: async () => 'existing' })).rejects.toThrow();
    expect(await fs.readFile(path.join(target, 'keep.txt'), 'utf8')).toBe('keep');
    expect(options.db.data.Order).toEqual([options.source]);
  });
  it('verweigert Anhänge mit Pfaden außerhalb des Speichers', async () => {
    const options = await fixture();
    options.source.documents = [{ name: 'secret.txt', url: '/uploads/../../secret.txt' }];
    await expect(duplicateOrder(options)).rejects.toThrow('Ungültiger Dateipfad');
    expect(options.db.data.Order).toEqual([options.source]);
  });
  it('bereinigt eine fehlgeschlagene Kopie ohne das Original zu verändern', async () => {
    const options = await fixture();
    await fs.unlink(path.join(options.root, options.source.networkFolderName, 'zeichnung.pdf'));
    await expect(duplicateOrder(options)).rejects.toThrow('Anhang fehlt');
    expect(options.db.data.Order).toEqual([options.source]);
    expect(options.db.data.Component).toHaveLength(1);
    expect(await fs.readdir(options.root)).toEqual([options.source.networkFolderName]);
  });
});
