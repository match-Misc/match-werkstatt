const { MongoClient } = require('mongodb');
async function run() {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db('matchdb');
  const docs = await db.collection('Document').find({}).toArray();
  console.log(JSON.stringify(docs, null, 2));
  await client.close();
}
run().catch(console.error);
