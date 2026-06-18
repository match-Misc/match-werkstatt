const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db('matchdb');
  
  const docs = await db.collection('Document').find({ url: { $regex: '^/uploads/' } }).toArray();
  let deleted = 0;
  
  for (const doc of docs) {
    const relativeUrl = decodeURIComponent(doc.url.replace(/^\/uploads\//, ''));
    const localPath = path.join(__dirname, 'storage', relativeUrl);
    
    if (!fs.existsSync(localPath)) {
      await db.collection('Document').deleteOne({ _id: doc._id });
      deleted++;
      console.log(`Deleted orphaned document: ${doc.url}`);
    }
  }
  
  console.log(`Finished. Deleted ${deleted} orphaned documents.`);
  await client.close();
}
run().catch(console.error);
