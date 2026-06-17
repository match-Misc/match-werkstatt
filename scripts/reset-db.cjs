const { MongoClient } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'match-werkstatt';

async function resetDB() {
  let client;
  try {
    client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('Lösche Aufträge...');
    await db.collection('Order').deleteMany({});
    
    console.log('Lösche Bauteile...');
    await db.collection('Component').deleteMany({});
    
    console.log('Lösche Dokumente...');
    await db.collection('Document').deleteMany({});

    console.log('Datenbank erfolgreich zurückgesetzt! Es sind nun 0 Aufträge vorhanden.');
  } catch (err) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', err);
  } finally {
    if (client) {
      await client.close();
    }
    process.exit(0);
  }
}

resetDB();
