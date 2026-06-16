import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'match-werkstatt';

async function run() {
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  
  const documents = await db.collection('Document').find({ 
    name: { $regex: /\.pdf$/i }
  }).toArray();
  
  for (const doc of documents) {
    if (!doc.url) continue;
    const localPath = path.join(process.cwd(), doc.url.replace(/^\//, ''));
    console.log(`Doc: ${doc.name}`);
    console.log(`  URL: ${doc.url}`);
    console.log(`  Path: ${localPath}`);
    console.log(`  Exists: ${fs.existsSync(localPath)}`);
    console.log(`  pdfWarning: ${doc.pdfWarning}`);
  }
  
  await client.close();
}

run().catch(console.error);
