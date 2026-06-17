import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'match-werkstatt';
const SMB_SHARE_MOUNT = process.env.SMB_SHARE_MOUNT || '/mnt/smb';

async function checkPdfSize(filePath) {
  try {
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pages.length === 0) return null;
    
    const { width, height } = pages[0].getSize();
    const widthMm = (width * 25.4) / 72;
    const heightMm = (height * 25.4) / 72;
    
    const maxDim = Math.max(widthMm, heightMm);
    const minDim = Math.min(widthMm, heightMm);
    
    if (maxDim > 1184 || minDim > 836) return "Format: > A0";
    if (maxDim > 836 || minDim > 589) return "Format: A0";
    if (maxDim > 589 || minDim > 415) return "Format: A1";
    if (maxDim > 415 || minDim > 292) return "Format: A2";
    
    return null;
  } catch (err) {
    console.error(`Error reading PDF ${filePath}:`, err.message);
    return null;
  }
}

function resolveLocalPath(fileUrl) {
  const decodedUrl = decodeURIComponent(fileUrl);
  if (decodedUrl.startsWith('/network-files/')) {
    return path.join(SMB_SHARE_MOUNT, decodedUrl.replace(/^\/network-files\//, ''));
  } else if (decodedUrl.startsWith('/uploads/')) {
    return path.join(process.cwd(), decodedUrl.replace(/^\//, ''));
  }
  return null;
}

async function migrate() {
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  
  const documents = await db.collection('Document').find({ 
    name: { $regex: /\.pdf$/i },
    pdfWarning: { $exists: false }
  }).toArray();
  
  console.log(`Found ${documents.length} PDF documents without pdfWarning.`);
  let updated = 0;
  
  for (const doc of documents) {
    if (!doc.url) continue;
    const localPath = resolveLocalPath(doc.url);
    if (!localPath) continue;
    
    if (fs.existsSync(localPath)) {
      const warning = await checkPdfSize(localPath);
      if (warning) {
        console.log(`File: ${doc.name} -> ${warning}`);
        await db.collection('Document').updateOne(
          { _id: doc._id },
          { $set: { pdfWarning: warning } }
        );
        updated++;
      } else {
        await db.collection('Document').updateOne(
          { _id: doc._id },
          { $set: { pdfWarning: "" } }
        );
      }
    } else {
      console.log(`Still not found: ${localPath} (Original URL: ${doc.url})`);
    }
  }
  
  console.log(`Done! Updated ${updated} documents.`);
  await client.close();
}

migrate().catch(console.error);
