const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

// Hybrid LDAP Integration
const SimpleLDAPAuth = require('./simple-ldap-auth.cjs');

// LDAP Konfiguration
const ldapConfig = {
  host: process.env.LDAP_HOST || 'ldap.company.local',
  port: parseInt(process.env.LDAP_PORT) || 389,
  useTLS: process.env.LDAP_USE_TLS === 'true',
  baseDN: process.env.LDAP_BASE_DN || 'dc=company,dc=local',
  userSearchBase: process.env.LDAP_USER_SEARCH_BASE || 'ou=users,dc=company,dc=local',
  bindDN: process.env.LDAP_BIND_DN || '',
  bindPassword: process.env.LDAP_BIND_PASSWORD || ''
};

// LDAP Authenticator initialisieren
const ldapAuth = new SimpleLDAPAuth(ldapConfig);
console.log('[HYBRID-AUTH] LDAP-Konfiguration geladen:', {
  host: ldapConfig.host,
  port: ldapConfig.port,
  baseDN: ldapConfig.baseDN
});

const app = express();
const port = 3001;

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

// Static files
const uploadsDir = path.join(__dirname, 'storage', 'uploads');
app.use('/uploads', express.static(uploadsDir, {
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

// Network folder static files middleware
app.use('/network-files', async (req, res, next) => {
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
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename (sanitized), avoid collisions by appending (1), (2), ...
    const ext = path.extname(file.originalname);
    const baseRaw = path.basename(file.originalname, ext);
    // Sanitize for Windows and general file systems
    const safeBase = baseRaw
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_') // Windows forbidden chars
      .replace(/\s+/g, ' ')            // normalize spaces
      .replace(/[^a-zA-Z0-9\-_. ()]/g, '_'); // keep common safe chars

    let candidate = `${safeBase}${ext}`;
    let counter = 1;
    while (fs.existsSync(path.join(uploadsDir, candidate))) {
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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for images
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
  return {
    ...doc,
    id: doc._id.toString(),
    _id: undefined
  };
}

// Helper function: Convert array of MongoDB documents
function convertMongoDocs(docs) {
  return docs.map(convertMongoDoc);
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
      path: `/uploads/${req.file.filename}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload fehlgeschlagen', details: error.message });
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
    const { username, password, name, role } = req.body;
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
      role: role || 'client',
      isActive: true,
      isApproved: false,
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
    const { username, password } = req.body;
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
          // Aktualisiere LDAP-Daten, behalte lokale Rollen
          await db.collection('User').updateOne(
            { _id: localUser._id },
            {
              $set: {
                email: userInfo.email,
                name: userInfo.name,
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
            role: 'client', // Standard-Rolle für neue LDAP-Benutzer
            isApproved: true, // LDAP-Benutzer automatisch bestätigt
            authSource: 'ldap',
            createdAt: new Date(),
            lastLdapLogin: new Date()
          };
          
          const result = await db.collection('User').insertOne(newUser);
          localUser = await db.collection('User').findOne({ _id: result.insertedId });
        }
        
        await client.close();
        
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
      
      if (user.role === 'client' && user.isApproved === false) {
        return res.status(403).json({ success: false, message: 'Account noch nicht bestätigt' });
      }
      
      return res.json({ 
        success: true, 
        user: convertMongoDoc(user),
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
        userSearchBase: ldapConfig.userSearchBase
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

// LDAP Benutzer-Rolle aktualisieren
app.put('/api/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const { client, db } = await getDB();
    
    console.log(`[HYBRID-AUTH] Aktualisiere Rolle für Benutzer ${req.params.id} zu: ${role}`);
    
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
    const { username, password, name, company, email, role, isActive } = req.body;
    
    // Check if user exists first
    const existingUser = await db.collection('User').findOne({ _id: new ObjectId(req.params.id) });
    if (!existingUser) {
      await client.close();
      console.log('User not found with ID:', req.params.id);
      return res.status(404).json({ error: 'User nicht gefunden' });
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
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    
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

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
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
app.get('/api/orders', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
    // Load all orders
    const orders = await db.collection('Order').find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    // Enrich with relations
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      // Load documents (embedded or referenced)
      let documents = order.documents || [];
      if (documents.length === 0) {
        documents = await db.collection('Document').find({ 
          orderId: new ObjectId(order._id) 
        }).toArray();
      }
      
      // Enrich documents with IDs
      const enrichedDocuments = documents.map(doc => ({
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
      
      return {
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
      };
    }));
    
    await client.close();
    
    console.log('GET /api/orders - Loaded', enrichedOrders.length, 'orders from MongoDB');
    res.json(enrichedOrders);
  } catch (err) {
    console.error('GET /api/orders error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Aufträge', details: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const { client, db } = await getDB();
    
    const order = await db.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Load relations
    let documents = order.documents || [];
    if (documents.length === 0) {
      documents = await db.collection('Document').find({ 
        orderId: new ObjectId(req.params.id) 
      }).toArray();
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
    const enrichedDocuments = documents.map(doc => ({
      ...doc,
      id: doc._id ? doc._id.toString() : doc.id,
      _id: undefined
    }));
    
    await client.close();
    
    const enrichedOrder = {
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
    };
    
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
    
    // Load relations (similar to GET /api/orders/:id)
    let documents = order.documents || [];
    if (documents.length === 0) {
      documents = await db.collection('Document').find({ 
        orderId: new ObjectId(order._id) 
      }).toArray();
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
    
    await client.close();
    
    const enrichedOrder = {
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
    };
    
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
      title, description, clientId, clientName, deadline, costCenter,
      priority, status, estimatedHours, actualHours, assignedTo, notes,
      orderType, subTasks, documents, components, revisionRequest, revisionComment,
      userId, userName, materialOrderedByWorkshop, materialOrderedByClient,
      materialOrderedByClientConfirmed, materialAvailable, confirmationNote,
      confirmationDate, canEdit, titleImage
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
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (clientId !== undefined) updateData.clientId = clientId;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (deadline !== undefined) updateData.deadline = new Date(deadline);
    if (costCenter !== undefined) updateData.costCenter = costCenter;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours;
    if (actualHours !== undefined) updateData.actualHours = actualHours;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (notes !== undefined) updateData.notes = notes;
    if (orderType !== undefined) updateData.orderType = orderType;
    if (subTasks !== undefined) updateData.subTasks = subTasks || [];
    
    // Handle title image deletion (when titleImage is explicitly set to null)
    if (titleImage !== undefined) {
      if (titleImage === null) {
        updateData.titleImage = null;
        console.log('Title image deletion requested');
      }
      // Note: title image upload is handled by separate endpoint
    }
    
    // Documents with type field
    if (documents !== undefined) {
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
    if (components !== undefined) {
      console.log('PUT /api/orders/:id - Processing components:', components?.length || 0);
      
      // Delete existing components and their documents
      const existingComponents = await db.collection('Component').find({ 
        orderId: new ObjectId(req.params.id) 
      }).toArray();
      
      for (const comp of existingComponents) {
        await db.collection('Document').deleteMany({ 
          componentId: new ObjectId(comp._id) 
        });
      }
      
      await db.collection('Component').deleteMany({ 
        orderId: new ObjectId(req.params.id) 
      });
      
      // Create new components
      if (components && components.length > 0) {
        for (const component of components) {
          const newComponent = {
            title: component.title || component.name,
            description: component.description || '',
            material: component.material || '',
            quantity: component.quantity || 1,
            notes: component.notes || '',
            orderId: new ObjectId(req.params.id),
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          const componentResult = await db.collection('Component').insertOne(newComponent);
          
          // Create component documents if provided
          if (component.documents && component.documents.length > 0) {
            const componentDocuments = component.documents.map(doc => ({
              name: doc.name,
              url: doc.url,
              uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
              componentId: componentResult.insertedId,
              orderId: new ObjectId(req.params.id)
            }));
            await db.collection('Document').insertMany(componentDocuments);
          }
        }
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
    const enrichedDocuments = orderDocuments.map(doc => ({
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
    
    // Load relations like in GET /api/orders/:id
    let documents = updatedOrder.documents || [];
    if (documents.length === 0) {
      documents = await db.collection('Document').find({ 
        orderId: new ObjectId(orderId) 
      }).toArray();
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
    
    // Generate order number: F-YYMM-X (Year-Month-Sequential)
    const today = new Date();
    const yearMonth = today.toISOString().slice(2, 7).replace('-', ''); // YYMM
    const prefix = orderData.orderType === 'fertigung' ? 'F' : 'S';
    
    // Find highest sequential number for this month
    const yearMonthPattern = `${prefix}-${yearMonth}-`;
    const existingOrders = await db.collection('Order').find({
      orderNumber: { $regex: `^${yearMonthPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
    }).toArray();
    
    let nextNumber = 1;
    if (existingOrders.length > 0) {
      const numbers = existingOrders.map(order => {
        const match = order.orderNumber.match(new RegExp(`^${yearMonthPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`));
        return match ? parseInt(match[1]) : 0;
      }).filter(num => num > 0);
      
      if (numbers.length > 0) {
        nextNumber = Math.max(...numbers) + 1;
      }
    }
    
    const orderNumber = `${prefix}-${yearMonth}-${nextNumber}`;
    
    // Create new order
    const newOrder = {
      orderNumber: orderNumber,
      title: orderData.title,
      description: orderData.description,
      clientId: orderData.clientId,
      clientName: orderData.clientName,
      deadline: new Date(orderData.deadline),
      costCenter: orderData.costCenter,
      priority: orderData.priority || 'medium',
      status: orderData.status || 'pending',
      estimatedHours: orderData.estimatedHours || 0,
      actualHours: orderData.actualHours || 0,
      assignedTo: orderData.assignedTo || null,
      notes: orderData.notes || '',
      orderType: orderData.orderType,
      subTasks: orderData.subTasks || [],
      documents: documents || [],
      revisionHistory: [],
      reworkComments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('Order').insertOne(newOrder);
    
    // Create documents separately if needed
    if (documents && documents.length > 0) {
      const documentObjects = documents.map(doc => ({
        name: doc.name,
        url: doc.url,
        uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
        orderId: result.insertedId
      }));
      await db.collection('Document').insertMany(documentObjects);
    }
    
    // Create components separately if needed
    if (components && components.length > 0) {
      console.log('POST /api/orders - Creating components:', components.length);
      
      for (const component of components) {
        const newComponent = {
          title: component.title || component.name,
          description: component.description || '',
          material: component.material || '',
          quantity: component.quantity || 1,
          notes: component.notes || '',
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
            uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
            componentId: componentResult.insertedId,
            orderId: result.insertedId
          }));
          await db.collection('Document').insertMany(componentDocuments);
        }
      }
    }
    
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
    
    // Delete related documents
    await db.collection('Document').deleteMany({ orderId: new ObjectId(req.params.id) });
    
    // Delete related components
    await db.collection('Component').deleteMany({ orderId: new ObjectId(req.params.id) });
    
    // Delete note history
    await db.collection('NoteHistory').deleteMany({ orderId: new ObjectId(req.params.id) });
    
    // Delete order
    const result = await db.collection('Order').deleteOne({ _id: new ObjectId(req.params.id) });
    
    await client.close();
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Order nicht gefunden' });
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
      quantity: quantity || 1,
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
        uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
        componentId: result.insertedId,
        orderId: new ObjectId(req.params.orderId)
      }));
      await db.collection('Document').insertMany(documentObjects);
    }
    
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
    if (quantity !== undefined) updateData.quantity = quantity;
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

