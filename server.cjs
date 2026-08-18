const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const { buildOrderAccessFilter } = require('./server/utils/orderAccess.cjs');

// Hybrid LDAP Integration
const SimpleLDAPAuth = require('./scripts/simple-ldap-auth.cjs');
const LDAPSearch = require('./scripts/ldap-search.cjs');
const nodemailer = require('nodemailer');

// LDAP Konfiguration
const ldapConfig = {
  host: process.env.LDAP_HOST || 'ldap.company.local',
  port: parseInt(process.env.LDAP_PORT) || 389,
  useTLS: process.env.LDAP_USE_TLS === 'true',
  baseDN: process.env.LDAP_BASE_DN || 'dc=company,dc=local',
  userSearchBase: process.env.LDAP_USER_SEARCH_BASE || 'ou=users,dc=company,dc=local',
  domain: process.env.LDAP_DOMAIN || '',
  userDnTemplates: process.env.LDAP_USER_DN_TEMPLATES
    ? process.env.LDAP_USER_DN_TEMPLATES.split(/[;\n]/).map((item) => item.trim()).filter(Boolean)
    : [],
  bindDN: process.env.LDAP_BIND_DN || '',
  bindPassword: process.env.LDAP_BIND_PASSWORD || ''
};

// LDAP Authenticator initialisieren
const ldapAuth = new SimpleLDAPAuth(ldapConfig);
const ldapSearch = new LDAPSearch(ldapConfig);
console.log('[HYBRID-AUTH] LDAP-Konfiguration geladen:', {
  host: ldapConfig.host,
  port: ldapConfig.port,
  baseDN: ldapConfig.baseDN
});

// Nodemailer Transporter konfigurieren
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'email.uni-hannover.de',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // TLS requires STARTTLS, false usually means STARTTLS if port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Transporter testen
transporter.verify((error, success) => {
  if (error) {
    console.log('[SMTP] Konfigurationsfehler:', error.message);
  } else {
    console.log('[SMTP] Server ist bereit für den E-Mail-Versand');
  }
});

const app = express();
const port = process.env.PORT || 3001;

// CORS - dynamisch konfigurierbar für Docker
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : true; // true = alle Origins erlauben
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to parse cookies
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

// File Download Guard Middleware
async function fileDownloadGuard(req, res, next) {
  try {
    const { client, db } = await getDB();
    const settingsColl = db.collection('settings');
    const config = await settingsColl.findOne({ type: 'file-visibility-config' });
    
    if (config && config.restrictedExtensions && config.restrictedExtensions.length > 0) {
      // Check if requested file extension is restricted
      let filename = req.params.filename;
      if (!filename) {
        const parts = req.path.split('/');
        for (let i = parts.length - 1; i >= 0; i--) {
          if (parts[i].includes('.')) {
            filename = parts[i];
            break;
          }
        }
      }
      
      if (filename && filename.includes('.')) {
        const ext = '.' + filename.split('.').pop().toLowerCase();
        const restrictedExts = config.restrictedExtensions.map(e => e.toLowerCase());
        
        if (restrictedExts.includes(ext)) {
          // File is restricted, check session role
          const cookies = parseCookies(req);
          let viewerRole = 'guest'; // default
          if (cookies.sessionId) {
            const session = await db.collection('Session').findOne({ token: cookies.sessionId });
            if (session && session.role) {
              viewerRole = normalizeUserRole(session.role);
            }
          }
          
          if (viewerRole === 'client' || viewerRole === 'guest' || !viewerRole) {
            await client.close();
            return res.status(403).json({ error: 'Zugriff auf diesen Dateityp verweigert.' });
          }
        }
      }
    }
    await client.close();
    next();
  } catch (err) {
    console.error('fileDownloadGuard error:', err);
    res.status(500).send('Interner Serverfehler');
  }
}

// Static files
const uploadsDir = path.join(__dirname, 'storage');
app.use('/uploads', fileDownloadGuard, (req, res, next) => {
  if (req.url && req.url !== '/') {
    try {
      const pathname = req.url.split('?')[0];
      const decodedPath = decodeURIComponent(pathname);
      const regularPath = path.join(uploadsDir, decodedPath);
      if (!fs.existsSync(regularPath)) {
        const archivPath = path.join(uploadsDir, 'Archiv', decodedPath);
        if (fs.existsSync(archivPath)) {
          req.url = '/Archiv' + req.url;
        }
      }
    } catch(e) { }
  }
  next();
}, express.static(uploadsDir, {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    
    // Add file modification time for debugging
    try {
      const stats = fs.statSync(filePath);
      console.log(`[Static Upload] Serving: ${filePath} (mtime: ${stats.mtime.toISOString()})`);
    } catch (e) {
      console.log(`[Static Upload] Serving: ${filePath} (no stats available)`);
    }
  }
}));

// (cam-files directory removed – internal documents are now stored in uploads/ORDER/Interne Dokumente/)

// Network folder static files middleware
app.use('/network-files', fileDownloadGuard, async (req, res, next) => {
  try {
    const { client, db } = await getDB();
    const settingsCollection = db.collection('settings');
    const networkConfig = await settingsCollection.findOne({ type: 'network-config' });
    await client.close();

    // Strong cache prevention
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    
    if (networkConfig && networkConfig.networkPath && fs.existsSync(networkConfig.networkPath)) {
      if (req.url && req.url !== '/') {
        try {
          const pathname = req.url.split('?')[0];
          const decodedPath = decodeURIComponent(pathname);
          const regularPath = path.join(networkConfig.networkPath, decodedPath);
          if (!fs.existsSync(regularPath)) {
            const archivPath = path.join(networkConfig.networkPath, 'Archiv', decodedPath);
            if (fs.existsSync(archivPath)) {
              req.url = '/Archiv' + req.url;
            }
          }
        } catch(e) { }
      }
      express.static(networkConfig.networkPath, {
        etag: false,
        lastModified: false,
        setHeaders: (res, filePath) => {
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.set('Pragma', 'no-cache');
          res.set('Expires', '0');
          res.set('Surrogate-Control', 'no-store');
          
          try {
            const stats = fs.statSync(filePath);
            console.log(`[Static Network] Serving: ${filePath} (mtime: ${stats.mtime.toISOString()})`);
          } catch (e) {
            console.log(`[Static Network] Serving: ${filePath} (no stats available)`);
          }
        }
      })(req, res, next);
    } else {
      res.status(404).json({ error: 'Netzwerkpfad nicht verfügbar' });
    }
  } catch (err) {
    console.error('Network files middleware error:', err);
    res.status(500).json({ error: 'Fehler beim Zugriff auf Netzwerkdateien' });
  }
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let destDir = uploadsDir;
    if (req.query.draftId) {
      destDir = path.join(uploadsDir, 'tmp', req.query.draftId);
    } else {
      destDir = path.join(uploadsDir, 'tmp');
    }
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    // Check if originalname seems to be UTF-8 decoded as latin1 (contains Ã)
    let decodedName = file.originalname;
    if (decodedName.includes('Ã')) {
      try {
        decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch(e) {}
    }
    // Set it back to the file object so subsequent middleware (like fileFilter) sees the fixed name
    file.originalname = decodedName;

    const ext = path.extname(file.originalname);
    const baseRaw = path.basename(file.originalname, ext);
    // Sanitize for Windows and general file systems
    const safeBase = baseRaw
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_') // Windows forbidden chars
      .replace(/\s+/g, ' ')            // normalize spaces
      .replace(/[^a-zA-Z0-9\-_.\u00C0-\u017F]/g, '_'); // keep common safe chars and umlaute

    let candidate = `${safeBase}${ext}`;
    let counter = 1;
    
    let destDir = uploadsDir;
    if (req.query.draftId) {
      destDir = path.join(uploadsDir, 'tmp', req.query.draftId);
    } else {
      destDir = path.join(uploadsDir, 'tmp');
    }

    while (fs.existsSync(path.join(destDir, candidate))) {
      candidate = `${safeBase} (${counter})${ext}`;
      counter += 1;
    }
    cb(null, candidate);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    // Accept all file types for now
    cb(null, true);
  }
});

// Memory storage for title images
const memoryUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for images
  fileFilter: (req, file, cb) => {
    if (file.originalname.includes('Ã')) {
      try {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch(e) {}
    }
    cb(null, true);
  }
});

// MongoDB Connection Setup
// Docker: mongodb://matchuser:matchpass@mongodb:27017/matchdb?authSource=matchdb
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'matchdb';

// Helper function: MongoDB connection
async function getDB() {
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  return { client, db };
}

