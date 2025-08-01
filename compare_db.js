import { MongoClient } from 'mongodb';
import { PrismaClient } from '@prisma/client';

async function compareDatabases() {
  console.log('=== DATENBANKVERGLEICH ===\n');
  
  // MongoDB direkt
  const mongoClient = new MongoClient('mongodb://localhost:27017');
  await mongoClient.connect();
  const db = mongoClient.db('matchdb');
  const mongoOrders = await db.collection('Order').find({}).toArray();
  
  // Prisma
  const prisma = new PrismaClient();
  const prismaOrders = await prisma.order.findMany();
  
  console.log(`📊 MongoDB direkt: ${mongoOrders.length} Orders`);
  console.log(`🔗 Prisma ORM: ${prismaOrders.length} Orders\n`);
  
  console.log('=== MONGODB DIREKT ===');
  mongoOrders.forEach((order, i) => {
    console.log(`${i+1}. ID: ${order._id} | Documents: ${order.documents?.length || 0}`);
    if (order.documents?.length > 0) {
      order.documents.forEach(doc => {
        console.log(`   - ${doc.name} (${doc.type || 'undefined'})`);
      });
    }
  });
  
  console.log('\n=== PRISMA ORM ===');
  const prismaWithDocs = await prisma.order.findMany({
    include: { documents: true }
  });
  
  prismaWithDocs.forEach((order, i) => {
    console.log(`${i+1}. ID: ${order.id} | Documents: ${order.documents?.length || 0}`);
    if (order.documents?.length > 0) {
      order.documents.forEach(doc => {
        console.log(`   - ${doc.name}`);
      });
    }
  });
  
  await mongoClient.close();
  await prisma.$disconnect();
}

compareDatabases().catch(console.error);
