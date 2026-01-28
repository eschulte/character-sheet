import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';
const userMap = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'user-map.json'), 'utf8')
);

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

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: decodedKey ? decodedKey.replace(/\\n/g, '\n') : undefined,
      }),
    });
    console.log("✅ Firebase Admin successfully initialized.");
  } catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
  }
}
const db = admin.firestore();

export const config = { api: { bodyParser: false } };

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is online!');

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const rawBody = await getRawBody(req);

  if (!verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY)) {
    return res.status(401).send('Bad request signature');
  }

  const interaction = JSON.parse(rawBody.toString());

  if (interaction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    
    // 1. Handle Simple Roll immediately
    if (name === 'roll') {
      const roll = Math.floor(Math.random() * 20) + 1;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `🎲 **${interaction.member?.user.username || 'You'}** rolled a **${roll}**!` }
      });
    }

    // Otherwise we need character sheet data
    const userId = interaction.member?.user.id || interaction.user.id;
    const userName = interaction.member?.user.username
    const charId = userMap[userId] || userMap[userName];
    console.log(`Using charId:${charId}`)

    if (!charId) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "❌ Your Discord ID isn't mapped to a character yet." }
      });
    }

    // Fetch character data from Firebase
    const snapshotQuery = await db
        .collection('characters')
        .doc(charId)
        .collection('snapshots')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

    if (snapshotQuery.empty) {
      return res.send({
        type: 4,
        data: { content: "❌ No snapshots found for this character." }
      });
    }

    const data = snapshotQuery.docs[0].data().sheetData;

    // Command Logic
    if (name === 'data') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `DATA: ${data}` }
      });
    }

    if (name === 'stats') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🛡️ **${data.charName}** (Level ${data.level} ${data.species} ${data.class})\n` +
                   `**AC:** ${data.ac} | **HP:** ${data['hp-curr']}/${data['hp-max']}`
        }
      });
    }

    if (name === 'hp') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `❤️ **${data.charName}** has **${data['hp-curr']} / ${data['hp-max']}** HP.` }
      });
    }
  }

  return res.status(400).send('Unknown interaction');
}