// Helper function: Get or create YYYY_MM_DD order folder name
async function getOrCreateOrderFolderName(db, order) {
  if (order.networkFolderName) {
    return order.networkFolderName;
  }
  
  // Folder name: "Auftragsnummer - Projektname - Name des Auftrags" (Projektname optional für Abwärtskompatibilität)
  const orderNumber = order.orderNumber || order._id.toString();
  const sanitizedOrderTitle = (order.title || 'unnamed').trim().replace(/[\\/:*?"<>|]/g, '_');
  
  let folderName = `${orderNumber} - ${sanitizedOrderTitle}`;
  if (order.projectName && order.projectName.trim()) {
    const sanitizedProjectName = order.projectName.trim().replace(/[\\/:*?"<>|]/g, '_');
    folderName = `${orderNumber} - ${sanitizedProjectName} - ${sanitizedOrderTitle}`;
  }
  
  await db.collection('Order').updateOne(
    { _id: order._id },
    { $set: { networkFolderName: folderName } }
  );
  
  order.networkFolderName = folderName;
  return folderName;
}

// Helper function: Auto-migrate/organize order files
async function autoMigrateOrderFiles(db, orderId) {
  try {
    const order = await db.collection('Order').findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      console.log(`[File-Organization] Order ${orderId} not found`);
      return;
    }
    
    // Get folder name
    const orderFolderName = await getOrCreateOrderFolderName(db, order);
    
    // Get network config
    const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
    const isNetworkActive = networkConfig && networkConfig.networkPath && fs.existsSync(networkConfig.networkPath);
    
    // Base paths depending on whether we use network or local
    // All files go under uploads/ (no separate cam-files folder)
    let destBasePath;
    let urlPrefix;
    let isMigrated;
    
    if (isNetworkActive) {
      destBasePath = networkConfig.networkPath;
      urlPrefix = '/network-files';
      isMigrated = true;
    } else {
      destBasePath = uploadsDir;
      urlPrefix = ''; // Will result in /uploads/...
      isMigrated = false;
    }
    
    if (order.status === 'archived') {
      destBasePath = path.join(destBasePath, 'Archiv');
    }
    
    // Get documents to organize - process BOTH embedded and separate collection
    let documents = [];
    let documentsAreEmbedded = false;
    
    // 1. First get embedded documents if any
    if (order.documents && order.documents.length > 0) {
      documentsAreEmbedded = true;
      let embeddedDocs = [];
      if (isNetworkActive) {
        embeddedDocs = order.documents.filter(doc => !doc.migrated);
      } else {
        embeddedDocs = order.documents.filter(doc => doc.url && doc.url.startsWith('/uploads/') && !doc.url.includes(`/${orderFolderName}/`));
      }
      documents = [...embeddedDocs];
    }
    
    // 2. Always get documents from Document collection
    const docQuery = {
      orderId: new ObjectId(orderId),
      componentId: { $exists: false }
    };
    if (isNetworkActive) {
      docQuery.migrated = { $ne: true };
    } else {
      docQuery.url = { $regex: /^\/uploads\/(tmp\/[^\/]+\/)?[^\/]+$/ };
    }
    const collectionDocs = await db.collection('Document').find(docQuery).toArray();
    
    // Merge collection docs if they aren't already in the documents array
    for (const cDoc of collectionDocs) {
      if (!documents.some(d => d.url === cDoc.url)) {
        documents.push(cDoc);
      }
    }
    
    // Component documents
    const compDocQuery = {
      orderId: new ObjectId(orderId),
      componentId: { $exists: true }
    };
    if (isNetworkActive) {
      compDocQuery.migrated = { $ne: true };
    } else {
      compDocQuery.url = { $regex: /^\/uploads\/(tmp\/[^\/]+\/)?[^\/]+$/ };
    }
    const componentDocuments = await db.collection('Document').find(compDocQuery).toArray();
    
    // Destination folder paths
    const uploadsFolderPath = path.join(destBasePath, orderFolderName);
    if (!fs.existsSync(uploadsFolderPath)) {
      fs.mkdirSync(uploadsFolderPath, { recursive: true });
    }
    
    const migratedDocuments = [];
    
    // 1. Organize order documents
    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      try {
        let originalPath;
        if (document.url && document.url.startsWith('/uploads/')) {
          const relativePath = decodeURIComponent(document.url.substring('/uploads/'.length));
          originalPath = path.join(uploadsDir, relativePath);
        } else if (document.url && document.url.startsWith('/network-files/') && networkConfig && networkConfig.networkPath) {
          const relativePath = decodeURIComponent(document.url.substring('/network-files/'.length));
          originalPath = path.join(networkConfig.networkPath, relativePath);
        }
        
        if (!originalPath || !fs.existsSync(originalPath)) {
          // fallback to old logic
          const basename = path.basename(document.url);
          const flatPath = path.join(uploadsDir, basename);
          const tmpPath = path.join(uploadsDir, 'tmp', basename);
          const localOrganizedPath = path.join(uploadsDir, orderFolderName, basename);
          
          if (fs.existsSync(flatPath)) originalPath = flatPath;
          else if (fs.existsSync(tmpPath)) originalPath = tmpPath;
          else if (fs.existsSync(localOrganizedPath)) originalPath = localOrganizedPath;
          else continue;
        }
        
        const basename = path.basename(document.url);
        
        const fileName = document.name || basename;
        const normalizedFileName = fileName.normalize('NFC');
        const destinationPath = path.join(uploadsFolderPath, normalizedFileName);
        
        fs.copyFileSync(originalPath, destinationPath);
        
        const encodedFileName = encodeURIComponent(normalizedFileName);
        const relativeUrlPath = `/${orderFolderName}/${encodedFileName}`;
        const targetUrl = isNetworkActive 
          ? `/network-files${relativeUrlPath}`
          : `/uploads${relativeUrlPath}`;
        
        // Determine if this specific document is embedded
        const isEmbedded = order.documents && order.documents.some(d => d.url === document.url);
        
        if (isEmbedded) {
          migratedDocuments.push({
            originalIndex: order.documents.findIndex(d => d.url === document.url),
            targetUrl,
            networkPath: isNetworkActive ? destinationPath : undefined,
            migrated: isMigrated
          });
        }
        
        // ALWAYS update the Document collection record if it exists
        await db.collection('Document').updateOne(
          { _id: document._id },
          { 
            $set: { 
              url: targetUrl,
              networkPath: isNetworkActive ? destinationPath : undefined,
              originalUrl: document.originalUrl || document.url,
              originalName: normalizedFileName,
              migrated: isMigrated,
              migratedAt: isMigrated ? new Date() : undefined
            }
          }
        );
        
        if (originalPath !== destinationPath) {
          try {
            fs.unlinkSync(originalPath);
          } catch (e) {}
        }
      } catch (err) {
        console.error(`[File-Organization] Error organizing order document:`, err);
      }
    }
    
    // 2. Organize component documents
    console.log(`[File-Organization] Found ${componentDocuments.length} component documents to migrate.`);
    for (const compDoc of componentDocuments) {
      try {
        console.log(`[File-Organization] Processing component document: ${compDoc.url}`);
        // Get numbered folder name e.g. "01_Motorhalterung_x3" or "01_Motorhalterung" if it already exists
        const componentFolderName = await getComponentFolderName(db, orderId, compDoc.componentId, uploadsFolderPath);
        
        const componentFolderPath = path.join(uploadsFolderPath, componentFolderName);
        if (!fs.existsSync(componentFolderPath)) {
          fs.mkdirSync(componentFolderPath, { recursive: true });
        }
        
        let originalPath;
        if (compDoc.url && compDoc.url.startsWith('/uploads/')) {
          const relativePath = decodeURIComponent(compDoc.url.substring('/uploads/'.length));
          originalPath = path.join(uploadsDir, relativePath);
        } else if (compDoc.url && compDoc.url.startsWith('/network-files/') && networkConfig && networkConfig.networkPath) {
          const relativePath = decodeURIComponent(compDoc.url.substring('/network-files/'.length));
          originalPath = path.join(networkConfig.networkPath, relativePath);
        }
        
        console.log(`[File-Organization] Resolved originalPath: ${originalPath}, exists: ${fs.existsSync(originalPath)}`);
        
        if (!originalPath || !fs.existsSync(originalPath)) {
          // fallback to old logic
          const basename = path.basename(compDoc.url);
          const flatPath = path.join(uploadsDir, basename);
          const tmpPath = path.join(uploadsDir, 'tmp', basename);
          const localCompPath = path.join(uploadsDir, orderFolderName, componentFolderName, basename);
          
          if (fs.existsSync(flatPath)) originalPath = flatPath;
          else if (fs.existsSync(tmpPath)) originalPath = tmpPath;
          else if (fs.existsSync(localCompPath)) originalPath = localCompPath;
          else {
            console.log(`[File-Organization] SKIPPING component document, file not found in any path.`);
            continue;
          }
        }
        
        const basename = path.basename(compDoc.url);
        
        const fileName = compDoc.name || basename;
        const normalizedFileName = fileName.normalize('NFC');
        const destinationPath = path.join(componentFolderPath, normalizedFileName);
        
        console.log(`[File-Organization] Copying from ${originalPath} to ${destinationPath}`);
        fs.copyFileSync(originalPath, destinationPath);
        
        const encodedFileName = encodeURIComponent(normalizedFileName);
        const encodedComponentFolderName = encodeURIComponent(componentFolderName);
        const relativeUrlPath = `/${orderFolderName}/${encodedComponentFolderName}/${encodedFileName}`;
        const targetUrl = isNetworkActive 
          ? `/network-files${relativeUrlPath}`
          : `/uploads${relativeUrlPath}`;
        
        await db.collection('Document').updateOne(
          { _id: compDoc._id },
          { 
            $set: { 
              url: targetUrl,
              networkPath: isNetworkActive ? destinationPath : undefined,
              originalUrl: compDoc.originalUrl || compDoc.url,
              originalName: normalizedFileName,
              migrated: isMigrated,
              migratedAt: isMigrated ? new Date() : undefined
            }
          }
        );
        
        if (originalPath !== destinationPath) {
          try {
            fs.unlinkSync(originalPath);
          } catch (e) {}
        }
      } catch (err) {
        console.error(`[File-Organization] Error organizing component document:`, err);
      }
    }
    
    // 3. Ensure all component folders exist, even if they have no documents
    const allComponents = await db.collection('Component').find({ orderId: new ObjectId(orderId) }).toArray();
    for (const comp of allComponents) {
      try {
        const componentFolderName = await getComponentFolderName(db, orderId, comp._id, uploadsFolderPath);
        const componentFolderPath = path.join(uploadsFolderPath, componentFolderName);
        if (!fs.existsSync(componentFolderPath)) {
          fs.mkdirSync(componentFolderPath, { recursive: true });
        }
      } catch (err) {
        console.error(`[File-Organization] Error creating empty component folder:`, err);
      }
    }

    // Update embedded documents in Order
    if (documentsAreEmbedded && migratedDocuments.length > 0) {
      const updatedDocuments = order.documents.map((doc, idx) => {
        const migrated = migratedDocuments.find(m => m.originalIndex === idx);
        if (migrated) {
          const updatedDoc = {
            ...doc,
            url: migrated.targetUrl,
            migrated: migrated.migrated,
            migratedAt: migrated.migrated ? new Date() : undefined
          };
          if (migrated.networkPath) {
            updatedDoc.networkPath = migrated.networkPath;
          }
          return updatedDoc;
        }
        return doc;
      });
      
      await db.collection('Order').updateOne(
        { _id: new ObjectId(orderId) },
        { $set: { documents: updatedDocuments } }
      );
    }
    
    console.log(`[File-Organization] Successfully organized files for order ${orderId} (Network Active: ${isNetworkActive})`);
  } catch (err) {
    console.error(`[File-Organization] Global error organizing files for order ${orderId}:`, err);
  }
}

// Helper function: Get numbered component folder name (e.g. "02_Motorhalterung_x3" or "02_Motorhalterung" fallback)
async function getComponentFolderName(db, orderId, componentId, basePath = null) {
  // Sort all components for this order by creation time to get a stable index
  const allComponents = await db.collection('Component').find(
    { orderId: new ObjectId(orderId) }
  ).sort({ createdAt: 1, _id: 1 }).toArray();
  
  const idx = allComponents.findIndex(c => c._id.toString() === componentId.toString());
  const number = String(idx >= 0 ? idx + 1 : allComponents.length).padStart(2, '0');
  
  const component = allComponents.find(c => c._id.toString() === componentId.toString());
  const componentName = component ? (component.title || component.name || 'Bauteil') : 'Bauteil';
  const sanitizedName = componentName.trim().replace(/[\\/:*?"<>|]/g, '_');
  
  const quantity = component && component.quantity ? component.quantity : 1;
  
  const newName = `${number}_${sanitizedName}_x${quantity}`;
  const oldName = `${number}_${sanitizedName}`;

  if (basePath) {
    if (fs.existsSync(path.join(basePath, newName))) {
      return newName;
    }
    if (fs.existsSync(path.join(basePath, oldName))) {
      return oldName;
    }
  }
  
  return newName;
}

// Initialize MongoDB indexes on startup
async function initializeIndexes() {
  try {
    const { client, db } = await getDB();
    console.log('[MongoDB] Creating indexes...');
    
    // Order indexes
    await db.collection('Order').createIndex({ orderNumber: 1 }, { unique: true, sparse: true });
    await db.collection('Order').createIndex({ clientId: 1 });
    await db.collection('Order').createIndex({ status: 1 });
    await db.collection('Order').createIndex({ createdAt: -1 });
    await db.collection('Order').createIndex({ deadline: 1 });
    await db.collection('Order').createIndex({ assignedTo: 1 });
    
    // User indexes
    await db.collection('User').createIndex({ username: 1 }, { unique: true });
    await db.collection('User').createIndex({ role: 1 });
    await db.collection('User').createIndex({ isActive: 1 });
    
    // Document indexes
    await db.collection('Document').createIndex({ orderId: 1 });
    
    // NoteHistory indexes
    await db.collection('NoteHistory').createIndex({ orderId: 1 });
    await db.collection('NoteHistory').createIndex({ createdAt: -1 });
    
    // Component indexes
    await db.collection('Component').createIndex({ orderId: 1 });
    
    // ComponentDocument indexes
    await db.collection('ComponentDocument').createIndex({ componentId: 1 });
    
    // SystemConfig indexes
    await db.collection('SystemConfig').createIndex({ key: 1 }, { unique: true });
    
    // Settings indexes
    await db.collection('settings').createIndex({ type: 1 }, { unique: true });
    
    // Session indexes
    await db.collection('Session').createIndex({ token: 1 }, { unique: true });
    await db.collection('Session').createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 * 7 }); // 7 days expiry
    
    // Material indexes
    await db.collection('Material').createIndex({ name: 1 }, { unique: true });
    
    await client.close();
    console.log('[MongoDB] Indexes created successfully');
  } catch (error) {
    console.error('[MongoDB] Error creating indexes:', error.message);
  }
}

// Create default admin user if none exists
async function ensureDefaultAdmin() {
  try {
    const { client, db } = await getDB();
    
    // Check if any admin user exists
    const adminCount = await db.collection('User').countDocuments({ role: 'admin' });
    
    if (adminCount === 0) {
      console.log('[MongoDB] No admin found, creating default admin...');
      
      const defaultAdmin = {
        username: 'admin',
        password: 'admin123',
        name: 'System Administrator',
        role: 'admin',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('User').insertOne(defaultAdmin);
      console.log('✓ Default admin created successfully');
      console.log('  Username: admin');
      console.log('  Password: admin123');
      console.log('  ⚠️  BITTE PASSWORT NACH ERSTEM LOGIN ÄNDERN!');
    }
    
    await client.close();
  } catch (error) {
    console.error('[MongoDB] Error ensuring default admin:', error.message);
  }
}

// Helper function: Convert MongoDB document to response format
function convertMongoDoc(doc) {
  if (!doc) return null;

  const normalizedRole = normalizeUserRole(doc.role);
  return {
    ...doc,
    role: normalizedRole || doc.role,
    id: doc._id.toString(),
    _id: undefined
  };
}

const roleHierarchy = {
  guest: 0,
  client: 1,
  employee: 2,
  manager: 3,
  admin: 4
};

function normalizeUserRole(role) {
  if (!role) return role;

  const roleMap = {
    kunde: 'client',
    auftraggeber: 'client',
    client: 'client',
    werkstatt: 'employee',
    workshop: 'employee',
    werkstattmitarbeiter: 'employee',
    manager: 'manager',
    werkstattleitung: 'manager',
    admin: 'admin',
    guest: 'guest',
    gast: 'guest'
  };

  return roleMap[role.toLowerCase()] || role;
}

function normalizeIncomingRole(role) {
  const normalized = normalizeUserRole(role);
  if (Object.prototype.hasOwnProperty.call(roleHierarchy, normalized)) {
    return normalized;
  }
  return null;
}

// Security Middleware
function requireRoleLevel(minRole) {
  const minLevel = roleHierarchy[minRole] || 0;
  return async (req, res, next) => {
    // Determine the user's role using secure session cookies.
    const cookies = parseCookies(req);
    let normalizedRole = null;
    
    if (cookies.sessionId) {
      const { client, db } = await getDB();
      const session = await db.collection('Session').findOne({ token: cookies.sessionId });
      await client.close();
      if (session && session.role) {
        normalizedRole = normalizeUserRole(session.role);
      }
    }
    
    // Fallback for missing cookies (for backward compatibility if needed, but insecure)
    if (!normalizedRole) {
      const viewerRole = (req.query.viewerRole || req.headers['x-viewer-role'] || '').toString().toLowerCase();
      normalizedRole = normalizeUserRole(viewerRole);
    }
    
    if (!normalizedRole || !Object.prototype.hasOwnProperty.call(roleHierarchy, normalizedRole)) {
      return res.status(401).json({ error: 'Nicht authentifiziert oder ungültige Rolle' });
    }

    const userLevel = roleHierarchy[normalizedRole];
    if (userLevel < minLevel) {
      return res.status(403).json({ error: `Zugriff verweigert. Erfordert mindestens Level ${minRole}.` });
    }

    req.userRole = normalizedRole; // pass down to route
    next();
  };
}

// Helper function: Convert array of MongoDB documents
function convertMongoDocs(docs) {
  return docs.map(convertMongoDoc);
}

async function parseViewerRole(req) {
  const cookies = parseCookies(req);
  if (cookies.sessionId) {
    const { client, db } = await getDB();
    const session = await db.collection('Session').findOne({ token: cookies.sessionId });
    await client.close();
    if (session && session.role) {
      const normalized = normalizeUserRole(session.role);
      return Object.prototype.hasOwnProperty.call(roleHierarchy, normalized) ? normalized : null;
    }
  }
  const viewerRole = (req.query.viewerRole || req.headers['x-viewer-role'] || '').toString().toLowerCase();
  const normalized = normalizeUserRole(viewerRole);
  return Object.prototype.hasOwnProperty.call(roleHierarchy, normalized) ? normalized : null;
}

async function sanitizeOrderForViewer(order, viewerRole, db) {
  let sanitized = order;
  if (viewerRole === 'client') {
    const { internalWorkshopNote, ...orderWithoutInternalNote } = sanitized;
    sanitized = orderWithoutInternalNote;
  }
  
  if (viewerRole === 'client' || viewerRole === 'guest') {
    const settingsColl = db.collection('settings');
    const config = await settingsColl.findOne({ type: 'file-visibility-config' });
    const restrictedExts = (config && config.restrictedExtensions) ? config.restrictedExtensions.map(e => e.toLowerCase()) : [];
    
    if (restrictedExts.length > 0) {
      const isRestricted = (filename) => {
        if (!filename) return false;
        const ext = '.' + filename.split('.').pop().toLowerCase();
        return restrictedExts.includes(ext);
      };
      
      if (sanitized.documents) {
        sanitized.documents = sanitized.documents.filter(doc => !isRestricted(doc.name));
      }
      
      if (sanitized.components) {
        sanitized.components = sanitized.components.map(comp => {
          if (comp.documents) {
            comp.documents = comp.documents.filter(doc => !isRestricted(doc.name));
          }
          return comp;
        });
      }
    }
  }
  
  return sanitized;
}

function parseQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}

function isStaticIpPath(networkPath) {
  if (!networkPath || typeof networkPath !== 'string') {
    return false;
  }

  const normalized = networkPath.trim();
  const uncIpRegex = /^\\\\(?:\d{1,3}\.){3}\d{1,3}\\/;
  return uncIpRegex.test(normalized);
}

// === FILE UPLOAD API ===
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    console.log('File uploaded:', req.file.originalname, 'as', req.file.filename);
    
    res.json({
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.query.draftId ? `/uploads/tmp/${req.query.draftId}/${req.file.filename}` : `/uploads/tmp/${req.file.filename}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload fehlgeschlagen', details: error.message });
  }
});

app.delete('/api/upload/tmp/:draftId', (req, res) => {
  try {
    const draftId = req.params.draftId;
    if (!draftId) return res.status(400).json({ error: 'Missing draftId' });
    
    // Prevent directory traversal
    if (draftId.includes('..') || draftId.includes('/') || draftId.includes('\\')) {
      return res.status(400).json({ error: 'Invalid draftId' });
    }
    
    const draftDir = path.join(uploadsDir, 'tmp', draftId);
    if (fs.existsSync(draftDir)) {
      fs.rmSync(draftDir, { recursive: true, force: true });
      console.log(`Deleted temporary draft folder: ${draftDir}`);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tmp folder error:', error);
    res.status(500).json({ error: 'Löschen fehlgeschlagen', details: error.message });
  }
});

// === MATERIALS API ===
app.get('/api/materials', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const materials = await db.collection('Material').find({}).sort({ name: 1 }).toArray();
    await client.close();
    res.json(convertMongoDocs(materials));
  } catch (err) {
    console.error('GET /api/materials error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Materialien', details: err.message });
  }
});

app.post('/api/materials', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }
    
    const { client, db } = await getDB();
    const exists = await db.collection('Material').findOne({ name: name.trim() });
    if (exists) {
      await client.close();
      return res.status(409).json({ error: 'Material existiert bereits' });
    }
    
    const newMaterial = { name: name.trim(), createdAt: new Date() };
    const result = await db.collection('Material').insertOne(newMaterial);
    await client.close();
    
    res.status(201).json(convertMongoDoc({ ...newMaterial, _id: result.insertedId }));
  } catch (err) {
    console.error('POST /api/materials error:', err);
    res.status(500).json({ error: 'Fehler beim Anlegen des Materials', details: err.message });
  }
});

app.put('/api/materials/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const { client, db } = await getDB();
    
    // Check if name is already taken by another material
    const existing = await db.collection('Material').findOne({ 
      name: name.trim(),
      _id: { $ne: new ObjectId(req.params.id) }
    });
    
    if (existing) {
      await client.close();
      return res.status(409).json({ error: 'Ein anderes Material mit diesem Namen existiert bereits' });
    }

    const result = await db.collection('Material').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { name: name.trim() } },
      { returnDocument: 'after' }
    );
    await client.close();

    if (!result) {
      return res.status(404).json({ error: 'Material nicht gefunden' });
    }

    res.json(convertMongoDoc(result));
  } catch (err) {
    console.error('PUT /api/materials error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Materials', details: err.message });
  }
});

app.delete('/api/materials/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const result = await db.collection('Material').deleteOne({ _id: new ObjectId(req.params.id) });
    await client.close();

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Material nicht gefunden' });
    }

    res.json({ success: true, message: 'Material gelöscht' });
  } catch (err) {
    console.error('DELETE /api/materials error:', err);
    res.status(500).json({ error: 'Fehler beim Löschen des Materials', details: err.message });
  }
});

// === COST CENTERS API ===
app.get('/api/cost-centers', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const costCenters = await db.collection('CostCenter').find({}).toArray();
    await client.close();
    res.json(convertMongoDocs(costCenters));
  } catch (err) {
    console.error('GET /api/cost-centers error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Kostenstellen', details: err.message });
  }
});

app.post('/api/cost-centers', async (req, res) => {
  try {
    const { number, projectName } = req.body;
    if (!number || !projectName) {
      return res.status(400).json({ error: 'Nummer und Projektname sind erforderlich' });
    }

    const { client, db } = await getDB();
    const existing = await db.collection('CostCenter').findOne({ number });
    if (existing) {
      await client.close();
      return res.status(400).json({ error: 'Eine Kostenstelle mit dieser Nummer existiert bereits' });
    }

    const newCostCenter = {
      number,
      projectName,
      createdAt: new Date().toISOString()
    };

    const result = await db.collection('CostCenter').insertOne(newCostCenter);
    await client.close();

    res.status(201).json({ id: result.insertedId.toString(), ...newCostCenter });
  } catch (err) {
    console.error('POST /api/cost-centers error:', err);
    res.status(500).json({ error: 'Fehler beim Erstellen der Kostenstelle', details: err.message });
  }
});

app.put('/api/cost-centers/:id', async (req, res) => {
  try {
    const { number, projectName } = req.body;
    if (!number || !projectName) {
      return res.status(400).json({ error: 'Nummer und Projektname sind erforderlich' });
    }

    const { client, db } = await getDB();
    
    // Check if another cost center has this number
    const existing = await db.collection('CostCenter').findOne({ 
      number, 
      _id: { $ne: new ObjectId(req.params.id) } 
    });
    
    if (existing) {
      await client.close();
      return res.status(400).json({ error: 'Eine andere Kostenstelle mit dieser Nummer existiert bereits' });
    }

    const result = await db.collection('CostCenter').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { number, projectName } }
    );
    await client.close();

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Kostenstelle nicht gefunden' });
    }

    res.json({ success: true, message: 'Kostenstelle aktualisiert' });
  } catch (err) {
    console.error('PUT /api/cost-centers error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Kostenstelle', details: err.message });
  }
});

app.delete('/api/cost-centers/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const result = await db.collection('CostCenter').deleteOne({ _id: new ObjectId(req.params.id) });
    await client.close();

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Kostenstelle nicht gefunden' });
    }

    res.json({ success: true, message: 'Kostenstelle gelöscht' });
  } catch (err) {
    console.error('DELETE /api/cost-centers error:', err);
    res.status(500).json({ error: 'Fehler beim Löschen der Kostenstelle', details: err.message });
  }
});

// === USERS API ===
app.get('/api/users', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const users = await db.collection('User').find({}).toArray();
    await client.close();
    
    res.json(convertMongoDocs(users));
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Nutzer', details: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    let { username, password, name, role, email, tableConfig } = req.body;
    if (username) username = username.toLowerCase();
    const { client, db } = await getDB();
    
    // Check if user exists
    const exists = await db.collection('User').findOne({ username });
    if (exists) {
      await client.close();
      return res.status(409).json({ error: 'Benutzername bereits vergeben' });
    }
    
    // Create user
    const newUser = {
      username,
      password,
      name,
      email,
      role: role || 'guest',
      tableConfig: tableConfig || {},
      isActive: true,
      isApproved: true,
      authSource: 'local',
      createdAt: new Date()
    };
    
    const result = await db.collection('User').insertOne(newUser);
    await client.close();
    
    res.status(201).json(convertMongoDoc({ ...newUser, _id: result.insertedId }));
  } catch (err) {
    console.error('POST /api/users error:', err);
    res.status(500).json({ error: 'Fehler beim Anlegen des Nutzers', details: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    let { username, password } = req.body;
    if (username) username = username.toLowerCase();

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Benutzername und Passwort erforderlich' });
    }

    console.log(`[HYBRID-AUTH] Login-Versuch für: ${username}`);
    
    let userInfo = null;
    let authSource = 'local';

    // 1. Versuche LDAP-Authentifizierung
    try {
      console.log('[HYBRID-AUTH] Versuche LDAP-Authentifizierung...');
      userInfo = await ldapAuth.authenticate(username, password);
      
      if (userInfo) {
        authSource = 'ldap';
        console.log('[HYBRID-AUTH] LDAP-Authentifizierung erfolgreich');

        // Fetch real email using the user's credentials
        try {
          const realEmail = await ldapSearch.findUserEmailWithCredentials(username, username, password);
          if (realEmail) {
            userInfo.email = realEmail;
            console.log(`[HYBRID-AUTH] Echte E-Mail aus LDAP geladen: ${realEmail}`);
          } else {
            console.log(`[HYBRID-AUTH] Keine E-Mail im LDAP gefunden, nutze Fallback: ${userInfo.email}`);
          }
        } catch (emailErr) {
          console.error('[HYBRID-AUTH] Fehler beim Abrufen der echten E-Mail:', emailErr.message);
        }
        
        // Hole oder erstelle lokalen Benutzer-Eintrag für Rollen-Management
        const { client, db } = await getDB();
        
        let localUser = await db.collection('User').findOne({ 
          $or: [
            { username: userInfo.username },
            { email: userInfo.email }
          ]
        });

        if (localUser) {
          console.log('[HYBRID-AUTH] Lokaler Benutzer gefunden - aktualisiere LDAP-Daten');
          const normalizedRole = normalizeIncomingRole(localUser.role) || 'client';

          // Aktualisiere LDAP-Daten, behalte lokale Rollen
          await db.collection('User').updateOne(
            { _id: localUser._id },
            {
              $set: {
                email: userInfo.email,
                name: userInfo.name,
                role: normalizedRole,
                lastLdapLogin: new Date(),
                authSource: 'ldap'
              }
            }
          );
          localUser = await db.collection('User').findOne({ _id: localUser._id });
        } else {
          console.log('[HYBRID-AUTH] Neuer LDAP-Benutzer - erstelle lokalen Eintrag');
          // Erstelle neuen lokalen Benutzer mit Standard-Rolle
          const newUser = {
            username: userInfo.username,
            email: userInfo.email,
            name: userInfo.name,
            role: 'guest', // Standard-Rolle für neue LDAP-Benutzer ist Gast
            isApproved: false, // LDAP-Benutzer müssen manuell freigeschaltet werden, es sei denn, sie haben eine höhere Rolle
            authSource: 'ldap',
            createdAt: new Date(),
            lastLdapLogin: new Date()
          };
          
          const result = await db.collection('User').insertOne(newUser);
          localUser = await db.collection('User').findOne({ _id: result.insertedId });

          // Benachrichtige Admins und Werkstattleitung über neuen Benutzer
          try {
            const adminUsers = await db.collection('User').find({ role: { $in: ['admin', 'manager'] } }).toArray();
            const adminEmails = adminUsers.map(u => u.email).filter(email => email);
            if (adminEmails.length > 0) {
              await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: adminEmails.join(','),
                subject: 'Match-Werkstatt: Neuer Benutzer registriert',
                text: `Ein neuer Benutzer (${userInfo.username}) hat sich registriert und benötigt eine Rolle.`,
                encoding: 'utf-8'
              });
              console.log('[HYBRID-AUTH] Benachrichtigung an Admins gesendet');
            }
          } catch (mailError) {
            console.error('[HYBRID-AUTH] Fehler beim Senden der Benachrichtigungs-E-Mail:', mailError);
          }
        }
        
        await client.close();
        
        // Generate and store session token
        const sessionId = crypto.randomBytes(32).toString('hex');
        const { client: sessionClient, db: sessionDb } = await getDB();
        await sessionDb.collection('Session').insertOne({
          token: sessionId,
          userId: localUser._id,
          role: localUser.role,
          createdAt: new Date()
        });
        await sessionClient.close();
        
        res.cookie('sessionId', sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        
        // Erfolgreiche LDAP-Authentifizierung mit lokalen Rollen
        return res.json({ 
          success: true, 
          user: convertMongoDoc(localUser),
          authSource: 'ldap'
        });
      }
    } catch (ldapError) {
      console.error('[HYBRID-AUTH] LDAP-Authentifizierung fehlgeschlagen:', ldapError.message);
    }

    // 2. Fallback auf lokale Authentifizierung
    console.log('[HYBRID-AUTH] Fallback auf lokale Authentifizierung...');
    const { client, db } = await getDB();
    
    const user = await db.collection('User').findOne({ username });
    await client.close();
    
    if (user && user.password === password) {
      console.log('[HYBRID-AUTH] Lokale Authentifizierung erfolgreich');
      const normalizedRole = normalizeIncomingRole(user.role) || 'client';
      
      if (normalizedRole === 'guest' && user.isApproved === false) {
        // Guests are allowed to login to see the waiting screen
      } else if (normalizedRole === 'client' && user.isApproved === false) {
        return res.status(403).json({ success: false, message: 'Account noch nicht bestätigt' });
      }
      
      // Generate and store session token
      const sessionId = crypto.randomBytes(32).toString('hex');
      const { client: sessionClient, db: sessionDb } = await getDB();
      await sessionDb.collection('Session').insertOne({
        token: sessionId,
        userId: user._id,
        role: normalizedRole,
        createdAt: new Date()
      });
      await sessionClient.close();
      
      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      return res.json({ 
        success: true, 
        user: convertMongoDoc({ ...user, role: normalizedRole }),
        authSource: 'local'
      });
    }

    // 3. Beide Authentifizierungen fehlgeschlagen
    console.log('[HYBRID-AUTH] Alle Authentifizierungen fehlgeschlagen');
    res.status(401).json({ success: false, message: 'Ungültige Zugangsdaten' });
    
  } catch (err) {
    console.error('POST /api/login error:', err);
    res.status(500).json({ success: false, message: 'Serverfehler beim Login', error: err.message });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    const cookies = parseCookies(req);
    if (cookies.sessionId) {
      const { client, db } = await getDB();
      await db.collection('Session').deleteOne({ token: cookies.sessionId });
      await client.close();
    }
    res.clearCookie('sessionId');
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false });
  }
});

// File Restrictions Settings APIs
app.get('/api/admin/file-restrictions', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const config = await db.collection('settings').findOne({ type: 'file-visibility-config' });
    await client.close();
    res.json({ success: true, restrictedExtensions: config?.restrictedExtensions || [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/file-restrictions', async (req, res) => {
  try {
    const { restrictedExtensions } = req.body;
    const { client, db } = await getDB();
    await db.collection('settings').updateOne(
      { type: 'file-visibility-config' },
      { $set: { restrictedExtensions: Array.isArray(restrictedExtensions) ? restrictedExtensions : [] } },
      { upsert: true }
    );
    await client.close();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// LDAP Test-Endpunkt
app.get('/api/ldap/test', async (req, res) => {
  try {
    console.log('[LDAP-TEST] Testing LDAP connection...');
    const isConnected = await ldapAuth.testConnection();
    
    res.json({
      success: true,
      ldapConnected: isConnected,
      config: {
        host: ldapConfig.host,
        port: ldapConfig.port,
        baseDN: ldapConfig.baseDN,
        userSearchBase: ldapConfig.userSearchBase,
        domain: ldapConfig.domain
      },
      message: isConnected ? 'LDAP-Verbindung erfolgreich' : 'LDAP-Verbindung fehlgeschlagen'
    });
  } catch (err) {
    console.error('[LDAP-TEST] Error:', err);
    res.status(500).json({
      success: false,
      ldapConnected: false,
      error: err.message
    });
  }
});

app.post('/api/ldap/test-auth', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username und Passwort erforderlich' });
    }

    const userInfo = await ldapAuth.authenticate(username, password);
    if (!userInfo) {
      return res.status(401).json({ success: false, message: 'LDAP-Authentifizierung fehlgeschlagen' });
    }

    return res.json({ success: true, user: userInfo });
  } catch (err) {
    console.error('[LDAP-TEST-AUTH] Error:', err);
    return res.status(500).json({ success: false, message: 'Fehler beim LDAP-Test', error: err.message });
  }
});

app.get('/api/ldap/users', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const users = await db.collection('User').find({
      $or: [
        { authSource: 'ldap' },
        { lastLdapLogin: { $exists: true } },
        { lastLdapSync: { $exists: true } }
      ]
    }).sort({ username: 1 }).toArray();
    await client.close();

    const mappedUsers = users.map((user) => ({
      username: user.username,
      email: user.email || null,
      displayName: user.name || null,
      localRole: normalizeIncomingRole(user.role),
      lastSync: (user.lastLdapLogin || user.lastLdapSync || user.updatedAt || user.createdAt || null)
    }));

    return res.json({ success: true, users: mappedUsers });
  } catch (err) {
    console.error('[LDAP-USERS] Error:', err);
    return res.status(500).json({ success: false, message: 'Fehler beim Laden der LDAP-Benutzer', error: err.message });
  }
});

app.post('/api/ldap/sync', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const result = await db.collection('User').updateMany(
      {
        $or: [
          { authSource: 'ldap' },
          { lastLdapLogin: { $exists: true } }
        ]
      },
      {
        $set: {
          authSource: 'ldap',
          lastLdapSync: new Date()
        }
      }
    );
    await client.close();

    return res.json({
      success: true,
      synchronized: result.modifiedCount,
      message: 'LDAP-Benutzer wurden markiert/synchronisiert'
    });
  } catch (err) {
    console.error('[LDAP-SYNC] Error:', err);
    return res.status(500).json({ success: false, message: 'Fehler bei der LDAP-Synchronisation', error: err.message });
  }
});

app.put('/api/ldap/users/:username/role', async (req, res) => {
  try {
    const normalizedRole = normalizeIncomingRole(req.body.role);
    if (!normalizedRole) {
      return res.status(400).json({ success: false, message: 'Ungültige Rolle' });
    }

    const { client, db } = await getDB();
    const user = await db.collection('User').findOne({ username: req.params.username });

    if (!user) {
      await client.close();
      return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    }

    await db.collection('User').updateOne(
      { _id: user._id },
      {
        $set: {
          role: normalizedRole,
          roleUpdatedAt: new Date()
        }
      }
    );

    // E-Mail Benachrichtigung bei Rollenänderung
    if (user.role !== normalizedRole && user.email) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: user.email,
          subject: 'Match-Werkstatt: Rolle aktualisiert',
          text: `Hallo ${user.name || user.username},\n\ndeine Rolle in der Match-Werkstatt wurde aktualisiert auf: ${normalizedRole}.\nDu kannst das Tool nun entsprechend nutzen.`,
          encoding: 'utf-8'
        });
      } catch (mailError) {
        console.error('[LDAP-ROLE-UPDATE] Fehler beim Senden der E-Mail:', mailError);
      }
    }

    await client.close();
    return res.json({ success: true, message: `Rolle auf '${normalizedRole}' aktualisiert` });
  } catch (err) {
    console.error('[LDAP-ROLE-UPDATE] Error:', err);
    return res.status(500).json({ success: false, message: 'Fehler beim Aktualisieren der Rolle', error: err.message });
  }
});

// LDAP Benutzer-Rolle aktualisieren
app.put('/api/users/:id/role', async (req, res) => {
  try {
    const role = normalizeIncomingRole(req.body.role);
    if (!role) {
      return res.status(400).json({ error: 'Ungültige Rolle' });
    }
    const { client, db } = await getDB();
    
    console.log(`[HYBRID-AUTH] Aktualisiere Rolle für Benutzer ${req.params.id} zu: ${role}`);
    
    // Prevent changing the primary admin's role
    const targetUser = await db.collection('User').findOne({ _id: new ObjectId(req.params.id) });
    if (targetUser && targetUser.username === 'admin') {
      await client.close();
      return res.status(403).json({ error: 'Die Rolle des primären Administrators kann nicht geändert werden' });
    }

    const result = await db.collection('User').updateOne(
      { _id: new ObjectId(req.params.id) },
      { 
        $set: { 
          role: role,
          roleUpdatedAt: new Date()
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      await client.close();
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    
    const updatedUser = await db.collection('User').findOne({ _id: new ObjectId(req.params.id) });
    
    // E-Mail Benachrichtigung bei Rollenänderung
    if (targetUser.role !== role && updatedUser.email) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: updatedUser.email,
          subject: 'Match-Werkstatt: Rolle aktualisiert',
          text: `Hallo ${updatedUser.name || updatedUser.username},\n\ndeine Rolle in der Match-Werkstatt wurde aktualisiert auf: ${role}.\nDu kannst das Tool nun entsprechend nutzen.`,
          encoding: 'utf-8'
        });
      } catch (mailError) {
        console.error('PUT /api/users/:id/role Fehler beim Senden der E-Mail:', mailError);
      }
    }

    // Broadcast updated users list
    const wss = req.app.get('wss');
    if (wss) {
      const allUsers = await db.collection('User').find({}).toArray();
      const payload = allUsers.map(convertMongoDoc);
      const msg = JSON.stringify({ type: 'usersUpdated', payload });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
    }

    await client.close();
    
    res.json({ 
      success: true, 
      user: convertMongoDoc(updatedUser),
      message: `Rolle erfolgreich zu '${role}' geändert`
    });
  } catch (err) {
    console.error('PUT /api/users/:id/role error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Rolle', details: err.message });
  }
});

// LDAP Benutzer-Synchronisation (für Admins)
app.post('/api/ldap/sync-user', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username erforderlich' });
    }

    console.log(`[LDAP-SYNC] Synchronisiere Benutzer: ${username}`);
    
    // Versuche LDAP-Lookup (ohne Passwort-Validierung)
    const { client, db } = await getDB();
    
    let existingUser = await db.collection('User').findOne({ username });
    
    if (existingUser) {
      // Markiere als LDAP-Benutzer
      await db.collection('User').updateOne(
        { _id: existingUser._id },
        {
          $set: {
            authSource: 'ldap',
            lastLdapSync: new Date()
          }
        }
      );
      
      const updatedUser = await db.collection('User').findOne({ _id: existingUser._id });
      await client.close();
      
      res.json({ 
        success: true, 
        action: 'updated',
        user: convertMongoDoc(updatedUser),
        message: 'Benutzer als LDAP-Benutzer markiert'
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht in lokaler Datenbank gefunden. Benutzer muss sich einmal anmelden.'
      });
    }
    
    await client.close();
  } catch (err) {
    console.error('[LDAP-SYNC] Error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler bei der LDAP-Synchronisation', 
      error: err.message 
    });
  }
});

app.patch('/api/users/:id/approve', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
    const result = await db.collection('User').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isApproved: true } }
    );
    
    if (result.matchedCount === 0) {
      await client.close();
      return res.status(404).json({ error: 'User nicht gefunden' });
    }
    
    const user = await db.collection('User').findOne({ _id: new ObjectId(req.params.id) });
    await client.close();
    
    res.json(convertMongoDoc(user));
  } catch (err) {
    console.error('PATCH /api/users/:id/approve error:', err);
    res.status(500).json({ error: 'Fehler beim Bestätigen des Nutzers', details: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    console.log('PUT /api/users/:id - ID:', req.params.id);
    console.log('PUT /api/users/:id - Body:', req.body);
    
    const { client, db } = await getDB();
    const { username, password, name, company, email, role, isActive, tableConfig } = req.body;
    
    // Check if user exists first
    const existingUser = await db.collection('User').findOne({ _id: new ObjectId(req.params.id) });
    if (!existingUser) {
      await client.close();
      console.log('User not found with ID:', req.params.id);
      return res.status(404).json({ error: 'User nicht gefunden' });
    }

    // Prevent changing the primary admin's role
    if (existingUser.username === 'admin' && role !== undefined && role !== existingUser.role) {
      await client.close();
      return res.status(403).json({ error: 'Die Rolle des primären Administrators kann nicht geändert werden' });
    }
    
    const updateData = {
      updatedAt: new Date()
    };
    
    // Only include fields that are provided
    if (username !== undefined) updateData.username = username;
    if (password !== undefined && password !== '') updateData.password = password;
    if (name !== undefined) updateData.name = name;
    if (company !== undefined) updateData.company = company;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined && existingUser.username !== 'admin') updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (tableConfig !== undefined) updateData.tableConfig = tableConfig;
    
    console.log('Update data:', updateData);
    
    const result = await db.collection('User').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    
    console.log('Update result:', result);
    
    if (result.matchedCount === 0) {
      await client.close();
      return res.status(404).json({ error: 'User nicht gefunden' });
    }
    
    // Get updated user
    const updatedUser = await db.collection('User').findOne({ _id: new ObjectId(req.params.id) });
    await client.close();
    
    const responseUser = convertMongoDoc(updatedUser);
    
    console.log('Returning updated user:', responseUser);
    res.json(responseUser);
  } catch (err) {
    console.error('PUT /api/users/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Nutzers', details: err.message });
  }
});

app.post('/api/users/combine', async (req, res) => {
  try {
    const { sourceUserId, targetUserId } = req.body;
    if (!sourceUserId || !targetUserId) {
      return res.status(400).json({ error: 'Quell- und Ziel-Account müssen angegeben werden.' });
    }
    if (sourceUserId === targetUserId) {
      return res.status(400).json({ error: 'Quell- und Ziel-Account können nicht gleich sein.' });
    }

    // Rollen-Check für Admin
    const cookies = parseCookies(req);
    if (!cookies.sessionId) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    const { client, db } = await getDB();
    const session = await db.collection('Session').findOne({ token: cookies.sessionId });
    if (!session) {
      await client.close();
      return res.status(401).json({ error: 'Ungültige Session' });
    }
    
    const adminUser = await db.collection('User').findOne({ _id: new ObjectId(session.userId) });
    if (!adminUser || adminUser.role !== 'admin') {
      await client.close();
      return res.status(403).json({ error: 'Nur Administratoren dürfen Accounts zusammenführen' });
    }
    
    // Beide Accounts laden
    const sourceUser = await db.collection('User').findOne({ _id: new ObjectId(sourceUserId) });
    const targetUser = await db.collection('User').findOne({ _id: new ObjectId(targetUserId) });

    if (!sourceUser || !targetUser) {
      await client.close();
      return res.status(404).json({ error: 'Einer der Accounts wurde nicht gefunden.' });
    }

    // Orders aktualisieren (Auftraggeber)
    await db.collection('Order').updateMany(
      { clientId: { $in: [sourceUserId, sourceUserId.toString()] } },
      { $set: { clientId: targetUserId.toString(), clientName: targetUser.name || targetUser.username } }
    );

    // Orders aktualisieren (Bearbeiter)
    await db.collection('Order').updateMany(
      { assignedTo: { $in: [sourceUserId, sourceUserId.toString()] } },
      { $set: { assignedTo: targetUserId.toString() } }
    );

    // Historie aktualisieren (falls vorhanden)
    await db.collection('NoteHistory').updateMany(
      { 'author.id': { $in: [sourceUserId, sourceUserId.toString()] } },
      { $set: { 'author.id': targetUserId.toString(), 'author.name': targetUser.name || targetUser.username } }
    );

    // Source User löschen
    await db.collection('User').deleteOne({ _id: new ObjectId(sourceUserId) });

    await client.close();
    res.json({ success: true, message: 'Accounts erfolgreich zusammengeführt.' });
  } catch (err) {
    console.error('POST /api/users/combine error:', err);
    res.status(500).json({ error: 'Fehler beim Zusammenführen der Accounts', details: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
    const userToDelete = await db.collection('User').findOne({ _id: new ObjectId(req.params.id) });
    if (!userToDelete) {
      await client.close();
      return res.status(404).json({ error: 'User nicht gefunden' });
    }

    if (userToDelete.username === 'admin') {
      await client.close();
      return res.status(403).json({ error: 'Der primäre Administrator kann nicht gelöscht werden' });
    }

    // LDAP-Benutzer können nun auch gelöscht werden
    
    const result = await db.collection('User').deleteOne({ _id: new ObjectId(req.params.id) });
    await client.close();
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User nicht gefunden' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Löschen des Nutzers', details: err.message });
  }
});

// === ORDERS API ===

app.get('/api/orders/export/csv', requireRoleLevel('manager'), async (req, res) => {
  try {
    const { client, db } = await getDB();
    const orders = await db.collection('Order').find({ status: { $ne: 'Entwurf' } }).sort({ createdAt: -1 }).toArray();
    
    // Fetch users for assignedTo mapping
    const users = await db.collection('User').find({}).toArray();
    const userMap = {};
    users.forEach(u => userMap[u._id.toString()] = u.name || u.username);

    // Format headers
    let csvData = 'Auftragsnummer;Titel;Beschreibung;Auftraggeber Name;Datum Erstellt;Deadline;Status;Prioritaet;Zugewiesener Mitarbeiter;Geschaetzte Zeit;Tatsaechliche Zeit;Kostenstelle\r\n';

    // Format rows
    orders.forEach(order => {
      const escape = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Replace quotes with double quotes and wrap in quotes if contains delimiter, newline or quotes
        if (str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const dateCreated = order.createdAt ? new Date(order.createdAt).toLocaleDateString('de-DE') : '';
      const deadline = order.deadline ? new Date(order.deadline).toLocaleDateString('de-DE') : '';
      const assignedName = order.assignedTo ? (userMap[order.assignedTo] || order.assignedTo) : 'Nicht zugewiesen';

      const row = [
        escape(order.orderNumber || order._id.toString()),
        escape(order.title),
        escape(order.description),
        escape(order.clientName),
        escape(dateCreated),
        escape(deadline),
        escape(order.status),
        escape(order.priority),
        escape(assignedName),
        escape(order.estimatedHours),
        escape(order.actualHours),
        escape(order.costCenter)
      ];

      csvData += row.join(';') + '\r\n';
    });

    await client.close();

    // Set headers for download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename=werkstatt_auftraege_export_${dateStr}.csv`);
    
    // UTF-8 BOM
    res.write('\uFEFF');
    res.end(csvData);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({ error: 'Fehler beim Exportieren der Daten' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const viewerRole = await parseViewerRole(req);
    const cookies = parseCookies(req);
    const session = cookies.sessionId
      ? await db.collection('Session').findOne({ token: cookies.sessionId })
      : null;
    const orderAccessFilter = buildOrderAccessFilter(viewerRole, session?.userId);

    // Auftraggeber dürfen ausschließlich ihre eigenen Aufträge laden.
    const orders = await db.collection('Order').find({
      status: { $ne: 'Entwurf' },
      ...orderAccessFilter
    })
      .sort({ createdAt: -1 })
      .toArray();
    
    // Enrich with relations
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      // Load documents from Document collection
      let extDocs = await db.collection('Document').find({ 
        orderId: new ObjectId(order._id) 
      }).toArray();
      let documents = [...extDocs];
      if (order.documents && order.documents.length > 0) {
        for (const embDoc of order.documents) {
          if (!extDocs.some(d => d.name === embDoc.name || (d._id && d._id.toString() === embDoc.id))) {
            documents.push(embDoc);
          }
        }
      }
      
      // Enrich documents with IDs
      const enrichedDocuments = documents
        .filter(doc => !doc.componentId)
        .filter((doc, index, self) => self.findIndex(d => d.name === doc.name) === index)
        .map(doc => ({
        ...doc,
        id: doc._id ? doc._id.toString() : doc.id,
        _id: undefined
      }));
      
      // Load components
      const components = await db.collection('Component').find({ 
        orderId: new ObjectId(order._id) 
      }).toArray();
      
      // Enrich components with their documents
      const enrichedComponents = await Promise.all(components.map(async (component) => {
        // Support both ObjectId and String componentId (for backwards compatibility)
        const compDocuments = await db.collection('Document').find({ 
          $or: [
            { componentId: component._id },
            { componentId: component._id.toString() }
          ]
        }).toArray();
        
        const { _id, ...componentWithoutId } = component;
        return {
          ...componentWithoutId,
          id: _id.toString(),
          documents: compDocuments.map(doc => ({
            ...doc,
            id: doc._id.toString(),
            _id: undefined
          }))
        };
      }));
      
      // Load note history
      const noteHistory = await db.collection('NoteHistory').find({ 
        orderId: new ObjectId(order._id) 
      })
      .sort({ createdAt: -1 })
      .toArray();
      
      return await sanitizeOrderForViewer({
        ...order,
        id: order._id.toString(),
        _id: undefined,
        documents: enrichedDocuments,
        components: enrichedComponents,
        noteHistory: noteHistory,
        revisionHistory: order.revisionHistory || [],
        reworkComments: order.reworkComments || [],
        // Include title image metadata (not binary data) for frontend
        titleImage: order.titleImage ? {
          filename: order.titleImage.filename,
          contentType: order.titleImage.contentType,
          uploadedAt: order.titleImage.uploadedAt,
          hasImage: true
        } : null
      }, viewerRole, db);
    }));
    
    await client.close();
    
    console.log('GET /api/orders - Loaded', enrichedOrders.length, 'orders from MongoDB');
    res.json(enrichedOrders);
  } catch (err) {
    console.error('GET /api/orders error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Aufträge', details: err.message });
  }
});

