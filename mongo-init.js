// MongoDB Initialisierungs-Skript
// Wird beim ersten Start des Containers ausgeführt

// Authentifizieren als Admin
db = db.getSiblingDB('admin');

const dbName = process.env.MONGO_DB_NAME;
const appUser = process.env.MONGO_APP_USER;
const appPass = process.env.MONGO_APP_PASSWORD;

if (!dbName || !appUser || !appPass) {
  throw new Error("Fehlende MongoDB Umgebungsvariablen: MONGO_DB_NAME, MONGO_APP_USER oder MONGO_APP_PASSWORD");
}

// Zum matchdb wechseln
db = db.getSiblingDB(dbName);

// Benutzer für matchdb erstellen
db.createUser({
  user: appUser,
  pwd: appPass,
  roles: [
    { role: 'readWrite', db: dbName }
  ]
});

// Collections erstellen
db.createCollection('Order');
db.createCollection('Document');
db.createCollection('User');
db.createCollection('NoteHistory');
db.createCollection('Component');
db.createCollection('ComponentDocument');
db.createCollection('SystemConfig');
db.createCollection('settings');

// Indizes für Order-Collection
db.Order.createIndex({ orderNumber: 1 }, { unique: true, sparse: true });
db.Order.createIndex({ clientId: 1 });
db.Order.createIndex({ status: 1 });
db.Order.createIndex({ createdAt: -1 });
db.Order.createIndex({ deadline: 1 });
db.Order.createIndex({ assignedTo: 1 });

// Indizes für User-Collection
db.User.createIndex({ username: 1 }, { unique: true });
db.User.createIndex({ role: 1 });
db.User.createIndex({ isActive: 1 });

// Indizes für Document-Collection
db.Document.createIndex({ orderId: 1 });

// Indizes für NoteHistory-Collection
db.NoteHistory.createIndex({ orderId: 1 });
db.NoteHistory.createIndex({ createdAt: -1 });

// Indizes für Component-Collection
db.Component.createIndex({ orderId: 1 });

// Indizes für ComponentDocument-Collection
db.ComponentDocument.createIndex({ componentId: 1 });

// Indizes für SystemConfig-Collection
db.SystemConfig.createIndex({ key: 1 }, { unique: true });

// Indizes für settings-Collection
db.settings.createIndex({ type: 1 }, { unique: true });

print('MongoDB-Initialisierung abgeschlossen!');
print('Collections und Indizes wurden erstellt.');
