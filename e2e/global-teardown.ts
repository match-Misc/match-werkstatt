import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

// Wir laden die .local.env, damit wir MONGODB_URL und DB_NAME kennen
dotenv.config({ path: path.resolve(process.cwd(), '.local.env') });

async function globalTeardown() {
  console.log('🧹 Starte E2E Global Teardown...');
  
  const url = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.DB_NAME || 'match-werkstatt';

  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(dbName);

    // 1. Alle Test-Aufträge löschen, die "E2E" oder "i18n Test" im Titel haben
    const orderQuery = { title: { $regex: /(E2E|i18n Test)/i } };
    const ordersResult = await db.collection('Order').deleteMany(orderQuery);
    console.log(`✅ ${ordersResult.deletedCount} übriggebliebene E2E Test-Aufträge aus Datenbank gelöscht.`);

    // 2. Alle Test-Kostenstellen löschen, die mit "CC-TEST", "CC-ARCH" oder "CC-ASSIGN" beginnen
    const ccQuery = { number: { $regex: /^(CC-TEST|CC-ARCH|CC-ASSIGN)/i } };
    const ccResult = await db.collection('CostCenter').deleteMany(ccQuery);
    console.log(`✅ ${ccResult.deletedCount} E2E Test-Kostenstellen aus Datenbank gelöscht.`);
    
  } catch (error) {
    console.error('❌ Fehler beim E2E Global Teardown:', error);
  } finally {
    await client.close();
    console.log('🧹 E2E Global Teardown beendet.');
  }
}

export default globalTeardown;