app.get('/api/drafts', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const viewerRole = await parseViewerRole(req);
    
    const cookies = parseCookies(req);
    let sessionUserId = null;
    if (cookies.sessionId) {
      const session = await db.collection('Session').findOne({ token: cookies.sessionId });
      if (session) {
        sessionUserId = session.userId;
      }
    }
    
    if (!sessionUserId) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      await client.close();
      return;
    }
    
    // Load drafts belonging to the current user
    const drafts = await db.collection('Order').find({ 
      status: 'Entwurf',
      $or: [
        { clientId: sessionUserId },
        { clientId: sessionUserId.toString() }
      ]
    }).sort({ createdAt: -1 }).toArray();
    
    // Enrich with relations (same as orders)
    const enrichedDrafts = await Promise.all(drafts.map(async (order) => {
      let extDocs = await db.collection('Document').find({ orderId: new ObjectId(order._id) }).toArray();
      let documents = [...extDocs];
      if (order.documents && order.documents.length > 0) {
        for (const embDoc of order.documents) {
          if (!extDocs.some(d => d.name === embDoc.name || (d._id && d._id.toString() === embDoc.id))) {
            documents.push(embDoc);
          }
        }
      }
      
      const enrichedDocuments = documents
        .filter(doc => !doc.componentId)
        .filter((doc, index, self) => self.findIndex(d => d.name === doc.name) === index)
        .map(doc => ({
          ...doc,
          id: doc._id ? doc._id.toString() : doc.id,
          _id: undefined
        }));
        
      const components = await db.collection('Component').find({ orderId: new ObjectId(order._id) }).toArray();
      const enrichedComponents = await Promise.all(components.map(async (component) => {
        const compDocuments = await db.collection('Document').find({ 
          $or: [ { componentId: component._id }, { componentId: component._id.toString() } ]
        }).toArray();
        return {
          ...component,
          id: component._id.toString(),
          _id: undefined,
          documents: compDocuments.map(doc => ({ ...doc, id: doc._id.toString(), _id: undefined }))
        };
      }));
      
      const noteHistory = await db.collection('Note').find({ orderId: new ObjectId(order._id) }).sort({ createdAt: -1 }).toArray();
      
      return await sanitizeOrderForViewer({
        ...order,
        id: order._id.toString(),
        _id: undefined,
        documents: enrichedDocuments,
        components: enrichedComponents,
        noteHistory: noteHistory,
        revisionHistory: order.revisionHistory || [],
        reworkComments: order.reworkComments || [],
        titleImage: order.titleImage ? {
          filename: order.titleImage.filename,
          contentType: order.titleImage.contentType,
          uploadedAt: order.titleImage.uploadedAt,
          hasImage: true
        } : null
      }, viewerRole, db);
    }));
    
    await client.close();
    res.json(enrichedDrafts);
  } catch (err) {
    console.error('GET /api/drafts error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Entwürfe', details: err.message });
  }
});

