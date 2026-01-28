import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import userMap from './user-map.json' with { type: 'json' };

// Load .env file
dotenv.config();

if (!admin.apps.length) {
  try {
    const encodedKey = process.env.FIREBASE_PRIVATE_KEY;
    let decodedKey;

    // Detect if the key is Base64 (doesn't start with dashes) or Raw
    if (encodedKey && !encodedKey.startsWith('-----')) {
      decodedKey = Buffer.from(encodedKey, 'base64').toString('utf-8');
    } else {
      // Fallback in case you revert to the old key style
      decodedKey = encodedKey;
    }
    let privateKey = decodedKey;

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    console.log('✅ Firebase Admin Initialized via .env');
  } catch (error) {
    console.error('❌ Init Error:', error.message);
    process.exit(1);
  }
}

// Export globals for the REPL environment
global.admin = admin;
global.db = admin.firestore();
global.userMap = userMap;

// Helper to quickly get a character's latest snapshot
global.getLatest = async (discordId) => {
  const charId = userMap[discordId];
  if (!charId) return 'User ID not found in map.';

  const snap = await global.db
    .collection('characters')
    .doc(charId)
    .collection('snapshots')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  return snap.empty ? 'No snapshots found.' : snap.docs[0].data().sheetData;
};

console.log('\n--- ⚔️  RPG DATA REPL READY ---');
console.log('Available globals: db, userMap, getLatest(id)');
console.log("Example: await getLatest('YOUR_DISCORD_ID')\n");