// GET /api/orders/:id/network-folder - Get network folder status for order
app.get('/api/orders/:id/network-folder', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    // Get order from matchdb (where orders are stored)
    const ordersDb = client.db('matchdb');
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Get network configuration from match_werkstatt (where settings are stored)
    const settingsDb = client.db('match_werkstatt');
    const settingsCollection = settingsDb.collection('settings');
    const networkConfig = await settingsCollection.findOne({ type: 'network-config' });
    
    await client.close();
    
    if (!networkConfig || !networkConfig.networkPath) {
      return res.json({
        success: false,
        message: 'Kein Netzwerkpfad konfiguriert',
        exists: false
      });
    }
    
    // Check if network path is accessible
    const networkPathExists = fs.existsSync(networkConfig.networkPath);
    
    if (!networkPathExists) {
      return res.json({
        success: false,
        message: 'Netzwerkpfad nicht erreichbar',
        networkPath: networkConfig.networkPath,
        exists: false
      });
    }
    
    // Build potential folder path for this order
    const orderFolderName = order.orderNumber || order._id.toString();
    const potentialPath = path.join(networkConfig.networkPath, orderFolderName);
    
    // Check if order folder exists
    const orderFolderExists = fs.existsSync(potentialPath);
    
    res.json({
      success: true,
      orderNumber: order.orderNumber,
      networkPath: networkConfig.networkPath,
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
    const ordersDb = client.db('matchdb');
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Get network configuration from match_werkstatt (where settings are stored)
    const settingsDb = client.db('match_werkstatt');
    const settingsCollection = settingsDb.collection('settings');
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
    
    // Build folder path for this order
    const orderFolderName = order.orderNumber || order._id.toString();
    const orderFolderPath = path.join(networkConfig.networkPath, orderFolderName);
    
    // Create folder if it doesn't exist
    if (!fs.existsSync(orderFolderPath)) {
      fs.mkdirSync(orderFolderPath, { recursive: true });
    }
    
    await client.close();
    
    res.json({
      success: true,
      message: 'Auftragordner erfolgreich erstellt',
      folderPath: orderFolderPath
    });
    
  } catch (err) {
    console.error('POST /api/orders/:id/network-folder error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Erstellen des Netzwerkordners' });
  }
});