app.get('/api/orders/number/:orderNumber', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const viewerRole = await parseViewerRole(req);
    
    // Authorization Check
    const cookies = parseCookies(req);
    let sessionUserId = null;
    let normalizedRole = viewerRole;
    if (cookies.sessionId) {
      const session = await db.collection('Session').findOne({ token: cookies.sessionId });
      if (session) {
        sessionUserId = session.userId;
        if (!normalizedRole) {
           normalizedRole = normalizeUserRole(session.role);
        }
      }
    }
    
    if (normalizedRole === 'guest') {
       await client.close();
       return res.status(403).json({ error: 'Zugriff verweigert' });
    }

    const order = await db.collection('Order').findOne({ 
      $or: [
        { orderNumber: req.params.orderNumber },
        ObjectId.isValid(req.params.orderNumber) ? { _id: new ObjectId(req.params.orderNumber) } : null
      ].filter(Boolean)
    });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    if (normalizedRole === 'client') {
       if (String(order.clientId) !== String(sessionUserId)) {
          await client.close();
          return res.status(403).json({ error: 'Zugriff verweigert' });
       }
    }
    
    // Load documents from Document collection
    let extDocs = await db.collection('Document').find({ 
      orderId: order._id
    }).toArray();
    let documents = [...extDocs];
    if (order.documents && order.documents.length > 0) {
      for (const embDoc of order.documents) {
        if (!extDocs.some(d => d.name === embDoc.name || (d._id && d._id.toString() === embDoc.id))) {
          documents.push(embDoc);
        }
      }
    }
    
    const components = await db.collection('Component').find({ 
      orderId: order._id
    }).toArray();
    
    const noteHistory = await db.collection('NoteHistory').find({ 
      orderId: order._id
    })
    .sort({ createdAt: -1 })
    .toArray();
    
    // Enrich components with their documents
    const enrichedComponents = await Promise.all(components.map(async (component) => {
      const compDocuments = await db.collection('Document').find({ 
        $or: [
          { componentId: component._id },
          { componentId: component._id.toString() }
        ]
      }).toArray();
      
      const { _id, ...componentWithoutId } = component;
      return {
        ...componentWithoutId,
        id: _id.toString(),
        documents: compDocuments.map(doc => ({
          ...doc,
          id: doc._id.toString(),
          _id: undefined
        }))
      };
    }));
    
    // Enrich documents with IDs
    const enrichedDocuments = documents
      .filter(doc => !doc.componentId)
      .filter((doc, index, self) => self.findIndex(d => d.name === doc.name) === index)
      .map(doc => ({
      ...doc,
      id: doc._id ? doc._id.toString() : doc.id,
      _id: undefined
    }));
    
    const enrichedOrder = await sanitizeOrderForViewer({
      ...order,
      id: order._id.toString(),
      _id: undefined,
      documents: enrichedDocuments,
      components: enrichedComponents,
      noteHistory: noteHistory,
      revisionHistory: order.revisionHistory || [],
      reworkComments: order.reworkComments || [],
      // Include title image metadata (not binary data) for frontend
      titleImage: order.titleImage ? {
        filename: order.titleImage.filename,
        contentType: order.titleImage.contentType,
        uploadedAt: order.titleImage.uploadedAt,
        hasImage: true
      } : null
    }, viewerRole, db);
    
    await client.close();
    
    console.log('GET /api/orders/number/:orderNumber - Loaded order from MongoDB:', enrichedOrder.orderNumber || enrichedOrder.id);
    res.json(enrichedOrder);
  } catch (err) {
    console.error('GET /api/orders/number/:orderNumber error:', err);
    res.status(500).json({ error: 'Fehler beim Laden des Auftrags' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const viewerRole = await parseViewerRole(req);
    
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Load documents from Document collection
    let extDocs = await db.collection('Document').find({ 
      orderId: new ObjectId(req.params.id) 
    }).toArray();
    let documents = [...extDocs];
    if (order.documents && order.documents.length > 0) {
      for (const embDoc of order.documents) {
        if (!extDocs.some(d => d.name === embDoc.name || (d._id && d._id.toString() === embDoc.id))) {
          documents.push(embDoc);
        }
      }
    }
    
    const components = await db.collection('Component').find({ 
      orderId: new ObjectId(req.params.id) 
    }).toArray();
    
    const noteHistory = await db.collection('NoteHistory').find({ 
      orderId: new ObjectId(req.params.id) 
    })
    .sort({ createdAt: -1 })
    .toArray();
    
    // Enrich components with their documents
    const enrichedComponents = await Promise.all(components.map(async (component) => {
      // Support both ObjectId and String componentId (for backwards compatibility)
      const compDocuments = await db.collection('Document').find({ 
        $or: [
          { componentId: component._id },
          { componentId: component._id.toString() }
        ]
      }).toArray();
      
      const { _id, ...componentWithoutId } = component;
      return {
        ...componentWithoutId,
        id: _id.toString(),
        documents: compDocuments.map(doc => ({
          ...doc,
          id: doc._id.toString(),
          _id: undefined
        }))
      };
    }));
    
    // Enrich documents with IDs
    const enrichedDocuments = documents
      .filter(doc => !doc.componentId)
      .filter((doc, index, self) => self.findIndex(d => d.name === doc.name) === index)
      .map(doc => ({
      ...doc,
      id: doc._id ? doc._id.toString() : doc.id,
      _id: undefined
    }));
    
    const enrichedOrder = await sanitizeOrderForViewer({
      ...order,
      id: order._id.toString(),
      _id: undefined,
      documents: enrichedDocuments,
      components: enrichedComponents,
      noteHistory: noteHistory,
      revisionHistory: order.revisionHistory || [],
      reworkComments: order.reworkComments || [],
      // Include title image metadata (not binary data) for frontend
      titleImage: order.titleImage ? {
        filename: order.titleImage.filename,
        contentType: order.titleImage.contentType,
        uploadedAt: order.titleImage.uploadedAt,
        hasImage: true
      } : null
    }, viewerRole, db);
    
    await client.close();
    
    console.log('GET /api/orders/:id - Loaded order from MongoDB:', enrichedOrder.id);
    res.json(enrichedOrder);
  } catch (err) {
    console.error('GET /api/orders/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Laden des Auftrags', details: err.message });
  }
});

// GET /api/orders/barcode/:code - Find order by orderNumber or id
app.get('/api/orders/barcode/:code', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const viewerRole = await parseViewerRole(req);
    const code = req.params.code;
    
    console.log('Searching for order with barcode/orderNumber:', code);
    
    // Search by orderNumber first, then by id
    let order = await db.collection('Order').findOne({ orderNumber: code });
    
    if (!order) {
      // Try to search by id if it's a valid ObjectId
      try {
        if (ObjectId.isValid(code)) {
          order = await db.collection('Order').findOne({ _id: new ObjectId(code) });
        }
      } catch (err) {
        console.log('Invalid ObjectId format:', code);
      }
    }
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag mit diesem Code nicht gefunden' });
    }
    
    // Load documents from Document collection
    let extDocs = await db.collection('Document').find({ 
      orderId: new ObjectId(order._id) 
    }).toArray();
    let documents = [...extDocs];
    if (order.documents && order.documents.length > 0) {
      for (const embDoc of order.documents) {
        if (!extDocs.some(d => d.name === embDoc.name || (d._id && d._id.toString() === embDoc.id))) {
          documents.push(embDoc);
        }
      }
    }
    
    const components = await db.collection('Component').find({ 
      orderId: new ObjectId(order._id) 
    }).toArray();
    
    const noteHistory = await db.collection('NoteHistory').find({ 
      orderId: new ObjectId(order._id) 
    })
    .sort({ createdAt: -1 })
    .toArray();
    
    // Enrich components with their documents
    const enrichedComponents = await Promise.all(components.map(async (component) => {
      // Support both ObjectId and String componentId (for backwards compatibility)
      const compDocuments = await db.collection('Document').find({ 
        $or: [
          { componentId: component._id },
          { componentId: component._id.toString() }
        ]
      }).toArray();
      
      const { _id, ...componentWithoutId } = component;
      return {
        ...componentWithoutId,
        id: _id.toString(),
        documents: compDocuments
      };
    }));
    
    const enrichedOrder = await sanitizeOrderForViewer({
      ...order,
      id: order._id.toString(),
      _id: undefined,
      documents: documents,
      components: enrichedComponents,
      noteHistory: noteHistory,
      revisionHistory: order.revisionHistory || [],
      reworkComments: order.reworkComments || [],
      // Include title image metadata (not binary data) for frontend
      titleImage: order.titleImage ? {
        filename: order.titleImage.filename,
        contentType: order.titleImage.contentType,
        uploadedAt: order.titleImage.uploadedAt,
        hasImage: true
      } : null
    }, viewerRole, db);
    
    await client.close();
    
    console.log('GET /api/orders/barcode/:code - Found order:', enrichedOrder.orderNumber || enrichedOrder.id);
    res.json(enrichedOrder);
  } catch (err) {
    console.error('GET /api/orders/barcode/:code error:', err);
    res.status(500).json({ error: 'Fehler beim Suchen des Auftrags', details: err.message });
  }
});

