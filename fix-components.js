import { MongoClient } from 'mongodb';

const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'matchdb';

async function fixComponents() {
  console.log('Starting component fix...');
  
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    const componentCollection = db.collection('Component');
    
    // Find all components 
    const allComponents = await componentCollection.find({}).toArray();
    console.log(`Found ${allComponents.length} total components`);
    
    // Show sample components
    console.log('Sample components:', JSON.stringify(allComponents.slice(0, 3), null, 2));
    
    // Find components that need fixing (no title or null title)
    const componentsToFix = await componentCollection.find({
      $or: [
        { title: { $exists: false } },
        { title: null },
        { title: "" }
      ]
    }).toArray();
    
    console.log(`Found ${componentsToFix.length} components to fix`);
    
    if (componentsToFix.length === 0) {
      console.log('No components need fixing');
      return;
    }
    
    // Update each component - set a default title based on description or generic name
    for (const component of componentsToFix) {
      let newTitle;
      
      if (component.name && component.name !== null) {
        newTitle = component.name;
      } else if (component.description && component.description.length > 0) {
        newTitle = `Bauteil: ${component.description.substring(0, 50)}${component.description.length > 50 ? '...' : ''}`;
      } else {
        newTitle = `Bauteil #${component._id.toString().substring(-6)}`;
      }
      
      const result = await componentCollection.updateOne(
        { _id: component._id },
        {
          $set: { 
            title: newTitle,
            updatedAt: new Date()
          }
        }
      );
      
      if (result.modifiedCount === 1) {
        console.log(`Fixed component ${component._id}: title set to "${newTitle}"`);
      } else {
        console.log(`Failed to fix component ${component._id}`);
      }
    }
    
    console.log('Component fix completed');
    
  } catch (error) {
    console.error('Fix failed:', error);
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

// Run fix
fixComponents();
