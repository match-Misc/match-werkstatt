const { MongoClient } = require('mongodb');

async function main() {
  const url = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/match-werkstatt-db';
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db();
    const User = db.collection('User');

    // Create Auftraggeber
    await User.updateOne(
      { username: process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME || 'test-user-auftraggeber' },
      { $set: { 
          username: process.env.E2E_TEST_USER_AUFTRAGGEBER_USERNAME || 'test-user-auftraggeber',
          password: process.env.E2E_TEST_USER_AUFTRAGGEBER_PASSWORD || 'test123',
          name: 'E2E Auftraggeber',
          role: 'client',
          isActive: true,
          isApproved: true
        } 
      },
      { upsert: true }
    );

    // Create Admin
    await User.updateOne(
      { username: process.env.E2E_TEST_USER_ADMIN_USERNAME || 'test-user-admin' },
      { $set: { 
          username: process.env.E2E_TEST_USER_ADMIN_USERNAME || 'test-user-admin',
          password: process.env.E2E_TEST_USER_ADMIN_PASSWORD || 'test123',
          name: 'E2E Admin',
          role: 'admin',
          isActive: true,
          isApproved: true
        } 
      },
      { upsert: true }
    );

    // Create Werkstattleitung
    await User.updateOne(
      { username: process.env.E2E_TEST_USER_MANAGER_USERNAME || 'test-user-werkstattleitung' },
      { $set: { 
          username: process.env.E2E_TEST_USER_MANAGER_USERNAME || 'test-user-werkstattleitung',
          password: process.env.E2E_TEST_USER_MANAGER_PASSWORD || 'test123',
          name: 'E2E Werkstattleitung',
          role: 'manager',
          isActive: true,
          isApproved: true
        } 
      },
      { upsert: true }
    );

    // Create Werkstattmitarbeiter
    await User.updateOne(
      { username: process.env.E2E_TEST_USER_WORKSHOP_USERNAME || 'test-user-werkstattmitarbeiter' },
      { $set: { 
          username: process.env.E2E_TEST_USER_WORKSHOP_USERNAME || 'test-user-werkstattmitarbeiter',
          password: process.env.E2E_TEST_USER_WORKSHOP_PASSWORD || 'test123',
          name: 'E2E Werkstattmitarbeiter',
          role: 'workshop',
          isActive: true,
          isApproved: true
        } 
      },
      { upsert: true }
    );

    // Create Gast
    await User.updateOne(
      { username: process.env.E2E_TEST_USER_GUEST_USERNAME || 'test-user-gast' },
      { $set: { 
          username: process.env.E2E_TEST_USER_GUEST_USERNAME || 'test-user-gast',
          password: process.env.E2E_TEST_USER_GUEST_PASSWORD || 'test123',
          name: 'E2E Gast',
          role: 'guest',
          isActive: true,
          isApproved: true
        } 
      },
      { upsert: true }
    );

    console.log('E2E Test-Nutzer erfolgreich angelegt.');
  } catch (err) {
    console.error('Fehler beim Seeden:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}
main();