// POST /api/orders/:id/migrate-files - Migrate order files to network folder
app.post('/api/orders/:id/migrate-files', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    // Get order and documents from matchdb (where orders are stored)
    const ordersDb = client.db('matchdb');
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Check if documents are embedded in Order or in separate collection
    let documents = [];
    let documentsAreEmbedded = false;
    
    if (order.documents && order.documents.length > 0) {
      // Documents are embedded in the Order
      documents = order.documents.filter(doc => !doc.migrated); // Only non-migrated
      documentsAreEmbedded = true;
    } else {
      // Documents are in separate collection (only order documents, not component documents)
      documents = await ordersDb.collection('Document').find({ 
        orderId: new ObjectId(req.params.id),
        componentId: { $exists: false }, // Exclude component documents
        migrated: { $ne: true } // Only non-migrated
      }).toArray();
    }
    
    // Get component documents (always from Document collection)
    const componentDocuments = await ordersDb.collection('Document').find({ 
      orderId: new ObjectId(req.params.id),
      componentId: { $exists: true },
      migrated: { $ne: true }
    }).toArray();
    
    console.log(`[Migration] Order documents: ${documents.length}, Component documents: ${componentDocuments.length}`);
    
    // Get network configuration from match_werkstatt (where settings are stored)
    const settingsDb = client.db('match_werkstatt');
    const settingsCollection = settingsDb.collection('settings');
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
    
    // Build folder path for this order
    const orderFolderName = order.orderNumber || order._id.toString();
    const orderFolderPath = path.join(networkConfig.networkPath, orderFolderName);
    
    // Create folder if it doesn't exist
    if (!fs.existsSync(orderFolderPath)) {
      fs.mkdirSync(orderFolderPath, { recursive: true });
    }
    
    // Create subfolder for component documents
    const componentsFolderPath = path.join(orderFolderPath, 'Bauteile');
    if (componentDocuments.length > 0 && !fs.existsSync(componentsFolderPath)) {
      fs.mkdirSync(componentsFolderPath, { recursive: true });
    }
    
    // Migration statistics
    let migratedFiles = 0;
    const fileTypes = {};
    const errors = [];
    const migratedDocuments = []; // Track successfully migrated docs

    // Migrate each document
    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      try {
        // Original file path
        const originalPath = path.join(uploadsDir, path.basename(document.url));
        
        if (!fs.existsSync(originalPath)) {
          errors.push(`Originaldatei nicht gefunden: ${document.name}`);
          continue;
        }
        
        // Destination path - Dateiname mit korrekten Umlauten beibehalten
        const fileName = document.name || path.basename(document.url);
        // Normalisiere den Dateinamen für das Dateisystem (NFC für Windows/Linux-Kompatibilität)
        const normalizedFileName = fileName.normalize('NFC');
        const destinationPath = path.join(orderFolderPath, normalizedFileName);
        
        // Copy file to network folder
        fs.copyFileSync(originalPath, destinationPath);
        
        // Create network-accessible URL - URL-encode für Sonderzeichen
        const encodedFileName = encodeURIComponent(normalizedFileName);
        const networkUrl = `/network-files/${orderFolderName}/${encodedFileName}`;
        
        if (documentsAreEmbedded) {
          // Track migration for embedded documents
          migratedDocuments.push({
            index: i,
            originalIndex: order.documents.findIndex(d => d.name === document.name && !d.migrated),
            networkUrl,
            networkPath: destinationPath,
            originalUrl: document.url,
            originalName: normalizedFileName
          });
        } else {
          // Update document in separate collection
          await ordersDb.collection('Document').updateOne(
            { _id: document._id },
            { 
              $set: { 
                url: networkUrl,
                networkPath: destinationPath,
                originalUrl: document.url, // Keep reference to original location
                originalName: normalizedFileName, // Original-Dateiname mit Umlauten
                migrated: true,
                migratedAt: new Date()
              }
            }
          );
        }
        
        // Delete original file from uploads folder after successful migration
        try {
          if (fs.existsSync(originalPath)) {
            fs.unlinkSync(originalPath);
            console.log(`[Migration] Deleted original file: ${originalPath}`);
          }
        } catch (deleteError) {
          console.warn(`[Migration] Could not delete original file ${originalPath}:`, deleteError.message);
          // Don't fail migration if deletion fails
        }
        
        // Track statistics
        migratedFiles++;
        const fileExtension = path.extname(fileName).toLowerCase();
        fileTypes[fileExtension] = (fileTypes[fileExtension] || 0) + 1;
        
      } catch (copyError) {
        errors.push(`Fehler beim Kopieren von ${document.name}: ${copyError.message}`);
      }
    }
    
    // Migrate component documents
    for (const compDoc of componentDocuments) {
      try {
        const originalPath = path.join(uploadsDir, path.basename(compDoc.url));
        
        if (!fs.existsSync(originalPath)) {
          errors.push(`Bauteil-Datei nicht gefunden: ${compDoc.name}`);
          continue;
        }
        
        const fileName = compDoc.name || path.basename(compDoc.url);
        const normalizedFileName = fileName.normalize('NFC');
        const destinationPath = path.join(componentsFolderPath, normalizedFileName);
        
        // Copy file to network folder
        fs.copyFileSync(originalPath, destinationPath);
        
        // Create network-accessible URL
        const encodedFileName = encodeURIComponent(normalizedFileName);
        const networkUrl = `/network-files/${orderFolderName}/Bauteile/${encodedFileName}`;
        
        // Update component document in database
        await ordersDb.collection('Document').updateOne(
          { _id: compDoc._id },
          { 
            $set: { 
              url: networkUrl,
              networkPath: destinationPath,
              originalUrl: compDoc.url,
              originalName: normalizedFileName,
              migrated: true,
              migratedAt: new Date()
            }
          }
        );
        
        // Delete original file
        try {
          if (fs.existsSync(originalPath)) {
            fs.unlinkSync(originalPath);
            console.log(`[Migration] Deleted component file: ${originalPath}`);
          }
        } catch (deleteError) {
          console.warn(`[Migration] Could not delete component file ${originalPath}:`, deleteError.message);
        }
        
        migratedFiles++;
        const fileExtension = path.extname(fileName).toLowerCase();
        fileTypes[fileExtension] = (fileTypes[fileExtension] || 0) + 1;
        
      } catch (copyError) {
        errors.push(`Fehler beim Kopieren von Bauteil-Datei ${compDoc.name}: ${copyError.message}`);
      }
    }
    
    // Update embedded documents in Order if needed
    if (documentsAreEmbedded && migratedDocuments.length > 0) {
      const updatedDocuments = order.documents.map((doc, idx) => {
        const migrated = migratedDocuments.find(m => m.originalIndex === idx);
        if (migrated) {
          return {
            ...doc,
            url: migrated.networkUrl,
            networkPath: migrated.networkPath,
            originalUrl: migrated.originalUrl,
            originalName: migrated.originalName,
            migrated: true,
            migratedAt: new Date()
          };
        }
        return doc;
      });
      
      await ordersDb.collection('Order').updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { documents: updatedDocuments } }
      );
    }
    
    await client.close();
    
    res.json({
      success: true,
      message: `${migratedFiles} Datei(en) erfolgreich migriert`,
      migrationResult: {
        migratedFiles,
        fileTypes,
        errors: errors.length > 0 ? errors : undefined,
        folderPath: orderFolderPath
      }
    });

  } catch (err) {
    console.error('POST /api/orders/:id/migrate-files error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Migrieren der Dateien' });
  }
});

