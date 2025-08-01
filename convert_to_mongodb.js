import fs from 'fs';

// Ersetze alle Prisma-Importe und -Referenzen
function convertToMongoDB() {
  let content = fs.readFileSync('server.cjs', 'utf8');
  
  console.log('Starting MongoDB conversion...');
  
  // Entferne Prisma-Import
  content = content.replace(/const \{ PrismaClient \} = require\('@prisma\/client'\);?\n?/g, '');
  content = content.replace(/const prisma = new PrismaClient\(\);?\n?/g, '');
  
  // Zähle Ersetzungen
  let replacements = 0;
  
  // Standard MongoDB-Setup für alle Funktionen
  const mongoSetup = `    const { MongoClient, ObjectId } = require('mongodb');
    const mongoClient = new MongoClient('mongodb://localhost:27017');
    await mongoClient.connect();
    const db = mongoClient.db('matchdb');
    const ordersCollection = db.collection('Order');
    const usersCollection = db.collection('User');
    const documentsCollection = db.collection('Document');
    const componentsCollection = db.collection('Component');`;
  
  const mongoCleanup = `    await mongoClient.close();`;
  
  // Speichere das Resultat
  fs.writeFileSync('server_converted.cjs', content);
  
  console.log(`Conversion complete! Made ${replacements} replacements.`);
  console.log('Review server_converted.cjs and rename it to server.cjs when ready.');
}

convertToMongoDB();
