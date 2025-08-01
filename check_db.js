import { MongoClient } from 'mongodb';

async function checkDB() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('matchdb');
  const collection = db.collection('Order');
  
  const ordersWithDocs = await collection.find({ documents: { $exists: true, $ne: [] } }).toArray();
  console.log('Orders with documents:', ordersWithDocs.length);
  
  ordersWithDocs.forEach((order, i) => {
    console.log('Order', i+1, '- ID:', order._id.toString());
    console.log('  Documents:', order.documents?.length || 0);
    if (order.documents) {
      order.documents.forEach(doc => {
        console.log('    -', doc.name, '(' + doc.type + ')');
      });
    }
  });
  
  await client.close();
}

checkDB().catch(console.error);