// PUT /api/orders/:id - Update order
app.put('/api/orders/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const ordersCollection = db.collection('Order');
    
    console.log('=== PUT /api/orders/:id RECEIVED ===');
    console.log('Order ID:', req.params.id);
    console.log('Full request body keys:', Object.keys(req.body));
    console.log('Documents in request:', req.body.documents);
    console.log('Request body length:', JSON.stringify(req.body).length);
    
    // Extract allowed fields
    const {
      title, projectName, description, clientId, clientName, deadline, costCenter,
      priority, status, estimatedHours, actualHours, assignedTo, notes,
      orderType, subTasks, documents, components, revisionRequest, revisionComment,
      userId, userName, materialOrderedByWorkshop, materialOrderedByClient,
      materialOrderedByClientConfirmed, materialAvailable, confirmationNote,
      confirmationDate, canEdit, titleImage, internalWorkshopNote
    } = req.body;
    
    console.log('Extracted documents:', documents);
    console.log('Documents type:', typeof documents);
    console.log('Documents is array:', Array.isArray(documents));

    // Get existing order
    const existingOrder = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existingOrder) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }

    let revisionHistory = Array.isArray(existingOrder.revisionHistory) ? existingOrder.revisionHistory : [];
    let reworkComments = Array.isArray(existingOrder.reworkComments) ? existingOrder.reworkComments : [];

    // Handle revision workflows
    let effectiveUserId = userId;
    let effectiveUserName = userName;

    // Case 1: Workshop sends order for revision to client
    if (status === 'revision' && revisionComment && effectiveUserId && effectiveUserName) {
      console.log('Case 1: Workshop revision being processed...');
      revisionHistory.push({
        comment: revisionComment,
        userId: effectiveUserId,
        userName: effectiveUserName,
        createdAt: new Date().toISOString() // Changed from 'date' to 'createdAt' for consistency
      });
      console.log('Added revision comment to history:', revisionHistory[revisionHistory.length - 1]);
    }

    // Case 2: Client sends order back to workshop after revision
    if (status === 'rework' && (revisionRequest || revisionComment) && effectiveUserId && effectiveUserName) {
      console.log('Case 2: Client rework being processed...');
      reworkComments.push({
        comment: revisionRequest || revisionComment, // Accept both field names
        userId: effectiveUserId,
        userName: effectiveUserName,
        createdAt: new Date().toISOString(),
        documents: [] // Initialize with empty documents array
      });
      console.log('Added rework comment to array:', reworkComments[reworkComments.length - 1]);
    }

    // Build update data
    const updateData = { updatedAt: new Date() };

    // Only add defined fields
    if (title !== undefined) updateData.title = title || (status === 'Entwurf' ? 'Unbenannter Entwurf' : '');
    if (projectName !== undefined) updateData.projectName = projectName;
    if (description !== undefined) updateData.description = description;
    if (clientId !== undefined) updateData.clientId = clientId;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (costCenter !== undefined) updateData.costCenter = costCenter;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'waiting_confirmation' && existingOrder.status !== 'waiting_confirmation') {
        updateData.waitingConfirmationSince = new Date();
      }
      if (status === 'completed' && existingOrder.status !== 'completed') {
        updateData.confirmationDate = new Date();
      }
      if ((status === 'accepted' || status === 'in_progress') && existingOrder.status !== 'accepted' && existingOrder.status !== 'in_progress') {
        updateData.acceptedDate = new Date();
      }
    }
    if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours;
    if (actualHours !== undefined) updateData.actualHours = actualHours;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (notes !== undefined) updateData.notes = notes;
    if (internalWorkshopNote !== undefined) updateData.internalWorkshopNote = internalWorkshopNote;
    if (orderType !== undefined) updateData.orderType = orderType;
    if (subTasks !== undefined) {
      const existingSubTasks = existingOrder.subTasks || [];
      const userRole = await parseViewerRole(req);
      const requestUserId = userId; // Aus dem Body extrahiert

      for (const st of subTasks) {
        const oldSt = existingSubTasks.find(old => old.id === st.id);
        
        // 1. Dependency Validation
        if (st.status === 'completed' && (!oldSt || oldSt.status !== 'completed')) {
          if (st.dependencies && st.dependencies.length > 0) {
            const incompleteDeps = st.dependencies.filter(depId => {
              const depTask = subTasks.find(s => s.id === depId) || existingSubTasks.find(s => s.id === depId);
              return depTask && depTask.status !== 'completed';
            });
            if (incompleteDeps.length > 0) {
              await client.close();
              return res.status(400).json({ error: `Aufgabe "${st.title}" kann nicht abgeschlossen werden, da Voraussetzungen noch nicht erfüllt sind.` });
            }
          }
        }

        // 2. Time Override Validation
        if (oldSt && st.actualHours !== oldSt.actualHours) {
          const isAssignee = st.assignedTo === requestUserId;
          const isManagerOrAdmin = userRole === 'manager' || userRole === 'admin';
          if (!isAssignee && !isManagerOrAdmin) {
            await client.close();
            return res.status(403).json({ error: `Keine Berechtigung: Nur die Werkstattleitung, Admins oder der zugewiesene Mitarbeiter dürfen die erfasste Zeit von "${st.title}" ändern.` });
          }
        }
      }
      
      updateData.subTasks = subTasks;
    }
    
    // Handle title image deletion (when titleImage is explicitly set to null)
    if (titleImage !== undefined) {
      if (titleImage === null) {
        updateData.titleImage = null;
        console.log('Title image deletion requested');
      }
      // Note: title image upload is handled by separate endpoint
    }
    
    // Helper to delete physical files
    const deletePhysicalFile = (doc) => {
      try {
        if (doc.networkPath && fs.existsSync(doc.networkPath)) {
          fs.unlinkSync(doc.networkPath);
        } else if (doc.url && doc.url.startsWith('/uploads/')) {
          const localPath = path.join(uploadsDir, decodeURIComponent(doc.url.substring('/uploads/'.length)));
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        }
      } catch(e) {
        console.error('Error deleting physical file:', e);
      }
    };
    
    // Documents with type field
    if (documents !== undefined) {
      const sentDocUrls = (documents || []).map(d => d.url);
      const oldGenDocs = await db.collection('Document').find({
        orderId: new ObjectId(req.params.id),
        componentId: { $exists: false }
      }).toArray();
      
      for (const oldDoc of oldGenDocs) {
        if (!sentDocUrls.includes(oldDoc.url)) {
          deletePhysicalFile(oldDoc);
          await db.collection('Document').deleteOne({ _id: oldDoc._id });
        }
      }
      
      updateData.documents = (documents || []).map(doc => {
        // Determine type based on file extension
        let type = 'unknown';
        if (doc.name) {
          const extension = doc.name.toLowerCase().split('.').pop();
          switch (extension) {
            case 'pdf': type = 'application/pdf'; break;
            case 'stl': type = 'model/stl'; break;
            case 'step':
            case 'stp': type = 'model/step'; break;
            case 'iges':
            case 'igs': type = 'model/iges'; break;
            case 'ipt': type = 'model/inventor'; break;
            case 'dwg': type = 'application/autocad'; break;
            case 'jpg':
            case 'jpeg': type = 'image/jpeg'; break;
            case 'png': type = 'image/png'; break;
            default: type = 'application/octet-stream';
          }
        }
        
        return { ...doc, type: type };
      });
    }
    
    // Handle components updates
    let preUpdateComponentsForDiff = [];
    if (components !== undefined) {
      console.log('PUT /api/orders/:id - Processing components:', components?.length || 0);
      
      // Delete existing components and their documents
      const existingComponents = await db.collection('Component').find({ 
        orderId: new ObjectId(req.params.id) 
      }).toArray();
      
      // Load pre-update components for diffing later
      preUpdateComponentsForDiff = await Promise.all(existingComponents.map(async (component) => {
        const compDocuments = await db.collection('Document').find({ 
          $or: [
            { componentId: component._id },
            { componentId: component._id.toString() }
          ]
        }).toArray();
        return {
          ...component,
          id: component._id.toString(),
          documents: compDocuments.map(doc => ({
            ...doc,
            id: doc._id ? doc._id.toString() : doc.id
          }))
        };
      }));
      
      if (components && components.length > 0) {
        // IDs, die im Request gesendet wurden
        const sentIds = components.map(c => c.id || c._id).filter(id => id && ObjectId.isValid(id)).map(id => new ObjectId(id));
        
        // Lösche alle Komponenten (und deren Dokumente), die NICHT im Request sind
        const componentsToDelete = existingComponents.filter(ec => !sentIds.some(id => id.equals(ec._id)));
        for (const comp of componentsToDelete) {
          const compDocsToDelete = await db.collection('Document').find({ componentId: comp._id }).toArray();
          for (const oldDoc of compDocsToDelete) {
            deletePhysicalFile(oldDoc);
          }
          await db.collection('Document').deleteMany({ componentId: comp._id });
          await db.collection('Component').deleteOne({ _id: comp._id });
        }
        
        for (const component of components) {
          const compId = component.id || component._id;
          const componentData = {
            title: component.title || component.name,
            description: component.description || '',
            material: component.material || '',
            quantity: parseQuantity(component.quantity),
            notes: component.notes || '',
            status: component.status || 'pending',
            orderId: new ObjectId(req.params.id),
            updatedAt: new Date()
          };
          
          let finalComponentId;
          if (compId && ObjectId.isValid(compId)) {
            finalComponentId = new ObjectId(compId);
            await db.collection('Component').updateOne(
              { _id: finalComponentId },
              { $set: componentData }
            );
          } else {
            componentData.createdAt = new Date();
            const result = await db.collection('Component').insertOne(componentData);
            finalComponentId = result.insertedId;
          }
          
          // Dokumente des Bauteils neu anlegen
          const oldCompDocs = await db.collection('Document').find({ componentId: finalComponentId }).toArray();
          const sentCompDocUrls = component.documents ? component.documents.map(d => d.url) : [];
          for (const oldDoc of oldCompDocs) {
            if (!sentCompDocUrls.includes(oldDoc.url)) {
              deletePhysicalFile(oldDoc);
            }
          }
          await db.collection('Document').deleteMany({ componentId: finalComponentId });
          
          if (component.documents && component.documents.length > 0) {
            const componentDocuments = component.documents.map(doc => ({
              name: doc.name,
              url: doc.url,
              pdfWarning: doc.pdfWarning,
              uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
              componentId: finalComponentId,
              orderId: new ObjectId(req.params.id)
            }));
            await db.collection('Document').insertMany(componentDocuments);
          }
        }
      } else {
        // Wenn ein leeres Array gesendet wurde, lösche alle
        for (const comp of existingComponents) {
          const compDocsToDelete = await db.collection('Document').find({ componentId: comp._id }).toArray();
          for (const oldDoc of compDocsToDelete) {
            deletePhysicalFile(oldDoc);
          }
          await db.collection('Document').deleteMany({ componentId: comp._id });
        }
        await db.collection('Component').deleteMany({ orderId: new ObjectId(req.params.id) });
      }
    }
    
    if (materialOrderedByWorkshop !== undefined) updateData.materialOrderedByWorkshop = materialOrderedByWorkshop;
    if (materialOrderedByClient !== undefined) updateData.materialOrderedByClient = materialOrderedByClient;
    if (materialOrderedByClientConfirmed !== undefined) updateData.materialOrderedByClientConfirmed = materialOrderedByClientConfirmed;
    if (materialAvailable !== undefined) updateData.materialAvailable = materialAvailable;
    if (confirmationNote !== undefined) updateData.confirmationNote = confirmationNote;
    if (confirmationDate !== undefined) updateData.confirmationDate = new Date(confirmationDate);
    if (canEdit !== undefined) updateData.canEdit = canEdit;
    
    // Always update history
    updateData.revisionHistory = revisionHistory;
    updateData.reworkComments = reworkComments;

    console.log('PUT /api/orders/:id updateData documents:', updateData.documents?.length || 0);
    console.log('PUT /api/orders/:id - Final reworkComments count:', reworkComments.length);
    if (reworkComments.length > 0) {
      console.log('PUT /api/orders/:id - Latest rework comment:', reworkComments[reworkComments.length - 1]);
    }
    
    // Prepare update operations
    const updateOperations = {};
    
    // Handle title image deletion separately
    if (titleImage === null) {
      updateOperations.$unset = { titleImage: "" };
      // Remove titleImage from regular updateData to avoid conflicts
      delete updateData.titleImage;
    }
    
    // Regular field updates
    if (Object.keys(updateData).length > 0) {
      updateOperations.$set = updateData;
    }
    
    // Update in MongoDB
    if (Object.keys(updateOperations).length > 0) {
      await ordersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        updateOperations
      );
    }
    
    // Check if status changed to/from archived and move physical folder
    const oldStatus = existingOrder.status;
    const newStatus = updateData.status !== undefined ? updateData.status : oldStatus;
    
    if (oldStatus !== newStatus && (oldStatus === 'archived' || newStatus === 'archived')) {
      try {
        const orderFolderName = await getOrCreateOrderFolderName(db, existingOrder);
        const settingsCollection = db.collection('settings');
        const networkConfig = await settingsCollection.findOne({ type: 'network-config' });
        
        let destBasePath = uploadsDir;
        if (networkConfig && networkConfig.networkPath && fs.existsSync(networkConfig.networkPath)) {
          destBasePath = networkConfig.networkPath;
        }
        
        const basePath = path.join(destBasePath, orderFolderName);
        const archivPath = path.join(destBasePath, 'Archiv', orderFolderName);
        
        const sourcePath = oldStatus === 'archived' ? archivPath : basePath;
        const targetPath = newStatus === 'archived' ? archivPath : basePath;
        
        if (fs.existsSync(sourcePath)) {
          const targetDir = path.dirname(targetPath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          fs.renameSync(sourcePath, targetPath);
          console.log(`[File-Organization] Moved folder from ${sourcePath} to ${targetPath}`);
        }
      } catch (err) {
        console.error('[File-Organization] Failed to move folder for archiving:', err);
      }
    }
    
    // Trigger auto-migration/organization with the existing db connection
    await autoMigrateOrderFiles(db, req.params.id);


    // --- Audit Logging ---
    try {
      const auditLogs = [];
      if (oldStatus !== newStatus) {
        auditLogs.push({
          id: new ObjectId().toString(),
          orderId: req.params.id,
          userId: effectiveUserId || 'unknown',
          userName: effectiveUserName || 'Unbekannt',
          action: newStatus === 'archived' ? 'archived' : 'status_changed',
          details: `Status geändert von '${oldStatus}' zu '${newStatus}'`,
          timestamp: new Date()
        });
      }

      if (updateData.actualHours !== undefined && existingOrder.actualHours !== updateData.actualHours) {
        auditLogs.push({
          id: new ObjectId().toString(),
          orderId: req.params.id,
          userId: effectiveUserId || 'unknown',
          userName: effectiveUserName || 'Unbekannt',
          action: 'time_changed',
          details: `Gesamtzeit geändert von ${existingOrder.actualHours || 0} auf ${updateData.actualHours}`,
          timestamp: new Date()
        });
      }

      if (subTasks && Array.isArray(subTasks)) {
        for (const newSt of subTasks) {
          const oldSt = existingOrder.subTasks?.find(s => s.id === newSt.id);
          if (oldSt && oldSt.actualHours !== newSt.actualHours) {
            auditLogs.push({
              id: new ObjectId().toString(),
              orderId: req.params.id,
              userId: effectiveUserId || 'unknown',
              userName: effectiveUserName || 'Unbekannt',
              action: 'time_changed',
              details: `Zeit für Unteraufgabe '${newSt.title}' geändert von ${oldSt.actualHours || 0} auf ${newSt.actualHours}`,
              timestamp: new Date()
            });
          }
          if (oldSt && oldSt.status !== newSt.status) {
             auditLogs.push({
              id: new ObjectId().toString(),
              orderId: req.params.id,
              userId: effectiveUserId || 'unknown',
              userName: effectiveUserName || 'Unbekannt',
              action: 'subtask_changed',
              details: `Status von Unteraufgabe '${newSt.title}' geändert auf '${newSt.status}'`,
              timestamp: new Date()
            });
          }
        }
      }

      if (auditLogs.length > 0) {
        await db.collection('AuditLog').insertMany(auditLogs);
      }
    } catch (auditErr) {
      console.error('Failed to write audit logs:', auditErr);
    }
    // --- End Audit Logging ---

    // Get updated order with all relations (like GET /api/orders/:id)
    const updatedOrder = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
    
    if (!updatedOrder) {
      await client.close();
      return res.status(404).json({ error: 'Order not found after update' });
    }

    // Load documents
    let orderDocuments = updatedOrder.documents || [];
    if (orderDocuments.length === 0) {
      orderDocuments = await db.collection('Document').find({ 
        orderId: new ObjectId(req.params.id) 
      }).toArray();
    }
    
    // Enrich documents with IDs
    const enrichedDocuments = orderDocuments
      .filter(doc => !doc.componentId)
      .filter((doc, index, self) => self.findIndex(d => d.name === doc.name) === index)
      .map(doc => ({
      ...doc,
      id: doc._id ? doc._id.toString() : doc.id,
      _id: undefined
    }));
    
    // Load components with their documents
    const orderComponents = await db.collection('Component').find({ 
      orderId: new ObjectId(req.params.id) 
    }).toArray();
    
    const enrichedComponents = await Promise.all(orderComponents.map(async (component) => {
      // Support both ObjectId and String componentId (for backwards compatibility)
      const compDocuments = await db.collection('Document').find({ 
        $or: [
          { componentId: component._id },
          { componentId: component._id.toString() }
        ]
      }).toArray();
      
      const { _id, ...componentWithoutId } = component;
      return {
        ...componentWithoutId,
        id: _id.toString(),
        documents: compDocuments.map(doc => ({
          ...doc,
          id: doc._id ? doc._id.toString() : doc.id,
          _id: undefined
        }))
      };
    }));
    
    // Load note history
    const noteHistory = await db.collection('NoteHistory').find({ 
      orderId: new ObjectId(req.params.id) 
    })
    .sort({ createdAt: -1 })
    .toArray();
    
    // Trigger email notifications if status changed
    if (status !== undefined && status !== existingOrder.status) {
      const emailScript = require('./scripts/email-notifications.cjs');
      const orderDataForEmail = { ...updatedOrder, subTasks: updatedOrder.subTasks || existingOrder.subTasks };
      
      console.log(`[EMAIL] Status changed from ${existingOrder.status} to ${status}. Triggering emails...`);
      
      if (status === 'waiting_confirmation') {
        await emailScript.sendWaitingConfirmationEmail(transporter, db, req.params.id, orderDataForEmail);
      } else if (status === 'completed' || status === 'rework') {
        const commentData = status === 'completed' 
          ? { userName: effectiveUserName, comment: confirmationNote }
          : { userName: effectiveUserName, comment: revisionRequest || revisionComment };
        await emailScript.sendWorkshopStatusUpdateEmail(transporter, db, req.params.id, orderDataForEmail, status, commentData);
      }
    } else {
      // If status didn't change (or if it did, we might not want to double-email, but we only email if status DID NOT change to avoid spam)
      // Actually, let's just trigger edit email if there are meaningful field changes.
      const isClientEditing = effectiveUserId && existingOrder.clientId && String(effectiveUserId) === String(existingOrder.clientId);
      const ignoredFields = ['updatedAt', 'revisionHistory', 'reworkComments', 'status', 'subTasks', 'internalWorkshopNote', 'estimatedHours', 'actualHours', 'assignedTo'];
      
      // If workshop is editing, ignore document uploads in the root order
      if (!isClientEditing) {
        ignoredFields.push('documents');
      }
      
      const editedFields = Object.keys(updateData).filter(key => {
        if (ignoredFields.includes(key)) return false;
        
        const newVal = updateData[key];
        const oldVal = existingOrder[key];
        
        if (newVal === oldVal) return false;
        
        if (newVal instanceof Date && oldVal instanceof Date) {
          return newVal.getTime() !== oldVal.getTime();
        }
        
        if (typeof newVal === 'object' && typeof oldVal === 'object') {
          return JSON.stringify(newVal) !== JSON.stringify(oldVal);
        }
        
        if ((newVal === null || newVal === undefined) && (oldVal === null || oldVal === undefined)) {
          return false;
        }
        
        return true;
      });
      
      let componentsChanged = false;
      if (components !== undefined && typeof preUpdateComponentsForDiff !== 'undefined' && typeof enrichedComponents !== 'undefined') {
        if (preUpdateComponentsForDiff.length !== enrichedComponents.length) {
          componentsChanged = true;
        } else {
          for (let i = 0; i < enrichedComponents.length; i++) {
            const newComp = enrichedComponents[i];
            const oldComp = preUpdateComponentsForDiff.find(c => c.id === newComp.id) || preUpdateComponentsForDiff[i];
            
            if (newComp.title !== oldComp.title ||
                newComp.description !== oldComp.description ||
                newComp.quantity !== oldComp.quantity ||
                newComp.material !== oldComp.material) {
              componentsChanged = true;
              break;
            }
            
            // Only check component document changes if the client is editing
            if (isClientEditing) {
              const newDocs = newComp.documents || [];
              const oldDocs = oldComp.documents || [];
              if (newDocs.length !== oldDocs.length) {
                componentsChanged = true;
                break;
              }
              
              const oldDocNames = oldDocs.map(d => d.name).sort().join(',');
              const newDocNames = newDocs.map(d => d.name).sort().join(',');
              if (oldDocNames !== newDocNames) {
                componentsChanged = true;
                break;
              }
            }
          }
        }
      }
      
      if (componentsChanged) {
        editedFields.push('Bauteile');
        updateData['Bauteile'] = 'Wurden geändert';
      }
      
      if (editedFields.length > 0 && existingOrder.status !== 'Entwurf') {
        const emailScript = require('./scripts/email-notifications.cjs');
        const orderDataForEmail = { ...updatedOrder, subTasks: updatedOrder.subTasks || existingOrder.subTasks };
        
        // Build an object of only the changed fields for the email
        const changedFieldsForEmail = {};
        for (const key of editedFields) {
          changedFieldsForEmail[key] = updateData[key];
        }
        
        await emailScript.sendOrderEditedEmail(transporter, db, req.params.id, orderDataForEmail, changedFieldsForEmail, effectiveUserName);
      }
    }

    await client.close();
    const responseOrder = {
      ...updatedOrder,
      id: updatedOrder._id.toString(),
      _id: undefined,
      documents: enrichedDocuments,
      components: enrichedComponents,
      noteHistory: noteHistory,
      revisionHistory: updatedOrder.revisionHistory || [],
      reworkComments: updatedOrder.reworkComments || [],
      // Include title image metadata (not binary data) for frontend
      titleImage: updatedOrder.titleImage ? {
        filename: updatedOrder.titleImage.filename,
        contentType: updatedOrder.titleImage.contentType,
        uploadedAt: updatedOrder.titleImage.uploadedAt,
        hasImage: true
      } : null
    };
    
    console.log('Final response documents:', responseOrder.documents?.length || 0);
    console.log('Final response components:', responseOrder.components?.length || 0);
    res.json(responseOrder);
  } catch (err) {
    console.error('PUT /api/orders/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Auftrags', details: err.message });
  }
});

// POST /api/orders/:id/upload-title-image - Upload title image for order
app.post('/api/orders/:id/upload-title-image', memoryUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const orderId = req.params.id;
    console.log('Uploading title image for order:', orderId, 'File:', req.file.originalname);

    // Validate file type (only images)
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Nur Bilddateien sind erlaubt' });
    }

    const { client, db } = await getDB();
    
    // Update order with title image data
    const updateResult = await db.collection('Order').updateOne(
      { _id: new ObjectId(orderId) },
      { 
        $set: { 
          titleImage: {
            data: req.file.buffer,
            contentType: req.file.mimetype,
            filename: req.file.originalname,
            uploadedAt: new Date()
          }
        } 
      }
    );

    if (updateResult.matchedCount === 0) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }

    // Fetch updated order to return
    const updatedOrder = await db.collection('Order').findOne({ _id: new ObjectId(orderId) });
    
    // Load documents from Document collection
    let extDocs = await db.collection('Document').find({ 
      orderId: new ObjectId(orderId) 
    }).toArray();
    let documents = [...extDocs];
    if (updatedOrder.documents && updatedOrder.documents.length > 0) {
      for (const embDoc of updatedOrder.documents) {
        if (!extDocs.some(d => d.name === embDoc.name || (d._id && d._id.toString() === embDoc.id))) {
          documents.push(embDoc);
        }
      }
    }
    
    const components = await db.collection('Component').find({ 
      orderId: new ObjectId(orderId) 
    }).toArray();
    
    const noteHistory = await db.collection('NoteHistory').find({ 
      orderId: new ObjectId(orderId) 
    })
    .sort({ createdAt: -1 })
    .toArray();
    
    // Enrich components with their documents
    const enrichedComponents = await Promise.all(components.map(async (component) => {
      // Support both ObjectId and String componentId (for backwards compatibility)
      const compDocuments = await db.collection('Document').find({ 
        $or: [
          { componentId: component._id },
          { componentId: component._id.toString() }
        ]
      }).toArray();
      
      const { _id, ...componentWithoutId } = component;
      return {
        ...componentWithoutId,
        id: _id.toString(),
        documents: compDocuments
      };
    }));
    
    await client.close();
    
    const responseOrder = {
      ...updatedOrder,
      id: updatedOrder._id.toString(),
      _id: undefined,
      documents: documents,
      components: enrichedComponents,
      noteHistory: noteHistory,
      revisionHistory: updatedOrder.revisionHistory || [],
      reworkComments: updatedOrder.reworkComments || [],
      // Include title image metadata (not binary data) for frontend
      titleImage: updatedOrder.titleImage ? {
        filename: updatedOrder.titleImage.filename,
        contentType: updatedOrder.titleImage.contentType,
        uploadedAt: updatedOrder.titleImage.uploadedAt,
        hasImage: true
      } : null
    };
    
    console.log('Title image uploaded successfully for order:', orderId);
    res.json(responseOrder);
  } catch (err) {
    console.error('POST /api/orders/:id/upload-title-image error:', err);
    res.status(500).json({ error: 'Fehler beim Upload des Titelbildes', details: err.message });
  }
});

// GET /api/orders/:id/title-image - Serve title image for order
app.get('/api/orders/:id/title-image', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { client, db } = await getDB();
    
    const order = await db.collection('Order').findOne({ _id: new ObjectId(orderId) });
    
    if (!order || !order.titleImage || !order.titleImage.data) {
      await client.close();
      return res.status(404).json({ error: 'Titelbild nicht gefunden' });
    }
    
    await client.close();
    
    // Handle different buffer formats from MongoDB
    let imageBuffer;
    if (Buffer.isBuffer(order.titleImage.data)) {
      imageBuffer = order.titleImage.data;
    } else if (order.titleImage.data.buffer) {
      // Handle MongoDB Binary type
      imageBuffer = Buffer.from(order.titleImage.data.buffer);
    } else {
      // Fallback: try to create buffer from data
      imageBuffer = Buffer.from(order.titleImage.data);
    }
    
    const contentLength = imageBuffer.length;
    console.log('Serving title image for order:', orderId, 'Size:', contentLength, 'bytes', 'Type:', order.titleImage.contentType);
    
    // Set proper headers for image response
    res.set({
      'Content-Type': order.titleImage.contentType || 'image/jpeg',
      'Content-Length': contentLength.toString(),
      'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
    });
    
    res.send(imageBuffer);
  } catch (err) {
    console.error('GET /api/orders/:id/title-image error:', err);
    res.status(500).json({ error: 'Fehler beim Laden des Titelbildes', details: err.message });
  }
});

// POST /api/orders - Create new order
app.post('/api/orders', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const { documents, components, ...orderData } = req.body;
    
    // Generate order number: F-0001-YYMM
    const today = new Date();
    const yearMonth = today.toISOString().slice(2, 7).replace('-', ''); // YYMM
    const prefix = orderData.orderType === 'fertigung' ? 'F' : 'S';
    const counterKey = `order-counter-${prefix}`;
    
    // Find highest sequential number across all orders in DB with the SAME prefix
    const existingOrders = await db.collection('Order').find(
      { orderNumber: { $regex: `^${prefix}-` } }, 
      { projection: { orderNumber: 1 } }
    ).toArray();
    
    let maxDbNumber = 0;
    if (existingOrders.length > 0) {
      const numbers = existingOrders.map(order => {
        if (!order.orderNumber) return 0;
        // Format: F-XXXX-YYMM or S-XXXX-YYMM (extract XXXX)
        const match = order.orderNumber.match(/^([FS])-(\d+)-\d{4}$/);
        if (match && match[1] === prefix) return parseInt(match[2], 10);
        return 0;
      }).filter(num => num > 0);
      
      if (numbers.length > 0) {
        maxDbNumber = Math.max(...numbers);
      }
    }
    
    let nextNumber = maxDbNumber + 1;
    
    let orderNumber;
    while (true) {
      const paddedNumber = String(nextNumber).padStart(4, '0');
      orderNumber = `${prefix}-${paddedNumber}-${yearMonth}`;
      if (!existingOrders.some(o => o.orderNumber === orderNumber)) {
        break;
      }
      nextNumber++;
    }
    

    
    // Handle draft fallbacks
    let title = orderData.title;
    if (orderData.status === 'Entwurf' && !title) {
      title = 'Unbenannter Entwurf';
    }
    
    let deadline = null;
    if (orderData.deadline) {
      deadline = new Date(orderData.deadline);
    }
    
    // Check for default assignee
    let assignedTo = orderData.assignedTo || null;
    if (!assignedTo) {
      const defaultAssigneeConfig = await db.collection('settings').findOne({ type: 'default-assignee-config' });
      if (defaultAssigneeConfig && defaultAssigneeConfig.userId) {
        assignedTo = defaultAssigneeConfig.userId;
      }
    }
    
    // Create new order
    const newOrder = {
      orderNumber: orderNumber,
      projectName: orderData.projectName || '',
      title: title,
      description: orderData.description || '',
      clientId: orderData.clientId,
      clientName: orderData.clientName,
      deadline: deadline,
      costCenter: orderData.costCenter || '',
      priority: orderData.priority || 'medium',
      status: orderData.status || 'pending',
      estimatedHours: orderData.estimatedHours || 0,
      actualHours: orderData.actualHours || 0,
      assignedTo: assignedTo,
      notes: orderData.notes || '',
      internalWorkshopNote: orderData.internalWorkshopNote || '',
      orderType: orderData.orderType,
      subTasks: orderData.subTasks || [],
      documents: documents || [],
      revisionHistory: [],
      reworkComments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('Order').insertOne(newOrder);
    
    // Order documents are already embedded in newOrder.documents
    // Create components separately if needed
    if (components && components.length > 0) {
      console.log('POST /api/orders - Creating components:', components.length);
      
      for (const component of components) {
        const newComponent = {
          title: component.title || component.name,
          description: component.description || '',
          material: component.material || '',
          quantity: parseQuantity(component.quantity),
          notes: component.notes || '',
          status: component.status || 'pending',
          orderId: result.insertedId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const componentResult = await db.collection('Component').insertOne(newComponent);
        
        // Create component documents if provided
        if (component.documents && component.documents.length > 0) {
          const componentDocuments = component.documents.map(doc => ({
            name: doc.name,
            url: doc.url,
            pdfWarning: doc.pdfWarning,
            uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
            componentId: componentResult.insertedId,
            orderId: result.insertedId
          }));
          await db.collection('Document').insertMany(componentDocuments);
        }
      }
    }
    
    // Trigger auto-migration/organization with the existing db connection
    await autoMigrateOrderFiles(db, result.insertedId.toString());
    
    await client.close();
    
    const responseOrder = {
      ...newOrder,
      id: result.insertedId.toString(),
      _id: undefined
    };
    
    console.log('POST /api/orders - Created order:', responseOrder.orderNumber);
    res.json(responseOrder);
  } catch (err) {
    console.error('POST /api/orders error:', err);
    res.status(500).json({ error: 'Fehler beim Anlegen des Auftrags', details: err.message });
  }
});

