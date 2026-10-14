const fs = require('fs/promises');
const path = require('path');
const { ObjectId } = require('mongodb');

function canDuplicateOrder(user, order) {
  return !!user && (['admin', 'manager', 'employee'].includes(user.role) ||
    (user.role === 'client' && !!user.id && order.clientId != null && String(order.clientId) === String(user.id)));
}

function safePath(root, relative) {
  const resolved = path.resolve(root, relative);
  const inside = path.relative(path.resolve(root), resolved);
  if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    throw new Error('Ungültiger Dateipfad');
  }
  return resolved;
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function checkedFile(file, roots) {
  const real = await fs.realpath(file);
  for (const root of roots) {
    if (!await exists(root)) continue;
    const realRoot = await fs.realpath(root);
    const relative = path.relative(realRoot, real);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return real;
  }
  throw new Error('Anhang liegt außerhalb des Auftragsspeichers');
}

async function copyFolder(source, target, copied) {
  if (!await exists(source)) return;
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error('Verknüpfte Ordner können nicht dupliziert werden');
  await fs.mkdir(target, { recursive: true });
  for (const item of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, item.name);
    const to = path.join(target, item.name);
    if (item.isSymbolicLink()) throw new Error('Verknüpfte Dateien können nicht dupliziert werden');
    if (item.isDirectory()) await copyFolder(from, to, copied);
    else if (item.isFile()) {
      if (await exists(to)) {
        if (!(await fs.readFile(from)).equals(await fs.readFile(to))) throw new Error('Widersprüchliche Anhänge im Auftragsspeicher');
      } else await fs.copyFile(from, to);
      copied.set(await fs.realpath(from), to);
    }
  }
}

