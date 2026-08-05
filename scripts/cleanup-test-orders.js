import { MongoClient } from 'mongodb';

const url = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'match-werkstatt';

async function main() {
  const client = new MongoClient(url);
  try {
    await client.connect();
    console.log('Connected to db');
    const db = client.db(dbName);
    
    // Find all test orders containing 'E2E ' or 'E2E'
    const query = { title: { $regex: /E2E/i } };
    const testOrders = await db.collection('Order').find(query).toArray();
    
    console.log(`Found ${testOrders.length} test orders to clean up.`);
    
    if (testOrders.length > 0) {
      const result = await db.collection('Order').deleteMany(query);
      console.log(`Deleted ${result.deletedCount} test orders from DB.`);
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

main();
