import { MongoClient } from 'mongodb';

const url = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'match-werkstatt';

async function main() {
  const client = new MongoClient(url);
  try {
    await client.connect();
    console.log('Connected to db');
    const db = client.db(dbName);
    
    // Find all cost centers starting with CC-TEST, CC-ARCH, CC-ASSIGN
    const query = { number: { $regex: /^(CC-TEST|CC-ARCH|CC-ASSIGN)/i } };
    const testCCs = await db.collection('CostCenter').find(query).toArray();
    
    console.log(`Found ${testCCs.length} test cost centers to clean up.`);
    
    if (testCCs.length > 0) {
      const result = await db.collection('CostCenter').deleteMany(query);
      console.log(`Deleted ${result.deletedCount} test cost centers from DB.`);
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

main();