// DELETE /api/orders/:id - Delete order
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Order nicht gefunden' });
    }

    const orderFolderName = await getOrCreateOrderFolderName(db, order);

    // If this order had the latest assigned index, release it
    if (order.orderNumber) {
      const match = order.orderNumber.match(/^([FS])-(\d+)-\d{4}$/);
      if (match) {
        const orderPrefix = match[1];
        const counterKey = `order-counter-${orderPrefix}`;
        const deletedNumber = parseInt(match[2], 10);
        const counterDoc = await db.collection('settings').findOne({ type: counterKey });
        
        if (counterDoc && counterDoc.value === deletedNumber) {
          await db.collection('settings').updateOne(
            { type: counterKey },
            { $set: { value: deletedNumber - 1 } }
          );
        }
      }
    }

    // Delete related documents
    await db.collection('Document').deleteMany({ orderId: new ObjectId(req.params.id) });
    
    // Delete related components
    await db.collection('Component').deleteMany({ orderId: new ObjectId(req.params.id) });
    
    // Delete note history
    await db.collection('NoteHistory').deleteMany({ orderId: new ObjectId(req.params.id) });
    
    // Delete order
    await db.collection('Order').deleteOne({ _id: new ObjectId(req.params.id) });
    

    // Clean up directories
    const pathsToClean = [
      path.join(__dirname, 'uploads', orderFolderName),
      path.join(__dirname, 'uploads', 'Archiv', orderFolderName),
      path.join(__dirname, 'storage', orderFolderName),
      path.join(__dirname, 'storage', 'Archiv', orderFolderName)
    ];

    try {
      const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
      if (networkConfig && networkConfig.networkPath) {
        // Also check if it's enabled (or just assume accessible)
        // Some users might have it temporarily disabled but we still want to clean up if we can.
        // The network file system structure uses the same format
        pathsToClean.push(path.join(networkConfig.networkPath, orderFolderName));
        pathsToClean.push(path.join(networkConfig.networkPath, 'Archiv', orderFolderName));
      }
    } catch (e) {
      console.error('Error reading network config during cleanup:', e);
    } finally {
      await client.close();
    }

    for (const dir of pathsToClean) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`🧹 Deleted folder: ${dir}`);
        } catch (err) {
          console.error(`Failed to delete folder ${dir}:`, err);
        }
      }
    }
    

    
    console.log('DELETE /api/orders/:id - Deleted order:', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/orders/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Löschen des Auftrags', details: err.message });
  }
});

// === COMPONENTS API ===
// GET /api/orders/:orderId/components - Get all components for an order
app.get('/api/orders/:orderId/components', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
    const components = await db.collection('Component').find({ 
      orderId: new ObjectId(req.params.orderId) 
    }).toArray();
    
    // Enrich components with their documents
    const enrichedComponents = await Promise.all(components.map(async (component) => {
      // Support both ObjectId and String componentId (for backwards compatibility)
      const compDocuments = await db.collection('Document').find({ 
        $or: [
          { componentId: component._id },
          { componentId: component._id.toString() }
        ]
      }).toArray();
      
      const { _id, ...componentWithoutId } = component;
      return {
        ...componentWithoutId,
        id: _id.toString(),
        documents: compDocuments
      };
    }));
    
    await client.close();
    
    console.log('GET /api/orders/:orderId/components - Loaded', enrichedComponents.length, 'components');
    res.json(enrichedComponents);
  } catch (err) {
    console.error('GET /api/orders/:orderId/components error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Komponenten', details: err.message });
  }
});

// POST /api/orders/:orderId/components - Create new component
app.post('/api/orders/:orderId/components', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const { title, name, description, material, quantity, notes, documents } = req.body;
    
    // Create new component
    const newComponent = {
      title: title || name,
      description: description || '',
      material: material || '',
      quantity: parseQuantity(quantity),
      notes: notes || '',
      orderId: new ObjectId(req.params.orderId),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('Component').insertOne(newComponent);
    
    // Create documents separately if provided
    if (documents && documents.length > 0) {
      const documentObjects = documents.map(doc => ({
        name: doc.name,
        url: doc.url,
        pdfWarning: doc.pdfWarning,
        uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
        componentId: result.insertedId,
        orderId: new ObjectId(req.params.orderId)
      }));
      await db.collection('Document').insertMany(documentObjects);
    }
    
    // Trigger auto-migration/organization with the existing db connection
    await autoMigrateOrderFiles(db, req.params.orderId);
    
    await client.close();
    
    const responseComponent = {
      ...newComponent,
      id: result.insertedId.toString(),
      _id: undefined,
      documents: documents || []
    };
    
    console.log('POST /api/orders/:orderId/components - Created component:', responseComponent.name);
    res.json(responseComponent);
  } catch (err) {
    console.error('POST /api/orders/:orderId/components error:', err);
    res.status(500).json({ error: 'Fehler beim Anlegen der Komponente', details: err.message });
  }
});

// PUT /api/components/:id - Update component
app.put('/api/components/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const { name, description, material, quantity, notes, documents } = req.body;
    
    // Build update data
    const updateData = {
      updatedAt: new Date()
    };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (material !== undefined) updateData.material = material;
    if (quantity !== undefined) updateData.quantity = parseQuantity(quantity);
    if (notes !== undefined) updateData.notes = notes;
    
    // Update component
    const result = await db.collection('Component').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      await client.close();
      return res.status(404).json({ error: 'Komponente nicht gefunden' });
    }
    
    // Handle documents if provided
    if (documents !== undefined) {
      // Delete existing component documents
      await db.collection('Document').deleteMany({ 
        componentId: new ObjectId(req.params.id) 
      });
      
      // Create new documents
      if (documents.length > 0) {
        const component = await db.collection('Component').findOne({ _id: new ObjectId(req.params.id) });
        const documentObjects = documents.map(doc => ({
          name: doc.name,
          url: doc.url,
          pdfWarning: doc.pdfWarning,
          uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
          componentId: new ObjectId(req.params.id),
          orderId: component.orderId
        }));
        await db.collection('Document').insertMany(documentObjects);
      }
    }
    
    // Get updated component with documents
    const updatedComponent = await db.collection('Component').findOne({ _id: new ObjectId(req.params.id) });
    const compDocuments = await db.collection('Document').find({ 
      componentId: new ObjectId(req.params.id) 
    }).toArray();
    
    await client.close();
    
    const responseComponent = {
      ...updatedComponent,
      id: updatedComponent._id.toString(),
      _id: undefined,
      documents: compDocuments
    };
    
    console.log('PUT /api/components/:id - Updated component:', responseComponent.name);
    res.json(responseComponent);
  } catch (err) {
    console.error('PUT /api/components/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Komponente', details: err.message });
  }
});

// DELETE /api/components/:id - Delete component
app.delete('/api/components/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
    // Delete component documents
    await db.collection('Document').deleteMany({ 
      componentId: new ObjectId(req.params.id) 
    });
    
    // Delete component
    const result = await db.collection('Component').deleteOne({ 
      _id: new ObjectId(req.params.id) 
    });
    
    await client.close();
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Komponente nicht gefunden' });
    }
    
    console.log('DELETE /api/components/:id - Deleted component:', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/components/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Löschen der Komponente', details: err.message });
  }
});


// POST /api/orders/:id/remind - Send manual reminder
app.post('/api/orders/:id/remind', requireRoleLevel('employee'), async (req, res) => {
  try {
    const { client, db } = await getDB();
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    if (order.status !== 'waiting_confirmation') {
      await client.close();
      return res.status(400).json({ error: 'Auftrag wartet nicht auf Endabnahme' });
    }

    const clientUser = await db.collection('User').findOne({ _id: new ObjectId(order.clientId) });
    if (!clientUser || !clientUser.email) {
      await client.close();
      return res.status(400).json({ error: 'Kunde hat keine E-Mail-Adresse hinterlegt' });
    }

    const emailScript = require('./scripts/email-notifications.cjs');
    await emailScript.sendWaitingConfirmationEmail(transporter, db, req.params.id, order, true);

    // Add 0 to remindersSent if manually triggered (or just leave it out so auto-reminder still works for today)
    // We don't necessarily need to add to remindersSent here, but it's fine.

    await client.close();
    res.json({ message: 'Erinnerung erfolgreich gesendet' });
  } catch (err) {
    console.error('POST /api/orders/:id/remind error:', err);
    res.status(500).json({ error: 'Fehler beim Senden der Erinnerung' });
  }
});


// GET /api/orders/:id/audit-log - Get audit logs for an order
app.get('/api/orders/:id/audit-log', async (req, res) => {
  try {
    const { client, db } = await getDB();
    const logs = await db.collection('AuditLog')
      .find({ orderId: req.params.id })
      .sort({ timestamp: -1 })
      .toArray();
      
    await client.close();
    res.json(logs);
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/orders/:id/network-folder - Get network folder status for order
app.get('/api/orders/:id/network-folder', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    // Get order from matchdb (where orders are stored)
    const ordersDb = client.db(DB_NAME);
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Get network configuration from environment (External path for user clipboard)
    const externalNetworkPath = process.env.NETWORK_CLIPBOARD_PATH || process.env.SMB_SHARE_PATH;
    
    // Fallback to database configuration if not in env
    const settingsCollection = ordersDb.collection('settings');
    const networkConfig = await settingsCollection.findOne({ type: 'network-config' });
    
    // Internal path used by Node.js to read/write files (e.g. /app/storage/network)
    const internalNetworkPath = networkConfig && networkConfig.networkPath ? networkConfig.networkPath : null;
    const finalExternalPath = externalNetworkPath || internalNetworkPath;
    
    if (!internalNetworkPath) {
      await client.close();
      return res.json({
        success: false,
        message: 'Kein interner Netzwerkpfad konfiguriert',
        exists: false
      });
    }
    
    const orderFolderName = await getOrCreateOrderFolderName(ordersDb, order);
    
    let potentialPath;
    if (finalExternalPath && (finalExternalPath.startsWith('//') || finalExternalPath.startsWith('\\\\'))) {
      const sep = finalExternalPath.includes('\\') ? '\\' : '/';
      potentialPath = finalExternalPath.endsWith(sep) ? finalExternalPath + orderFolderName : finalExternalPath + sep + orderFolderName;
      // Convert to Windows format for clipboard
      potentialPath = potentialPath.replace(/\//g, '\\');
    } else {
      potentialPath = finalExternalPath ? path.join(finalExternalPath, orderFolderName) : '';
    }

    // Check if internal network path is accessible by Node.js
    const networkPathExists = fs.existsSync(internalNetworkPath);
    
    if (!networkPathExists) {
      await client.close();
      return res.json({
        success: false,
        message: 'Interner Netzwerkpfad nicht erreichbar',
        networkPath: finalExternalPath,
        potentialPath: potentialPath,
        exists: false
      });
    }
    
    await client.close();
    
    // Check if order folder exists internally
    const internalOrderFolderPath = path.join(internalNetworkPath, orderFolderName);
    const orderFolderExists = fs.existsSync(internalOrderFolderPath);
    
    res.json({
      success: true,
      orderNumber: order.orderNumber,
      networkPath: finalExternalPath,
      potentialPath: potentialPath,
      exists: orderFolderExists,
      canCreate: !orderFolderExists,
      message: orderFolderExists ? 
        'Auftragordner existiert bereits' : 
        'Auftragordner kann erstellt werden'
    });
    
  } catch (err) {
    console.error('GET /api/orders/:id/network-folder error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Prüfen des Netzwerkordners' });
  }
});

// POST /api/orders/:id/network-folder - Create network folder for order
app.post('/api/orders/:id/network-folder', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    // Get order from matchdb (where orders are stored)
    const ordersDb = client.db(DB_NAME);
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Get network configuration
    const settingsCollection = ordersDb.collection('settings');
    const networkConfig = await settingsCollection.findOne({ type: 'network-config' });
    
    if (!networkConfig || !networkConfig.networkPath) {
      await client.close();
      return res.status(400).json({ success: false, error: 'Kein Netzwerkpfad konfiguriert' });
    }
    
    // Check if network path is accessible
    const networkPathExists = fs.existsSync(networkConfig.networkPath);
    
    if (!networkPathExists) {
      await client.close();
      return res.status(400).json({ success: false, error: 'Netzwerkpfad nicht erreichbar' });
    }
    
    const orderFolderName = await getOrCreateOrderFolderName(ordersDb, order);
    await client.close();
    
    // Create uploads order folder and Interne Dokumente subfolder
    const uploadsFolderPath = path.join(networkConfig.networkPath, orderFolderName);
    if (!fs.existsSync(uploadsFolderPath)) {
      fs.mkdirSync(uploadsFolderPath, { recursive: true });
    }
    
    const interneDocsPath = path.join(uploadsFolderPath, '00_Interne Dokumente');
    if (!fs.existsSync(interneDocsPath)) {
      fs.mkdirSync(interneDocsPath, { recursive: true });
    }
    
    res.json({
      success: true,
      message: 'Auftragordner erfolgreich erstellt',
      folderPath: uploadsFolderPath
    });
    
  } catch (err) {
    console.error('POST /api/orders/:id/network-folder error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Erstellen des Netzwerkordners' });
  }
});

// POST /api/orders/:id/sync - Synchronize physical folder with DB
app.post('/api/orders/:id/sync', async (req, res) => {
  try {
    const { MongoClient, ObjectId } = require('mongodb');
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    
    const orderId = req.params.id;
    const order = await db.collection('Order').findOne({ _id: new ObjectId(orderId) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    const orderFolderName = await getOrCreateOrderFolderName(db, order);
    const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
    
    const isNetworkActive = networkConfig && networkConfig.networkPath && fs.existsSync(networkConfig.networkPath);
    let baseUploadsDir;
    
    // Automatically migrate any offline files if the network is active
    if (isNetworkActive) {
      await autoMigrateOrderFiles(db, orderId);
      baseUploadsDir = networkConfig.networkPath;
    } else {
      baseUploadsDir = path.join(__dirname, 'storage');
    }
    
    const targetFolderPath = path.join(baseUploadsDir, orderFolderName);
    
    if (!fs.existsSync(targetFolderPath)) {
      // Folder doesn't exist yet, nothing to sync
      await client.close();
      return res.json({ success: true, message: 'Ordner existiert noch nicht, kein Sync notwendig' });
    }
    
    // Get all components for this order
    const components = await db.collection('Component').find({ orderId: new ObjectId(orderId) }).toArray();
    
    // Get all existing documents in DB for this order
    const existingDocs = await db.collection('Document').find({ orderId: new ObjectId(orderId) }).toArray();
    const existingDocMap = new Map(); // Key: decoded URL or path identifier, Value: document
    
    // Create a normalized path identifier for each existing document
    for (const doc of existingDocs) {
      if (!doc.url) continue;
      // Extract the relative path from the URL, decode it
      let relativeUrl = decodeURIComponent(doc.url.replace(/^\/(network-files|uploads)\//, ''));
      existingDocMap.set(relativeUrl, doc);
    }
    
    const foundPhysicalPaths = new Set();
    const newDocsToInsert = [];
    
    // Helper to process a directory
    const processDirectory = (dirPath, relativeDirUrl, componentId, isCam = false) => {
      if (!fs.existsSync(dirPath)) return;
      
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isFile()) {
          // It's a file!
          const relativeFilePathUrl = relativeDirUrl ? `${relativeDirUrl}/${file}` : file;
          foundPhysicalPaths.add(relativeFilePathUrl);
          
          if (!existingDocMap.has(relativeFilePathUrl)) {
            // Document doesn't exist in DB! Let's add it
            const isNetwork = isNetworkActive;
            const documentUrl = isNetwork 
              ? `/network-files/${relativeDirUrl ? `${relativeDirUrl}/` : ''}${encodeURIComponent(file)}`
              : `/uploads/${relativeDirUrl ? `${relativeDirUrl}/` : ''}${encodeURIComponent(file)}`; // keep /uploads/ route since express still mounts /uploads to storage
              
            const mimeType = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 
                             file.toLowerCase().endsWith('.stl') ? 'model/stl' : 
                             file.toLowerCase().endsWith('.stp') || file.toLowerCase().endsWith('.step') ? 'model/step' : 
                             'application/octet-stream';
                             
            const newDoc = {
              name: file,
              url: documentUrl,
              networkPath: isNetwork ? fullPath : undefined,
              uploadDate: stat.mtime,
              orderId: new ObjectId(orderId),
              size: stat.size,
              mimetype: mimeType,
              migrated: isNetwork,
              migratedAt: isNetwork ? new Date() : undefined
            };
            
            if (componentId) {
              newDoc.componentId = new ObjectId(componentId);
            }
            if (isCam) {
              newDoc.type = 'model/stl';
            }
            
            newDocsToInsert.push(newDoc);
          }
        }
      }
    };
    
    // 1. Process root directory (General Order Documents)
    processDirectory(targetFolderPath, orderFolderName, null, false);
    
    // 2. Process 00_Interne Dokumente (CAM files)
    const internePath = path.join(targetFolderPath, '00_Interne Dokumente');
    processDirectory(internePath, `${orderFolderName}/00_Interne Dokumente`, null, true);
    
    // 3. Process each component's subdirectory
    for (const comp of components) {
      const componentFolderName = await getComponentFolderName(db, orderId, comp._id, targetFolderPath);
      
      const compPath = path.join(targetFolderPath, componentFolderName);
      processDirectory(compPath, `${orderFolderName}/${componentFolderName}`, comp._id, false);
    }
    
    // Now determine which documents to delete from DB (they exist in DB but not physically)
    const docsToDelete = [];
    for (const [relPath, doc] of existingDocMap.entries()) {
      if (!foundPhysicalPaths.has(relPath)) {
        // ONLY delete if the document belongs to the storage we are currently scanning!
        // This prevents deleting network docs when falling back to local storage,
        // and prevents deleting local docs when network is active.
        if (isNetworkActive && doc.migrated) {
          docsToDelete.push(doc._id);
        } else if (!isNetworkActive && !doc.migrated) {
          docsToDelete.push(doc._id);
        }
      }
    }
    
    // Execute DB operations
    if (newDocsToInsert.length > 0) {
      await db.collection('Document').insertMany(newDocsToInsert);
    }
    
    if (docsToDelete.length > 0) {
      await db.collection('Document').deleteMany({ _id: { $in: docsToDelete } });
    }
    
    if (newDocsToInsert.length > 0 || docsToDelete.length > 0) {
      const wss = req.app.get('wss');
      if (wss) {
        const msg = JSON.stringify({ type: 'orderUpdated', payload: { id: orderId } });
        wss.clients.forEach(client => {
          if (client.readyState === 1 /* WebSocket.OPEN */) {
            client.send(msg);
          }
        });
      }
    }
    
    await client.close();
    
    res.json({ 
      success: true, 
      added: newDocsToInsert.length, 
      deleted: docsToDelete.length,
      message: `Sync abgeschlossen: ${newDocsToInsert.length} hinzugefügt, ${docsToDelete.length} entfernt`
    });
    
  } catch (err) {
    console.error('POST /api/orders/:id/sync error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Synchronisieren des Ordners' });
  }
});

// POST /api/orders/:id/migrate-files - Migrate order files to network folder
app.post('/api/orders/:id/migrate-files', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    
    // Check if order exists
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Check if network config is active
    const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
    const isNetworkActive = networkConfig && networkConfig.networkPath && fs.existsSync(networkConfig.networkPath);
    
    if (!isNetworkActive) {
      await client.close();
      return res.status(400).json({ success: false, error: 'Netzwerkpfad nicht konfiguriert oder nicht erreichbar' });
    }
    
    // Run the migration
    await autoMigrateOrderFiles(db, req.params.id);
    
    await client.close();
    res.json({ success: true, message: 'Dateien erfolgreich ins Netzwerk migriert' });
  } catch (err) {
    console.error('POST /api/orders/:id/migrate-files error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Migrieren der Dateien', details: err.message });
  }
});

