import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import admin from 'firebase-admin';
import userMap from '../user-map.json'; // Import your mapping file

// 1. Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
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
    const userId = interaction.member?.user.id || interaction.user.id;
    const charId = userMap[userId];

    if (!charId) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "❌ Your Discord ID isn't mapped to a character yet." }
      });
    }

    // Fetch character data from Firebase
    const charDoc = await db.collection('characters').doc(charId).get();
    if (!charDoc.exists) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "❌ Character data not found in Firebase." }
      });
    }

    const data = charDoc.data();
    const { name } = interaction.data;

    // Command Logic
    if (name === 'stats') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🛡️ **${data.charName}** (Level ${data.level} ${data.species})\n` +
                   `**AC:** ${data.ac} | **HP:** ${data['hp-curr']}/${data['hp-max']}\n` +
                   `**XP:** ${data.xp}`
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