// GET /api/orders/:id/migration-status - Check migration status of order files
app.get('/api/orders/:id/migration-status', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    const ordersDb = client.db('matchdb');
    
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
    
    const ordersDb = client.db('matchdb');
    const documents = await ordersDb.collection('Document').find({ 
      orderId: new ObjectId(req.params.id),
      migrated: true
    }).toArray();
    
    let rolledBackFiles = 0;
    const errors = [];
    
    for (const document of documents) {
      try {
        // Restore original URL
        await ordersDb.collection('Document').updateOne(
          { _id: document._id },
          { 
            $set: { 
              url: document.originalUrl || document.url
            },
            $unset: {
              networkPath: '',
              originalUrl: '',
              migrated: '',
              migratedAt: ''
            }
          }
        );
        
        rolledBackFiles++;
      } catch (rollbackError) {
        errors.push(`Fehler beim Zurücksetzen von ${document.name}: ${rollbackError.message}`);
      }
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
app.get('/api/orders/:id/files/:filename', async (req, res) => {
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
          console.log(`[Download] Network file not found`);
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
          console.log(`[Download] Uploads file not found`);
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
      
      // Strong cache prevention with additional headers
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
      
      console.log(`[Download] Serving: ${chosenPath} (size: ${stats.size}, mtime: ${stats.mtime.toISOString()})`);
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
      if (fs.existsSync(p)) networkPath = p;
    }

    let uploadsPath = undefined;
    const pUp = path.join(uploadsDir, path.basename(document.url || ''));
    if (fs.existsSync(pUp)) uploadsPath = pUp;

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
      
      // Strong cache prevention with additional headers
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
      
      console.log(`[Download by ID] Serving: ${chosenPath} (size: ${stats.size}, mtime: ${stats.mtime.toISOString()})`);
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
    const db = client.db('match_werkstatt');
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
    
    // Test if path exists
    const pathExists = fs.existsSync(networkPath);
    
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db('match_werkstatt');
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

app.get('/api/system/network-test', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db('match_werkstatt');
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
    const ordersDb = client.db('matchdb');
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Get network configuration
    const settingsDb = client.db('match_werkstatt');
    const networkConfig = await settingsDb.collection('settings').findOne({ type: 'network-config' });
    
    await client.close();
    
    if (!networkConfig || !networkConfig.networkPath) {
      return res.json({
        success: false,
        message: 'Kein Netzwerkpfad konfiguriert',
        files: []
      });
    }
    
    // Check if network path is accessible
    if (!fs.existsSync(networkConfig.networkPath)) {
      return res.json({
        success: false,
        message: 'Netzwerkpfad nicht erreichbar',
        files: []
      });
    }
    
    // Build order folder path
    const orderFolderName = order.orderNumber || order._id.toString();
    const orderFolderPath = path.join(networkConfig.networkPath, orderFolderName);
    
    // Check if order folder exists
    if (!fs.existsSync(orderFolderPath)) {
      return res.json({
        success: true,
        message: 'Auftragordner existiert noch nicht',
        files: [],
        folderPath: orderFolderPath
      });
    }
    
    // Read all files in the order folder including subfolders
    const files = [];
    
    function readFilesRecursively(folderPath, relativePath = '') {
      const items = fs.readdirSync(folderPath);
      
      for (const item of items) {
        const itemPath = path.join(folderPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isFile()) {
          const relativeFilePath = relativePath ? path.join(relativePath, item) : item;
          files.push({
            name: item,
            relativePath: relativeFilePath,
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
            created: stat.birthtime.toISOString(),
            extension: path.extname(item).toLowerCase(),
            downloadUrl: `/api/orders/${req.params.id}/network-files/${encodeURIComponent(relativeFilePath)}/download`
          });
        } else if (stat.isDirectory()) {
          // Recursively read subdirectories
          const subRelativePath = relativePath ? path.join(relativePath, item) : item;
          readFilesRecursively(itemPath, subRelativePath);
        }
      }
    }
    
    readFilesRecursively(orderFolderPath);
    
    // Sort files by name
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({
      success: true,
      message: `${files.length} Datei(en) gefunden`,
      files,
      folderPath: orderFolderPath,
      orderNumber: order.orderNumber
    });
    
  } catch (err) {
    console.error('GET /api/orders/:id/network-files error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Auflisten der Netzwerkdateien' });
  }
});