// GET /api/orders/:id/migration-status - Check migration status of order files
app.get('/api/orders/:id/migration-status', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    const ordersDb = client.db(DB_NAME);
    
    // Check both embedded documents in Order and separate Document collection
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    // Get order documents (not component documents)
    const separateOrderDocuments = await ordersDb.collection('Document').find({ 
      orderId: new ObjectId(req.params.id),
      componentId: { $exists: false }
    }).toArray();
    
    // Get component documents
    const componentDocuments = await ordersDb.collection('Document').find({ 
      orderId: new ObjectId(req.params.id),
      componentId: { $exists: true }
    }).toArray();
    
    await client.close();
    
    // Combine embedded and separate documents
    let allDocuments = [];
    
    // Add embedded documents from Order
    if (order && order.documents && order.documents.length > 0) {
      allDocuments = order.documents.map((doc, index) => ({
        _id: doc.id || doc._id || `embedded-${index}`,
        name: doc.name,
        url: doc.url,
        pdfWarning: doc.pdfWarning,
        migrated: doc.migrated || false,
        migratedAt: doc.migratedAt,
        originalUrl: doc.originalUrl,
        type: 'order'
      }));
    } else if (separateOrderDocuments.length > 0) {
      // Add separate order documents if Order has none embedded
      allDocuments = separateOrderDocuments.map(doc => ({
        ...doc,
        type: 'order'
      }));
    }
    
    // Add component documents
    for (const compDoc of componentDocuments) {
      allDocuments.push({
        ...compDoc,
        type: 'component'
      });
    }
    
    const migrationStatus = {
      totalFiles: allDocuments.length,
      migratedFiles: allDocuments.filter(doc => doc.migrated).length,
      pendingFiles: allDocuments.filter(doc => !doc.migrated).length,
      files: allDocuments.map(doc => ({
        id: doc._id ? doc._id.toString() : doc.id,
        name: doc.name,
        migrated: !!doc.migrated,
        migratedAt: doc.migratedAt,
        currentUrl: doc.url,
        originalUrl: doc.originalUrl || doc.url,
        type: doc.type || 'order'
      }))
    };
    
    res.json(migrationStatus);
  } catch (err) {
    console.error('GET /api/orders/:id/migration-status error:', err);
    res.status(500).json({ error: 'Fehler beim Abrufen des Migrationsstatus' });
  }
});

// POST /api/orders/:id/rollback-migration - Rollback file migration
app.post('/api/orders/:id/rollback-migration', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    const orderFolderName = await getOrCreateOrderFolderName(db, order);
    
    // Check if network path is configured and active (since we need it to copy files back)
    const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
    
    if (!networkConfig || !networkConfig.networkPath || !fs.existsSync(networkConfig.networkPath)) {
      await client.close();
      return res.status(400).json({ success: false, error: 'Netzwerkpfad nicht verfügbar. Dateien können nicht zurückkopiert werden.' });
    }
    
    // Fetch all migrated documents for this order
    const documents = await db.collection('Document').find({ 
      orderId: new ObjectId(req.params.id),
      migrated: true
    }).toArray();
    
    let rolledBackFiles = 0;
    const errors = [];
    
    // Define local base directory for restoring files
    const localStorageDir = path.join(__dirname, 'storage');
    
    for (const document of documents) {
      try {
        const netPath = document.networkPath;
        if (!netPath || !fs.existsSync(netPath)) {
          errors.push(`Datei auf Netzwerklaufwerk nicht gefunden: ${document.name}`);
          continue;
        }
        
        // Determine local destination path and local URL based on document type
        const basename = path.basename(netPath);
        let localDestPath;
        let localUrl;
        
        if (document.url && (document.url.includes('/00_Interne%20Dokumente/') || document.url.includes('/00_Interne Dokumente/'))) {
          // Internal document
          const localInterneDirPath = path.join(localStorageDir, orderFolderName, '00_Interne Dokumente');
          if (!fs.existsSync(localInterneDirPath)) {
            fs.mkdirSync(localInterneDirPath, { recursive: true });
          }
          localDestPath = path.join(localInterneDirPath, basename);
          localUrl = `/uploads/${orderFolderName}/00_Interne%20Dokumente/${encodeURIComponent(basename)}`;
        } else if (document.componentId) {
          // Component document – use numbered folder name
          const orderDir = path.join(localStorageDir, orderFolderName);
          const componentFolderName = await getComponentFolderName(db, order._id.toString(), document.componentId, orderDir);
          
          const localCompDir = path.join(localStorageDir, orderFolderName, componentFolderName);
          if (!fs.existsSync(localCompDir)) {
            fs.mkdirSync(localCompDir, { recursive: true });
          }
          localDestPath = path.join(localCompDir, basename);
          localUrl = `/uploads/${orderFolderName}/${encodeURIComponent(componentFolderName)}/${encodeURIComponent(basename)}`;
        } else {
          // Standard order document
          const localOrderDir = path.join(localStorageDir, orderFolderName);
          if (!fs.existsSync(localOrderDir)) {
            fs.mkdirSync(localOrderDir, { recursive: true });
          }
          localDestPath = path.join(localOrderDir, basename);
          localUrl = `/uploads/${orderFolderName}/${encodeURIComponent(basename)}`;
        }
        
        // Copy file from network to local
        fs.copyFileSync(netPath, localDestPath);
        
        // Update document metadata
        await db.collection('Document').updateOne(
          { _id: document._id },
          { 
            $set: { 
              url: localUrl
            },
            $unset: {
              networkPath: '',
              migrated: '',
              migratedAt: ''
            }
          }
        );
        
        // Delete file from network drive
        try {
          fs.unlinkSync(netPath);
        } catch (delError) {
          console.warn(`[Rollback] Could not delete network file ${netPath}:`, delError.message);
        }
        
        rolledBackFiles++;
      } catch (err) {
        errors.push(`Fehler beim Zurücksetzen von ${document.name}: ${err.message}`);
      }
    }
    
    // Check if documents are also embedded in Order
    if (order.documents && order.documents.length > 0) {
      const updatedDocuments = await db.collection('Document').find({ 
        orderId: new ObjectId(req.params.id),
        componentId: { $exists: false }
      }).toArray();
      
      const embeddedDocs = order.documents.map(doc => {
        const matchingDoc = updatedDocuments.find(d => d.name === doc.name);
        if (matchingDoc) {
          return {
            ...doc,
            url: matchingDoc.url,
            migrated: false,
            migratedAt: undefined,
            networkPath: undefined
          };
        }
        return doc;
      });
      
      await db.collection('Order').updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { documents: embeddedDocs } }
      );
    }
    
    await client.close();
    
    res.json({
      success: true,
      message: `${rolledBackFiles} Datei(en) erfolgreich zurückgesetzt`,
      rollbackResult: {
        rolledBackFiles,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (err) {
    console.error('POST /api/orders/:id/rollback-migration error:', err);
    res.status(500).json({ error: 'Fehler beim Zurücksetzen der Migration' });
  }
});

// GET /api/orders/:id/files/:filename - Direct file access by original filename
app.get('/api/orders/:id/files/:filename', fileDownloadGuard, async (req, res) => {
  console.log(`[Download] Request for order: ${req.params.id}, file: ${req.params.filename}`);
  try {
    const { client, db } = await getDB();
    // Try to find order by orderNumber first, then by ObjectId if that fails
    let order = await db.collection('Order').findOne({ orderNumber: req.params.id });
    if (!order && ObjectId.isValid(req.params.id)) {
      order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    }
    if (!order) {
      console.log(`[Download] Order not found: ${req.params.id}`);
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    console.log(`[Download] Found order: ${order.orderNumber} (${order._id})`);
    const settingsCollection = db.collection('settings');
    let networkConfig = await settingsCollection.findOne({ type: 'network-config' });
    console.log(`[Download] Network config:`, networkConfig);
    
    // Fallback: If no network config found, use the known path
    if (!networkConfig) {
      console.log(`[Download] No network config found, using fallback path`);
      networkConfig = { networkPath: 'C:\\Users\\maxim\\OneDrive\\Desktop\\Aufträge' };
    }
    
    await client.close();

    const filename = decodeURIComponent(req.params.filename);
    console.log(`[Download] Looking for file: ${filename}`);

    // Resolve potential paths
    let networkPath = undefined;
    if (networkConfig && networkConfig.networkPath) {
      console.log(`[Download] Network path from config: ${networkConfig.networkPath}`);
      if (fs.existsSync(networkConfig.networkPath)) {
        console.log(`[Download] Network path exists`);
        const orderFolderName = order.orderNumber || order._id.toString();
        const p = path.join(networkConfig.networkPath, orderFolderName, filename);
        console.log(`[Download] Checking network path: ${p}`);
        if (fs.existsSync(p)) {
          networkPath = p;
          console.log(`[Download] Network file found: ${networkPath}`);
        } else {
          const orderFolderName = order.orderNumber || order._id.toString();
          const pArchiv = path.join(networkConfig.networkPath, 'Archiv', orderFolderName, filename);
          if (fs.existsSync(pArchiv)) {
            networkPath = pArchiv;
            console.log(`[Download] Network file found in Archiv: ${networkPath}`);
          } else {
            console.log(`[Download] Network file not found`);
          }
        }
      } else {
        console.log(`[Download] Network path doesn't exist: ${networkConfig.networkPath}`);
      }
    } else {
      console.log(`[Download] No network config or networkPath`);
    }

    let uploadsPath = undefined;
    try {
      const { client: docClient, db: docDb } = await getDB();
      // Use the order._id we already found, not the request parameter
      console.log(`[Download] Checking uploads for orderId: ${order._id}, filename: ${filename}`);
      const doc = await docDb.collection('Document').findOne({ orderId: order._id, name: filename });
      await docClient.close();
      if (doc && doc.url) {
        const p = path.join(uploadsDir, path.basename(doc.url));
        console.log(`[Download] Checking uploads path: ${p}`);
        if (fs.existsSync(p)) {
          uploadsPath = p;
          console.log(`[Download] Uploads file found: ${uploadsPath}`);
        } else {
          // It might be in the new structured order folder or in Archiv
          // First, check the new structured path
          const orderFolderName = order.orderNumber || order._id.toString();
          const pStructured = path.join(uploadsDir, orderFolderName, filename);
          const pArchiv = path.join(uploadsDir, 'Archiv', orderFolderName, filename);
          const pArchivOld = path.join(uploadsDir, 'Archiv', path.basename(doc.url));
          
          if (fs.existsSync(pStructured)) {
            uploadsPath = pStructured;
            console.log(`[Download] Uploads file found in structured dir: ${uploadsPath}`);
          } else if (fs.existsSync(pArchiv)) {
            uploadsPath = pArchiv;
            console.log(`[Download] Uploads file found in Archiv: ${uploadsPath}`);
          } else if (fs.existsSync(pArchivOld)) {
            uploadsPath = pArchivOld;
            console.log(`[Download] Uploads file found in old Archiv: ${uploadsPath}`);
          } else {
            console.log(`[Download] Uploads file not found`);
          }
        }
      } else {
        console.log(`[Download] No document record found in database`);
      }
    } catch (err) {
      console.log(`[Download] Error checking uploads: ${err.message}`);
    }

    // Choose file with network priority (network always wins if available)
    let chosenPath = undefined;
    let debugInfo = {};
    
    if (networkPath && uploadsPath) {
      const netStat = fs.statSync(networkPath);
      const upStat = fs.statSync(uploadsPath);
      // ALWAYS prefer network over uploads
      chosenPath = networkPath;
      debugInfo = {
        networkPath,
        uploadsPath,
        networkMtime: netStat.mtime.toISOString(),
        uploadsMtime: upStat.mtime.toISOString(),
        chosen: 'network (priority)',
        reason: 'Network always has priority over uploads'
      };
      console.log(`[Download network priority] ${JSON.stringify(debugInfo)}`);
    } else if (networkPath) {
      chosenPath = networkPath;
      debugInfo = { networkPath, source: 'network-only' };
      console.log(`[Download network-only] ${JSON.stringify(debugInfo)}`);
    } else if (uploadsPath) {
      chosenPath = uploadsPath;
      debugInfo = { uploadsPath, source: 'uploads-only' };
      console.log(`[Download uploads-only] ${JSON.stringify(debugInfo)}`);
    }

    if (!chosenPath) {
      console.log(`[Download] No file found - networkPath: ${networkPath}, uploadsPath: ${uploadsPath}`);
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    // Force file system cache refresh
    fs.access(chosenPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`[Download] File access error: ${err.message}`);
        return res.status(404).json({ error: 'Datei nicht verfügbar' });
      }
      if (req.query.inline === 'true') {
        res.set('Cache-Control', 'public, max-age=3600');
        if (chosenPath.toLowerCase().endsWith('.pdf')) {
          res.set('Content-Type', 'application/pdf');
          res.set('Content-Disposition', 'inline');
        }
        console.log(`[Download] Serving inline: ${chosenPath}`);
        return res.sendFile(chosenPath, { etag: false, lastModified: true });
      }

      // Strong cache prevention with additional headers (only for downloads)
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      res.set('X-Accel-Expires', '0');
      res.set('Vary', '*');
      
      // Add timestamp to ensure freshness
      const stats = fs.statSync(chosenPath);
      res.set('Last-Modified', stats.mtime.toUTCString());
      res.set('ETag', `"${stats.mtime.getTime()}-${stats.size}"`);
      res.set('X-File-Path', chosenPath);
      res.set('X-File-Mtime', stats.mtime.toISOString());
      
      console.log(`[Download] Serving download: ${chosenPath} (size: ${stats.size}, mtime: ${stats.mtime.toISOString()})`);
      res.download(chosenPath, filename);
    });
  } catch (err) {
    console.error('GET /api/orders/:id/files/:filename error:', err);
    res.status(500).json({ error: 'Fehler beim Herunterladen der Datei', details: err.message });
  }
});

app.get('/api/documents/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    let document = null;
    
    // Try to find document by various possible ID formats
    if (ObjectId.isValid(req.params.id)) {
      document = await db.collection('Document').findOne({ _id: new ObjectId(req.params.id) });
      if (!document) {
        document = await db.collection('ComponentDocument').findOne({ _id: new ObjectId(req.params.id) });
      }
    }
    
    // If not found by ObjectId, try other fields (adapt as needed for your schema)
    if (!document) {
      document = await db.collection('Document').findOne({ documentId: req.params.id });
      if (!document) {
        document = await db.collection('ComponentDocument').findOne({ documentId: req.params.id });
      }
    }
    
    if (!document) {
      await client.close();
      return res.status(404).json({ error: 'Dokument nicht gefunden' });
    }
    
    const config = await db.collection('settings').findOne({ type: 'file-visibility-config' });
    if (config && config.restrictedExtensions && config.restrictedExtensions.length > 0) {
      const ext = '.' + (document.name || '').split('.').pop().toLowerCase();
      const restrictedExts = config.restrictedExtensions.map(e => e.toLowerCase());
      if (restrictedExts.includes(ext)) {
        const cookies = parseCookies(req);
        let viewerRole = 'guest';
        if (cookies.sessionId) {
          const session = await db.collection('Session').findOne({ token: cookies.sessionId });
          if (session && session.role) viewerRole = normalizeUserRole(session.role);
        }
        if (viewerRole === 'client' || viewerRole === 'guest' || !viewerRole) {
          await client.close();
          return res.status(403).json({ error: 'Zugriff auf diesen Dateityp verweigert.' });
        }
      }
    }
    
    const settingsCollection = db.collection('settings');
    const networkConfig = await settingsCollection.findOne({ type: 'network-config' });

    // Find related order (for network folder resolution)
    const order = await db.collection('Order').findOne({
      $or: [
        { 'documents._id': new ObjectId(req.params.id) },
        { 'documents.id': req.params.id },
        { _id: document.orderId }
      ]
    });

    await client.close();

    // Resolve potential paths
    let networkPath = undefined;
    if (document.migrated && document.networkPath && fs.existsSync(document.networkPath)) {
      networkPath = document.networkPath;
    } else if (networkConfig && networkConfig.networkPath && order) {
      const orderFolderName = order.orderNumber || order._id.toString();
      const p = path.join(networkConfig.networkPath, orderFolderName, document.name);
      if (fs.existsSync(p)) {
        networkPath = p;
      } else {
        const pArchiv = path.join(networkConfig.networkPath, 'Archiv', orderFolderName, document.name);
        if (fs.existsSync(pArchiv)) networkPath = pArchiv;
      }
    }

    let uploadsPath = undefined;
    if (document.url) {
      const decodedUrl = decodeURIComponent(document.url);
      if (decodedUrl.startsWith('/uploads/')) {
        const relativePath = decodedUrl.substring('/uploads/'.length);
        const pUp = path.join(uploadsDir, relativePath);
        if (fs.existsSync(pUp)) {
          uploadsPath = pUp;
        } else {
          const pArchiv = path.join(uploadsDir, 'Archiv', relativePath);
          if (fs.existsSync(pArchiv)) uploadsPath = pArchiv;
        }
      } else {
        const pUp = path.join(uploadsDir, path.basename(document.url));
        if (fs.existsSync(pUp)) {
          uploadsPath = pUp;
        } else if (order) {
          const orderFolderName = order.orderNumber || order._id.toString();
          const pArchiv = path.join(uploadsDir, 'Archiv', orderFolderName, path.basename(document.url));
          if (fs.existsSync(pArchiv)) {
            uploadsPath = pArchiv;
          } else {
            const pArchivOld = path.join(uploadsDir, 'Archiv', path.basename(document.url));
            if (fs.existsSync(pArchivOld)) uploadsPath = pArchivOld;
          }
        }
      }
    }

    // Choose the newest available file (prefer newer uploads if network is older)
    let chosenPath = undefined;
    let debugInfo = {};
    
    if (networkPath && uploadsPath) {
      const netStat = fs.statSync(networkPath);
      const upStat = fs.statSync(uploadsPath);
      chosenPath = upStat.mtime > netStat.mtime ? uploadsPath : networkPath;
      debugInfo = {
        networkPath,
        uploadsPath,
        networkMtime: netStat.mtime.toISOString(),
        uploadsMtime: upStat.mtime.toISOString(),
        chosen: chosenPath === networkPath ? 'network' : 'uploads'
      };
      console.log(`[Download by id choose newest] ${JSON.stringify(debugInfo)}`);
    } else if (networkPath) {
      chosenPath = networkPath;
      debugInfo = { networkPath, source: 'network-only' };
      console.log(`[Download by id network-only] ${JSON.stringify(debugInfo)}`);
    } else if (uploadsPath) {
      chosenPath = uploadsPath;
      debugInfo = { uploadsPath, source: 'uploads-only' };
      console.log(`[Download by id uploads-only] ${JSON.stringify(debugInfo)}`);
    }

    if (!chosenPath) return res.status(404).json({ error: 'Datei nicht gefunden' });

    // Force file system cache refresh
    fs.access(chosenPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`[Download by ID] File access error: ${err.message}`);
        return res.status(404).json({ error: 'Datei nicht verfügbar' });
      }
      if (req.query.inline === 'true') {
        res.set('Cache-Control', 'public, max-age=3600');
        if (chosenPath.toLowerCase().endsWith('.pdf')) {
          res.set('Content-Type', 'application/pdf');
          res.set('Content-Disposition', 'inline');
        }
        console.log(`[Download by ID] Serving inline: ${chosenPath}`);
        return res.sendFile(chosenPath, { etag: false, lastModified: true });
      }

      // Strong cache prevention with additional headers (only for downloads)
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      res.set('X-Accel-Expires', '0');
      res.set('Vary', '*');
      
      // Add timestamp to ensure freshness
      const stats = fs.statSync(chosenPath);
      res.set('Last-Modified', stats.mtime.toUTCString());
      res.set('ETag', `"${stats.mtime.getTime()}-${stats.size}"`);
      res.set('X-File-Path', chosenPath);
      res.set('X-File-Mtime', stats.mtime.toISOString());
      
      console.log(`[Download by ID] Serving download: ${chosenPath} (size: ${stats.size}, mtime: ${stats.mtime.toISOString()})`);
      res.download(chosenPath, document.name);
    });
  } catch (err) {
    console.error('GET /api/documents/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Herunterladen der Datei', details: err.message });
  }
});

