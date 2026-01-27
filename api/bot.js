const functions = require("firebase-functions");
const admin = require('firebase-admin');
const { verifyKey } = require("discord-interactions");

// Initialize Firebase Admin to access Firestore
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore(); [cite: 1]

const DISCORD_PUBLIC_KEY = "YOUR_DISCORD_PUBLIC_KEY";

exports.discordBot = functions.https.onRequest(async (request, response) => {
  // 1. Verify Request Signature
  const signature = request.get("X-Signature-Ed25519");
  const timestamp = request.get("X-Signature-Timestamp");
  const isValidRequest = verifyKey(request.rawBody, signature, timestamp, DISCORD_PUBLIC_KEY);

  if (!isValidRequest) {
    return response.status(401).send("Invalid request signature");
  }

  const interaction = request.body;

  // 2. Handle PING (Discord Health Check)
  if (interaction.type === 1) {
    return response.send({ type: 1 });
  }

  // 3. Handle Slash Commands
  if (interaction.type === 2) {
    const { name } = interaction.data;
    const discordUserId = interaction.member.user.id;

    // Command: /roll
    if (name === "roll") { [cite: 1]
      const roll = Math.floor(Math.random() * 20) + 1;
      return response.send({
        type: 4,
        data: { content: `🎲 **Roll:** ${roll}` }
      });
    }

    // Command: /stats (Links to Character Sheet)
    if (name === "stats") {
      try {
        // Fetches character data from Firebase using Discord User ID 
        const userDoc = await db.collection('characters').doc(discordUserId).get();
        
        if (!userDoc.exists) {
          return response.send({
            type: 4,
            data: { content: "❌ No character sheet found for your Discord account." }
          });
        }

        const stats = userDoc.data();
        return response.send({
          type: 4,
          data: { 
            content: `📜 **${stats.name}'s Stats:**\nSTR: ${stats.str} | DEX: ${stats.dex} | INT: ${stats.int}` 
          }
        });
      } catch (error) {
        return response.send({ type: 4, data: { content: "⚠️ Error fetching character data." } });
      }
    }
  }

  return response.status(400).send("Unknown interaction");
});
