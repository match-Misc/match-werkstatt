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

    console.log('E2E Test-Nutzer erfolgreich angelegt.');
  } catch (err) {
    console.error('Fehler beim Seeden:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}
main();