// Network Configuration APIs
app.get('/api/admin/network-config', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    const settingsCollection = db.collection('settings');
    
    const networkConfig = await settingsCollection.findOne({ type: 'network-config' });
    
    await client.close();
    
    if (networkConfig) {
      res.json({
        success: true,
        networkPath: networkConfig.networkPath,
        description: networkConfig.description || ''
      });
    } else {
      res.json({
        success: true,
        networkPath: '',
        description: ''
      });
    }
  } catch (err) {
    console.error('GET /api/admin/network-config error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Laden der Netzwerkkonfiguration' });
  }
});

app.post('/api/admin/network-config', async (req, res) => {
  try {
    const { networkPath } = req.body;
    
    if (!networkPath) {
      return res.status(400).json({ success: false, error: 'Netzwerkpfad ist erforderlich' });
    }

    if (isStaticIpPath(networkPath)) {
      return res.status(400).json({
        success: false,
        error: 'Statische IP-Pfade sind nicht erlaubt. Bitte verwenden Sie einen DNS-Hostnamen oder ein gemapptes Laufwerk.'
      });
    }
    
    // Test if path exists
    const pathExists = fs.existsSync(networkPath);
    
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    const settingsCollection = db.collection('settings');
    
    await settingsCollection.replaceOne(
      { type: 'network-config' },
      {
        type: 'network-config',
        networkPath: networkPath,
        description: pathExists ? 'Pfad erreichbar' : 'Pfad nicht gefunden',
        lastUpdated: new Date(),
        accessible: pathExists
      },
      { upsert: true }
    );
    
    await client.close();
    
    res.json({
      success: true,
      message: pathExists ? 'Netzwerkpfad erfolgreich konfiguriert' : 'Netzwerkpfad gespeichert (Warnung: Pfad nicht erreichbar)',
      accessible: pathExists
    });
  } catch (err) {
    console.error('POST /api/admin/network-config error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Speichern der Netzwerkkonfiguration' });
  }
});

app.get('/api/admin/default-assignee', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    const settingsCollection = db.collection('settings');
    
    const config = await settingsCollection.findOne({ type: 'default-assignee-config' });
    
    await client.close();
    
    res.json(config || { userId: null });
  } catch (err) {
    console.error('GET /api/admin/default-assignee error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Standard-Zuweisung' });
  }
});

app.post('/api/admin/default-assignee', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    const settingsCollection = db.collection('settings');
    
    await settingsCollection.updateOne(
      { type: 'default-assignee-config' },
      { 
        $set: { 
          type: 'default-assignee-config',
          userId: userId || null,
          updatedAt: new Date()
        } 
      },
      { upsert: true }
    );
    
    await client.close();
    
    res.json({ success: true, message: 'Standard-Zuweisung gespeichert' });
  } catch (err) {
    console.error('POST /api/admin/default-assignee error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Speichern der Standard-Zuweisung' });
  }
});

app.get('/api/system/network-test', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    const settingsCollection = db.collection('settings');
    
    const networkConfig = await settingsCollection.findOne({ type: 'network-config' });
    
    await client.close();
    
    if (!networkConfig || !networkConfig.networkPath) {
      return res.json({
        success: false,
        message: 'Kein Netzwerkpfad konfiguriert'
      });
    }
    
    const pathExists = fs.existsSync(networkConfig.networkPath);
    
    res.json({
      success: pathExists,
      message: pathExists ? 
        `Netzwerkpfad "${networkConfig.networkPath}" ist erreichbar` : 
        `Netzwerkpfad "${networkConfig.networkPath}" ist nicht erreichbar`
    });
  } catch ( err) {
    console.error('GET /api/system/network-test error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Testen der Netzwerkverbindung' });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'MongoDB Match Werkstatt API is running!', timestamp: new Date().toISOString() });
});

// GET /api/orders/:id/network-files - List all files in order's network folder
app.get('/api/orders/:id/network-files', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    // Get order from matchdb
    const db = client.db(DB_NAME);
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    const orderFolderName = await getOrCreateOrderFolderName(db, order);
    
    // Get network configuration
    const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
    await client.close();
    
    let isNetworkActive = networkConfig && networkConfig.networkPath && fs.existsSync(networkConfig.networkPath);
    
    const files = [];
    
    function readFilesRecursively(folderPath, prefix, relativePath = '') {
      if (!fs.existsSync(folderPath)) return;
      const items = fs.readdirSync(folderPath);
      
      for (const item of items) {
        const itemPath = path.join(folderPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isFile()) {
          const relativeFilePath = relativePath ? path.join(relativePath, item) : item;
          const fullRelativePath = path.join(prefix, relativeFilePath);
          files.push({
            name: item,
            relativePath: fullRelativePath,
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
            created: stat.birthtime.toISOString(),
            extension: path.extname(item).toLowerCase(),
            downloadUrl: `/api/orders/${req.params.id}/network-files/${encodeURIComponent(fullRelativePath)}/download`
          });
        } else if (stat.isDirectory()) {
          const subRelativePath = relativePath ? path.join(relativePath, item) : item;
          readFilesRecursively(itemPath, prefix, subRelativePath);
        }
      }
    }
    
    // Scan uploads (Interne Dokumente is a subfolder within)
    let uploadsPath;
    if (isNetworkActive) {
      uploadsPath = path.join(networkConfig.networkPath, orderFolderName, '00_Interne Dokumente');
    } else {
      uploadsPath = path.join(__dirname, 'storage', orderFolderName, '00_Interne Dokumente');
    }
    
    readFilesRecursively(uploadsPath, '');
    
    // Sort files by name
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({
      success: true,
      message: `${files.length} Datei(en) gefunden`,
      files,
      folderPath: uploadsPath,
      networkFolderName: orderFolderName
    });
  } catch (err) {
    console.error('GET /api/orders/:id/network-files error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Laden der Netzwerkdateien' });
  }
});

// GET /api/orders/:id/network-files/:filename/download - Download file from order's network folder
app.get('/api/orders/:id/network-files/:filename/download', fileDownloadGuard, async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    // Get order from matchdb
    const db = client.db(DB_NAME);
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    const orderFolderName = await getOrCreateOrderFolderName(db, order);
    
    // Get network configuration
    const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
    await client.close();
    
    if (!networkConfig || !networkConfig.networkPath) {
      return res.status(400).json({ error: 'Kein Netzwerkpfad konfiguriert' });
    }
    
    // Check if network path is accessible
    if (!fs.existsSync(networkConfig.networkPath)) {
      return res.status(400).json({ error: 'Netzwerkpfad nicht erreichbar' });
    }
    
    const filename = decodeURIComponent(req.params.filename);
    
    // All files live under uploads/
    let relativeFileSubpath = '';
    if (filename.startsWith('uploads/') || filename.startsWith('uploads\\')) {
      relativeFileSubpath = filename.substring(8);
    } else {
      relativeFileSubpath = filename;
    }
    
    const orderFolderPath = path.join(networkConfig.networkPath, orderFolderName);
    const filePath = path.join(orderFolderPath, relativeFileSubpath);
    
    // Security check: ensure file is within order folder
    const resolvedFilePath = path.resolve(filePath);
    const resolvedOrderPath = path.resolve(orderFolderPath);
    
    if (!resolvedFilePath.startsWith(resolvedOrderPath)) {
      return res.status(400).json({ error: 'Ungültiger Dateipfad' });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }
    
    // Get file stats
    const stat = fs.statSync(filePath);
    
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Pfad ist keine Datei' });
    }
    
    const baseName = path.basename(filePath);
    
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(baseName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    
    // Stream the file
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    
    readStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Fehler beim Lesen der Datei' });
      }
    });
    
  } catch (err) {
    console.error('GET /api/orders/:id/network-files/:filename/download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Fehler beim Herunterladen der Datei' });
    }
  }
});

// Network upload configuration for direct CAM file uploads
const camNetworkStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const client = new MongoClient(MONGODB_URL);
      await client.connect();
      
      const db = client.db(DB_NAME);
      const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
      
      if (!order) {
        await client.close();
        return cb(new Error('Auftrag nicht gefunden'));
      }
      
      // Get folder name
      const orderFolderName = await getOrCreateOrderFolderName(db, order);
      
      // Get network configuration
      const networkConfig = await db.collection('settings').findOne({ type: 'network-config' });
      await client.close();
      
      const isNetworkActive = networkConfig && networkConfig.networkPath && fs.existsSync(networkConfig.networkPath);
      
      // 00_Interne Dokumente folder lives inside uploads/ORDER/00_Interne Dokumente/
      let baseUploadsDir;
      if (isNetworkActive) {
        baseUploadsDir = networkConfig.networkPath;
        req.uploadMode = 'network';
      } else {
        baseUploadsDir = path.join(__dirname, 'storage');
        req.uploadMode = 'local';
      }
      
      const orderFolderPath = path.join(baseUploadsDir, orderFolderName, '00_Interne Dokumente');
      
      // Create folder if it doesn't exist
      if (!fs.existsSync(orderFolderPath)) {
        fs.mkdirSync(orderFolderPath, { recursive: true });
      }
      
      req.orderFolderName = orderFolderName;
      cb(null, orderFolderPath);
      
    } catch (error) {
      console.error('CAM storage configuration error:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    let decodedName = file.originalname;
    if (decodedName.includes('Ã')) {
      try {
        decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch(e) {}
    }
    file.originalname = decodedName;

    // Use a clean filename for CAM upload too
    const ext = path.extname(file.originalname);
    const baseRaw = path.basename(file.originalname, ext);
    const safeBase = baseRaw
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/[^a-zA-Z0-9\-_.\u00C0-\u017F]/g, '_');
    
    // We do not append (1) etc since it uses the same order logic and network dir logic could be different
    // Wait, the previous logic just kept originalName
    // We'll keep the safe name
    cb(null, `${safeBase}${ext}`);
  }
});

const camNetworkUpload = multer({
  storage: camNetworkStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// POST /api/orders/:id/upload-document - Upload a document and add it to the order
app.post('/api/orders/:id/upload-document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    
    const orderId = req.params.id;
    const order = await db.collection('Order').findOne({ _id: new ObjectId(orderId) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    const newDocument = {
      name: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      uploadDate: new Date(),
      orderId: new ObjectId(orderId)
    };
    
    if (req.body && req.body.pdfWarning) {
      newDocument.pdfWarning = req.body.pdfWarning;
    }
    
    const result = await db.collection('Document').insertOne(newDocument);
    
    // Immediately organize the file into the correct order folder
    await autoMigrateOrderFiles(db, orderId);
    
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({ type: 'orderUpdated', payload: { id: orderId } });
      wss.clients.forEach(c => {
        if (c.readyState === 1 /* WebSocket.OPEN */) {
          c.send(msg);
        }
      });
    }
    
    await client.close();
    
    res.json({
      success: true,
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      networkPath: '',
      documentId: result.insertedId.toString(),
      message: 'Dokument erfolgreich hochgeladen und verknüpft'
    });
  } catch (error) {
    console.error('Error in /api/orders/:id/upload-document:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// POST /api/components/:id/upload-document - Upload a document and add it to a component
app.post('/api/components/:id/upload-document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    
    const componentId = req.params.id;
    const component = await db.collection('Component').findOne({ _id: new ObjectId(componentId) });
    
    if (!component) {
      await client.close();
      return res.status(404).json({ error: 'Bauteil nicht gefunden' });
    }
    
    const newDocument = {
      name: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      uploadDate: new Date(),
      componentId: new ObjectId(componentId),
      orderId: component.orderId
    };
    
    if (req.body && req.body.pdfWarning) {
      newDocument.pdfWarning = req.body.pdfWarning;
    }
    
    const result = await db.collection('Document').insertOne(newDocument);
    
    // Immediately organize the file into the correct order/component folder
    await autoMigrateOrderFiles(db, component.orderId.toString());
    
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({ type: 'orderUpdated', payload: { id: component.orderId.toString() } });
      wss.clients.forEach(c => {
        if (c.readyState === 1 /* WebSocket.OPEN */) {
          c.send(msg);
        }
      });
    }
    
    await client.close();
    
    res.json({
      success: true,
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      networkPath: '',
      documentId: result.insertedId.toString(),
      componentName: component.title || component.name,
      message: 'Bauteil-Dokument erfolgreich hochgeladen und verknüpft'
    });
  } catch (error) {
    console.error('Error in /api/components/:id/upload-document:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// POST /api/orders/:id/upload-cam-file - Upload CAM file directly to network folder or local folder
app.post('/api/orders/:id/upload-cam-file', camNetworkUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const ordersDb = client.db(DB_NAME);
    
    const isNetwork = req.uploadMode === 'network';
    
    // Create document record – stored in uploads/ORDER/00_Interne Dokumente/
    const relativePath = `uploads/${req.orderFolderName}/00_Interne%20Dokumente/${encodeURIComponent(req.file.filename)}`;
    const documentUrl = isNetwork 
      ? `/network-files/${relativePath}`
      : `/${relativePath}`;
    
    const document = {
      name: req.file.originalname,
      url: documentUrl,
      networkPath: isNetwork ? req.file.path : undefined,
      uploadDate: new Date(),
      orderId: new ObjectId(req.params.id),
      size: req.file.size,
      mimetype: req.file.mimetype,
      type: 'model/stl', // CAM files are typically STL
      migrated: isNetwork,
      migratedAt: isNetwork ? new Date() : undefined
    };
    
    const docResult = await ordersDb.collection('Document').insertOne(document);
    
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({ type: 'orderUpdated', payload: { id: req.params.id } });
      wss.clients.forEach(c => {
        if (c.readyState === 1 /* WebSocket.OPEN */) {
          c.send(msg);
        }
      });
    }
    
    await client.close();
    
    console.log(`CAM file uploaded (${req.uploadMode}):`, req.file.path);
    res.json({
      success: true,
      message: isNetwork 
        ? 'CAM-Datei erfolgreich direkt ins Netzwerk hochgeladen' 
        : 'CAM-Datei erfolgreich lokal hochgeladen',
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: documentUrl,
      networkPath: isNetwork ? req.file.path : undefined,
      uploadMode: req.uploadMode,
      documentId: docResult.insertedId.toString()
    });
  } catch (err) {
    console.error('POST /api/orders/:id/upload-cam-file error:', err);
    res.status(500).json({ error: 'Fehler beim Hochladen der CAM-Datei', details: err.message });
  }
});

console.log('🚀 MongoDB-only Match Werkstatt Server');
console.log('📁 All data operations use MongoDB directly');
console.log('✅ No Prisma dependencies');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// === EMAIL AND LDAP TESTING API ===
app.post('/api/test/email', async (req, res) => {
  try {
    const { to, subject, text } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Empfänger (to) fehlt.' });
    }

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: subject || 'Test-E-Mail von Match-Werkstatt',
      text: text || 'Dies ist eine Test-E-Mail.',
      encoding: 'utf-8'
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Test-E-Mail Fehler:', error);
    res.status(500).json({ error: 'Fehler beim Senden der E-Mail', details: error.message });
  }
});

app.get('/api/test/ldap-email', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Benutzername (username) fehlt.' });
    }

    const email = await ldapSearch.findUserEmail(username);
    if (email) {
      res.json({ success: true, email });
    } else {
      res.status(404).json({ error: 'E-Mail nicht gefunden oder Benutzer existiert nicht.' });
    }
  } catch (error) {
    console.error('LDAP-E-Mail-Suche Fehler:', error);
    res.status(500).json({ error: 'Fehler bei der LDAP-Abfrage', details: error.message });
  }
});

const server = http.createServer(app);

// WebSocket Setup
const wss = new WebSocket.Server({ server });
app.set('wss', wss);

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 WebSocket message received:', data);
      
      // Echo back or handle specific messages
      ws.send(JSON.stringify({
        type: 'ack',
        message: 'Message received',
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'WebSocket connection established',
    timestamp: new Date().toISOString()
  }));
});

const serverHost = process.env.HOST || undefined;

// === TMP FOLDER CLEANUP ROUTINE ===
function cleanupStaleTmpFolders() {
  try {
    const tmpDir = path.join(uploadsDir, 'tmp');
    if (!fs.existsSync(tmpDir)) return;
    
    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    
    const folders = fs.readdirSync(tmpDir);
    for (const folder of folders) {
      const folderPath = path.join(tmpDir, folder);
      const stat = fs.statSync(folderPath);
      
      // Check if it's older than 24h
      if ((now - stat.mtimeMs) > maxAgeMs) {
        if (stat.isDirectory()) {
          fs.rmSync(folderPath, { recursive: true, force: true });
          console.log(`[Cleanup] Deleted stale tmp folder: ${folderPath}`);
        } else if (stat.isFile()) {
          fs.unlinkSync(folderPath);
          console.log(`[Cleanup] Deleted stale tmp file: ${folderPath}`);
        }
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error cleaning up tmp folders:', err);
  }
}

// Run cleanup once on startup and then every hour
cleanupStaleTmpFolders();
setInterval(cleanupStaleTmpFolders, 60 * 60 * 1000);

// --- Reminder Cron Job ---
const checkReminders = async () => {
  try {
    const { client, db } = await getDB();
    // Find all orders waiting for confirmation
    const waitingOrders = await db.collection('Order').find({ status: 'waiting_confirmation' }).toArray();
    
    const now = new Date();
    
    for (const order of waitingOrders) {
      const waitingSince = order.waitingConfirmationSince ? new Date(order.waitingConfirmationSince) : new Date(order.updatedAt);
      const diffMs = now.getTime() - waitingSince.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      const remindersSent = order.remindersSent || [];
      
      // Timeline: 1, 5, 8, then daily (9, 10, 11...)
      let shouldSend = false;
      if (diffDays === 1 && !remindersSent.includes(1)) {
        shouldSend = true;
      } else if (diffDays === 5 && !remindersSent.includes(5)) {
        shouldSend = true;
      } else if (diffDays >= 8 && !remindersSent.includes(diffDays)) {
        shouldSend = true;
      }
      
      if (shouldSend) {
        const clientUser = await db.collection('User').findOne({ _id: new ObjectId(order.clientId) });
        if (clientUser && clientUser.email) {
          const mailOptions = {
            from: process.env.SMTP_USER || 'werkstatt@uni-hannover.de',
            to: clientUser.email,
            subject: `Erinnerung: Endabnahme für Auftrag "${order.title}" erforderlich`,
            text: `Guten Tag ${clientUser.name},\n\nDer Auftrag "${order.title}" (Nr. ${order.orderNumber || order.id}) wartet seit ${diffDays} Tag(en) auf Ihre Endabnahme.\n\nBitte prüfen Sie den Auftrag zeitnah im Portal und schließen Sie ihn ab.\n\nMit freundlichen Grüßen\nIhre Werkstatt`
          };
          
          try {
            await transporter.sendMail(mailOptions);
            await db.collection('Order').updateOne(
              { _id: order._id },
              { $push: { remindersSent: diffDays } }
            );
            console.log(`[Reminder] Gesendet für Auftrag ${order.id} (Tag ${diffDays})`);
          } catch (e) {
            console.error(`[Reminder] Fehler beim Senden für Auftrag ${order.id}:`, e);
          }
        }
      }
    }
    
    await client.close();
  } catch (err) {
    console.error('Error in checkReminders cron job:', err);
  }
};

// Check reminders every hour
setInterval(checkReminders, 60 * 60 * 1000);
// Also run once on startup after 1 minute
setTimeout(checkReminders, 60 * 1000);


server.listen(port, serverHost, async () => {
  console.log(`Backend listening on port ${port}`);
  
  // Initialize MongoDB indexes
  await initializeIndexes();
  
  // Ensure default admin exists
  await ensureDefaultAdmin();
  
  console.log('✓ Direct MongoDB connection established');
  console.log('🔌 WebSocket server running');
});

module.exports = app;