// GET /api/orders/:id/network-files/:filename/download - Download file from order's network folder
app.get('/api/orders/:id/network-files/:filename/download', async (req, res) => {
  try {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    
    // Get order from matchdb
    const ordersDb = client.db('matchdb');
    const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      await client.close();
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }
    
    // Get network configuration
    const settingsDb = client.db('match_werkstatt');
    const networkConfig = await settingsDb.collection('settings').findOne({ type: 'network-config' });
    
    await client.close();
    
    if (!networkConfig || !networkConfig.networkPath) {
      return res.status(400).json({ error: 'Kein Netzwerkpfad konfiguriert' });
    }
    
    // Check if network path is accessible
    if (!fs.existsSync(networkConfig.networkPath)) {
      return res.status(400).json({ error: 'Netzwerkpfad nicht erreichbar' });
    }
    
    // Build file path - filename can include subdirectories
    const orderFolderName = order.orderNumber || order._id.toString();
    const orderFolderPath = path.join(networkConfig.networkPath, orderFolderName);
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(orderFolderPath, filename);
    
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
    
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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
      
      // Get order from matchdb
      const ordersDb = client.db('matchdb');
      const order = await ordersDb.collection('Order').findOne({ _id: new ObjectId(req.params.id) });
      
      if (!order) {
        await client.close();
        return cb(new Error('Auftrag nicht gefunden'));
      }
      
      // Get network configuration
      const settingsDb = client.db('match_werkstatt');
      const networkConfig = await settingsDb.collection('settings').findOne({ type: 'network-config' });
      
      await client.close();
      
      if (!networkConfig || !networkConfig.networkPath) {
        return cb(new Error('Netzwerkkonfiguration nicht gefunden'));
      }
      
      if (!fs.existsSync(networkConfig.networkPath)) {
        return cb(new Error('Netzwerkpfad nicht erreichbar'));
      }
      
      // Build order folder path
      const orderFolderName = order.orderNumber || order._id.toString();
      const orderFolderPath = path.join(networkConfig.networkPath, orderFolderName);
      
      // Create order folder if it doesn't exist
      if (!fs.existsSync(orderFolderPath)) {
        fs.mkdirSync(orderFolderPath, { recursive: true });
      }
      
      // Check for target subfolder (e.g., 'CAM-Dateien')
      let targetPath = orderFolderPath;
      if (req.body && req.body.targetFolder) {
        targetPath = path.join(orderFolderPath, req.body.targetFolder);
        
        // Create subfolder if it doesn't exist
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
      }
      
      // Store info for later use
      req.networkOrderPath = orderFolderPath;
      req.networkTargetPath = targetPath;
      req.orderData = order;
      req.uploadMode = 'network';
      
      cb(null, targetPath);
      
    } catch (error) {
      console.error('CAM network storage error:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Keep original filename without timestamp prefix
    const originalName = file.originalname;
    cb(null, originalName);
  }
});

