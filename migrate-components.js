import { MongoClient } from 'mongodb';

const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'matchdb';

async function migrateComponents() {
  console.log('Starting component migration...');
  
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    const componentCollection = db.collection('Component');
    
    // Find all components that have 'name' field but no 'title' field
    const componentsToUpdate = await componentCollection.find({
      $and: [
        { name: { $exists: true } },
        { title: { $exists: false } }
      ]
    }).toArray();
    
    console.log(`Found ${componentsToUpdate.length} components to migrate`);
    
    if (componentsToUpdate.length === 0) {
      console.log('No components need migration');
      
      // Let's also check for components with name: null that should have titles
      const nullNameComponents = await componentCollection.find({
        $or: [
          { name: null },
          { name: { $exists: false } },
          { title: { $exists: false } }
        ]
      }).toArray();
      
      console.log(`Found ${nullNameComponents.length} components with missing titles`);
      console.log('Sample components:', nullNameComponents.slice(0, 3));
      
      return;
    }
    
    // Update each component
    for (const component of componentsToUpdate) {
      const result = await componentCollection.updateOne(
        { _id: component._id },
        {
          $set: { title: component.name },
          $unset: { name: "" }
        }
      );
      
      if (result.modifiedCount === 1) {
        console.log(`Migrated component ${component._id}: "${component.name}" -> title: "${component.name}"`);
      } else {
        console.log(`Failed to migrate component ${component._id}`);
      }
    }
    
    console.log('Component migration completed');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

// Run migration
migrateComponents();