function uniqueDocuments(documents) {
  const seen = new Set();
  return documents.filter(doc => {
    const key = `${doc.url || doc.networkPath || doc.id || doc._id}:${doc.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function duplicateOrder({ db, source, user, uploadsDir, networkPath, getFolderName, resetWork = true }) {
  if (!canDuplicateOrder(user, source)) {
    const error = new Error('Keine Berechtigung zum Duplizieren dieses Auftrags');
    error.status = 403;
    throw error;
  }
  const sourceId = source._id;
  const id = new ObjectId();
  const now = new Date();
  const reference = { id: String(sourceId), orderNumber: source.orderNumber || String(sourceId) };
  const draft = { ...source, _id: id, status: 'Entwurf', createdAt: now, updatedAt: now,
    createdBy: user.id, duplicatedFrom: reference,
    notes: [source.notes, `Dupliziert von Auftrag ${reference.orderNumber}.`].filter(Boolean).join('\n'),
    revisionHistory: [], reworkComments: [], documents: [] };
  for (const key of ['id', 'orderNumber', 'networkFolderName', 'confirmationDate', 'confirmationNote',
    'waitingConfirmationSince', 'remindersSent', 'acceptedDate', 'noteHistory', 'components', 'canEdit', 'revisionRequest']) delete draft[key];
  if (resetWork) {
    draft.actualHours = 0;
  }
  const components = await db.collection('Component').find({ orderId: sourceId }).toArray();
  const originalComponents = components.length ? components : (source.components || []);
  const documents = await db.collection('Document').find({ orderId: sourceId }).toArray();
  const componentIds = new Map(originalComponents.map(component => [String(component._id || component.id), new ObjectId()]));
  const taskIds = new Map((source.subTasks || []).map(task => [String(task.id), new ObjectId().toString()]));
  let targetFolder;
  let folderCreated = false;
  let inserted = false;
  try {
    // The unique orderNumber index guards concurrent creation, including the existing creation endpoint.
    const prefix = source.orderType === 'service' ? 'S' : 'F';
    for (let attempt = 0; attempt < 5; attempt++) {
      const numbers = await db.collection('Order').find({ orderNumber: { $regex: `^${prefix}-` } }).toArray();
      const next = 1 + Math.max(0, ...numbers.map(order => Number(order.orderNumber?.match(/^[FS]-(\d+)-\d{4}$/)?.[1]) || 0));
      draft.orderNumber = `${prefix}-${String(next).padStart(4, '0')}-${now.toISOString().slice(2, 7).replace('-', '')}`;
      try { await db.collection('Order').insertOne(draft); inserted = true; break; }
      catch (error) { if (error.code !== 11000 || attempt === 4) throw error; }
    }
    const clean = value => (value || '').trim().replace(/[\\/:*?"<>|]/g, '_');
    const sourceFolderName = source.networkFolderName || [reference.orderNumber, clean(source.projectName), clean(source.title || 'unnamed')].filter(Boolean).join(' - ');
    const targetFolderName = await getFolderName(db, draft);
    const roots = [uploadsDir, networkPath].filter(Boolean);
    const targetRoot = networkPath && await exists(networkPath) ? networkPath : uploadsDir;
    targetFolder = safePath(targetRoot, targetFolderName);
    await fs.mkdir(targetFolder); // A new folder must never overwrite existing files.
    folderCreated = true;
    const copied = new Map();
    for (const root of roots) {
      await copyFolder(safePath(root, path.join(source.status === 'archived' ? 'Archiv' : '', sourceFolderName)), targetFolder, copied);
    }
    const documentCopies = new Map();
    async function copyDocument(document) {
      const key = `${document.url || document.networkPath || document.id || document._id}:${document.name}`;
      if (documentCopies.has(key)) return documentCopies.get(key);
      const candidates = [];
      if (document.networkPath) candidates.push(document.networkPath);
      const url = document.url || '';
      for (const [prefix, root] of [['/uploads/', uploadsDir], ['/network-files/', networkPath]]) {
        if (root && url.startsWith(prefix)) {
          const relative = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
          candidates.push(safePath(root, relative), safePath(root, path.join('Archiv', relative)));
        }
      }
      for (const root of roots) candidates.push(safePath(root, path.join(source.status === 'archived' ? 'Archiv' : '', sourceFolderName, path.basename(document.name || ''))));
      const file = candidates.length && await Promise.all(candidates.map(exists)).then(found => candidates[found.indexOf(true)]);
      if (!file) throw new Error(`Anhang fehlt: ${document.name || 'unbekannt'}`);
      const real = await checkedFile(file, roots);
      const documentId = new ObjectId();
      let target = copied.get(real);
      if (!target) {
        target = path.join(targetFolder, 'attachments', `${documentId}-${path.basename(document.name || file)}`);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(real, target);
        copied.set(real, target);
      }
      const relative = path.relative(targetRoot, target).split(path.sep).map(encodeURIComponent).join('/');
      const result = { ...document, _id: documentId, id: String(documentId), orderId: id,
        url: `${targetRoot === uploadsDir ? '/uploads/' : '/network-files/'}${relative}`, uploadDate: now };
      delete result.componentId;
      delete result.networkPath;
      delete result.migrated;
      if (targetRoot !== uploadsDir) { result.networkPath = target; result.migrated = true; }
      documentCopies.set(key, result);
      return result;
    }
    const mainDocuments = uniqueDocuments([...documents.filter(doc => !doc.componentId), ...(source.documents || []).filter(doc => !doc.componentId), ...(source.revisionRequest?.documents || []), ...(source.reworkComments || []).flatMap(comment => comment.documents || [])]);
    draft.documents = await Promise.all(mainDocuments.map(copyDocument));
    const componentCopies = [];
    for (const component of originalComponents) {
      const oldId = String(component._id || component.id);
      const copy = { ...component, _id: componentIds.get(oldId), orderId: id, createdAt: now, updatedAt: now };
      delete copy.id;
      delete copy.documents;
      if (resetWork) copy.status = 'pending';
      const linkedDocuments = await db.collection('Document').find({ componentId: component._id || component.id }).toArray();
      const legacyDocuments = await db.collection('Document').find({ componentId: oldId }).toArray();
      const files = uniqueDocuments([...documents.filter(doc => String(doc.componentId) === oldId), ...linkedDocuments, ...legacyDocuments, ...(component.documents || [])]);
      const attachments = [];
      for (const file of files) {
        const attachmentId = new ObjectId();
        attachments.push({ ...await copyDocument(file), _id: attachmentId, id: String(attachmentId), componentId: copy._id });
      }
      await db.collection('Component').insertOne(copy);
      if (attachments.length) await db.collection('Document').insertMany(attachments);
      componentCopies.push({ ...copy, id: String(copy._id), documents: attachments });
    }
    draft.subTasks = [];
    for (const task of source.subTasks || []) {
      const copy = { ...task, id: taskIds.get(String(task.id)), orderId: String(id), createdAt: now, updatedAt: now,
        dependencies: (task.dependencies || []).map(dependency => taskIds.get(String(dependency))).filter(Boolean),
        documents: await Promise.all((task.documents || []).map(copyDocument)) };
      if (task.assignedComponentId) copy.assignedComponentId = String(componentIds.get(String(task.assignedComponentId)) || '');
      if (task.assignedComponentIds) copy.assignedComponentIds = task.assignedComponentIds.map(componentId => String(componentIds.get(String(componentId)) || '')).filter(Boolean);
      if (resetWork) { copy.status = 'pending'; copy.actualHours = 0; }
      draft.subTasks.push(copy);
    }
    const { _id, ...fields } = draft;
    await db.collection('Order').updateOne({ _id: id }, { $set: fields });
    return { ...draft, id: String(id), components: componentCopies };
  } catch (error) {
    if (inserted) {
      await db.collection('Document').deleteMany({ orderId: id });
      await db.collection('Component').deleteMany({ orderId: id });
      await db.collection('Order').deleteOne({ _id: id });
    }
    if (folderCreated) await fs.rm(targetFolder, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { canDuplicateOrder, duplicateOrder };