const camNetworkUpload = multer({
  storage: camNetworkStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// POST /api/orders/:id/upload-cam-file - Upload CAM file directly to network folder
app.post('/api/orders/:id/upload-cam-file', camNetworkUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const ordersDb = client.db('matchdb');
    
    // Create document record
    const relativePath = req.body.targetFolder 
      ? `${req.orderData.orderNumber || req.orderData._id}/${req.body.targetFolder}/${req.file.filename}`
      : `${req.orderData.orderNumber || req.orderData._id}/${req.file.filename}`;
    
    const documentUrl = `/network-files/${relativePath}`;
    
    const document = {
      name: req.file.originalname,
      url: documentUrl,
      networkPath: req.file.path,
      uploadDate: new Date(),
      orderId: new ObjectId(req.params.id),
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadMode: 'network',
      documentType: 'cam',
      targetFolder: req.body.targetFolder || null
    };
    
    const docResult = await ordersDb.collection('Document').insertOne(document);
    
    await client.close();
    
    res.json({
      success: true,
      message: 'CAM-Datei erfolgreich direkt ins Netzwerk hochgeladen',
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: documentUrl,
      networkPath: req.file.path,
      uploadMode: 'network',
      documentId: docResult.insertedId.toString(),
      targetFolder: req.body.targetFolder || null
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

const server = http.createServer(app);

// WebSocket Setup
const wss = new WebSocket.Server({ server });

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

server.listen(port, '0.0.0.0', async () => {
  console.log(`Backend listening on http://0.0.0.0:${port}`);
  
  // Initialize MongoDB indexes
  await initializeIndexes();
  
  // Ensure default admin exists
  await ensureDefaultAdmin();
  
  console.log('✓ Direct MongoDB connection established');
  console.log('🔌 WebSocket server running');
});

module.exports = app;
