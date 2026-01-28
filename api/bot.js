import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';
const userMap = JSON.parse(readFileSync(path.resolve(process.cwd(), 'user-map.json'), 'utf8'));

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
    console.log('✅ Firebase Admin successfully initialized.');
  } catch (error) {
    console.error('❌ Firebase Init Error:', error.message);
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

const classEmojiMap = {
  barbarian: '🪓',
  bard: '🎻',
  cleric: '🔯',
  druid: '🌿',
  fighter: '⚔️',
  monk: '🧘',
  paladin: '🔯',
  ranger: '🏹',
  rogue: '🗡️',
  sorcerer: '🔮',
  warlock: '👁️',
  artificer: '⚙️',
};

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

  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    const { name, options } = interaction.data;
    if (name === 'combat') {
      const userId = interaction.member?.user.id || interaction.user.id;
      const charId = userMap[userId];

      // Fetch data (identical to your main command fetch)
      const snap = await db
        .collection('characters')
        .doc(charId)
        .collection('snapshots')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      const sheetData = snap.docs[0].data().sheetData;
      const weapons = sheetData.weapons || [];

      const focusedOption = options.find((o) => o.focused === true);
      const query = focusedOption.value.toLowerCase();

      // Filter based on query, or return all if query is empty
      const choices = weapons
        .filter((w) => w.name && w.name.toLowerCase().includes(query))
        .map((w) => ({ name: w.name, value: w.name }))
        .slice(0, 25);

      return res.send({ type: 8, data: { choices } });
    }
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;

    // 1. Handle Simple Roll immediately
    if (name === 'roll') {
      const roll = Math.floor(Math.random() * 20) + 1;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `🎲 **${interaction.member?.user.username || 'You'}** rolled a **${roll}**!` },
      });
    }

    // Otherwise we need character sheet data
    const userId = interaction.member?.user.id || interaction.user.id;
    const userName = interaction.member?.user.username;
    const charId = userMap[userId] || userMap[userName];
    console.log(`Using charId:${charId}`);

    if (!charId) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "❌ Your Discord ID isn't mapped to a character yet." },
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
      return res.send({ type: 4, data: { content: '❌ No snapshots found for this character.' } });
    }

    const data = snapshotQuery.docs[0].data().sheetData;

    // --- HELPER FUNCTION FOR CHECKS & SAVES ---
    // Reads a specific key from the sheet (e.g., 'val-wisdom-perception'),
    // parses the "+5" string into a number, and handles the roll logic.
    const handleRoll = (label, jsonKey) => {
      // 1. Get the modifier string (e.g., "+3", "-1", or empty)
      const rawVal = data[jsonKey];
      // 2. Convert to integer (parseInt handles "+3" correctly as 3)
      const mod = rawVal ? parseInt(rawVal) : 0;

      // 3. Check if the user requested a roll
      // We look for an option named 'roll' that is true
      const shouldRoll = options && options.find((o) => o.name === 'roll' && o.value === true);

      if (shouldRoll) {
        const d20 = Math.floor(Math.random() * 20) + 1;
        const total = d20 + mod;
        // Formatting: Adds a '+' sign for positive numbers for readability
        const sign = mod >= 0 ? '+' : '';
        return { content: `🎲 **${label}** for ${data.charName}: 1d20 (${d20}) ${sign}${mod} = **${total}**` };
      } else {
        const sign = mod >= 0 ? '+' : '';
        return { content: `ℹ️ **${label}** for ${data.charName}: Formula is 1d20 ${sign}${mod}` };
      }
    };

    if (name === 'say') {
      const message = options.find((o) => o.name === 'message').value;

      // Use the character's portrait and name from Firebase
      const charName = data.charName || 'Unknown Hero';
      const portrait = data['portrait-url'] || '';

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              author: { name: charName, icon_url: portrait },
              description: message,
              color: 0xd4af37,
              thumbnail: { url: portrait },
            },
          ],
        },
      });
    }

    if (name === 'combat') {
      const weaponName = options.find((o) => o.name === 'name').value;
      const shouldRoll = options.find((o) => o.name === 'roll')?.value;
      const weapon = data.weapons.find((w) => w.name === weaponName);

      if (!weapon) return res.send({ type: 4, data: { content: '❌ Weapon not found.' } });

      let content = `⚔️ **${weapon.name}**\n`;
      content += `**Atk:** ${weapon.atk || '—'} | **Damage:** ${weapon.dmg || '—'} | **Type:** ${weapon.type || '—'}`;

      if (shouldRoll) {
        const d20 = Math.floor(Math.random() * 20) + 1;
        const mod = parseInt(weapon.atk) || 0;
        const total = d20 + mod;
        content += `\n🎲 **Attack Roll:** 1d20 (${d20}) + ${mod} = **${total}**`;
      }

      return res.send({
        type: 4,
        data: {
          embeds: [
            {
              title: weapon.name,
              description: content,
              color: 0x992d22,
              footer: { text: weapon.notes || '' },
              thumbnail: { url: data['portrait-url'] },
            },
          ],
        },
      });
    }

    if (name === 'stats') {
      const classEmoji = classEmojiMap[data.class.toLowerCase()];

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content:
            `${classEmoji} **${data.charName}** (Level ${data.level} ${data.species} ${data.class})\n` +
            `**AC:** ${data.ac} | **HP:** ${data['hp-curr']}/${data['hp-max']}`,
        },
      });
    }

    if (name === 'hp') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `❤️ **${data.charName}** has **${data['hp-curr']} / ${data['hp-max']}** HP.` },
      });
    }

    // --- ABILITY CHECKS (Raw) ---
    if (name === 'str_check') return res.send({ type: 4, data: handleRoll('Strength Check', 'strength-mod') });
    if (name === 'dex_check') return res.send({ type: 4, data: handleRoll('Dexterity Check', 'dexterity-mod') });
    if (name === 'con_check') return res.send({ type: 4, data: handleRoll('Constitution Check', 'constitution-mod') });
    if (name === 'int_check') return res.send({ type: 4, data: handleRoll('Intelligence Check', 'intelligence-mod') });
    if (name === 'wis_check') return res.send({ type: 4, data: handleRoll('Wisdom Check', 'wisdom-mod') });
    if (name === 'cha_check') return res.send({ type: 4, data: handleRoll('Charisma Check', 'charisma-mod') });

    // --- SAVING THROWS ---
    if (name === 'str_save') return res.send({ type: 4, data: handleRoll('Strength Save', 'save-val-strength') });
    if (name === 'dex_save') return res.send({ type: 4, data: handleRoll('Dexterity Save', 'save-val-dexterity') });
    if (name === 'con_save')
      return res.send({ type: 4, data: handleRoll('Constitution Save', 'save-val-constitution') });
    if (name === 'int_save')
      return res.send({ type: 4, data: handleRoll('Intelligence Save', 'save-val-intelligence') });
    if (name === 'wis_save') return res.send({ type: 4, data: handleRoll('Wisdom Save', 'save-val-wisdom') });
    if (name === 'cha_save') return res.send({ type: 4, data: handleRoll('Charisma Save', 'save-val-charisma') });

    // --- SKILL CHECKS ---
    // Strength
    if (name === 'athletics') return res.send({ type: 4, data: handleRoll('Athletics', 'val-strength-athletics') });

    // Dexterity
    if (name === 'acrobatics') return res.send({ type: 4, data: handleRoll('Acrobatics', 'val-dexterity-acrobatics') });
    if (name === 'sleight_of_hand')
      return res.send({ type: 4, data: handleRoll('Sleight of Hand', 'val-dexterity-sleight-of-hand') });
    if (name === 'stealth') return res.send({ type: 4, data: handleRoll('Stealth', 'val-dexterity-stealth') });

    // Intelligence
    if (name === 'arcana') return res.send({ type: 4, data: handleRoll('Arcana', 'val-intelligence-arcana') });
    if (name === 'history') return res.send({ type: 4, data: handleRoll('History', 'val-intelligence-history') });
    if (name === 'investigation')
      return res.send({ type: 4, data: handleRoll('Investigation', 'val-intelligence-investigation') });
    if (name === 'nature') return res.send({ type: 4, data: handleRoll('Nature', 'val-intelligence-nature') });
    if (name === 'religion') return res.send({ type: 4, data: handleRoll('Religion', 'val-intelligence-religion') });

    // Wisdom
    if (name === 'animal_handling')
      return res.send({ type: 4, data: handleRoll('Animal Handling', 'val-wisdom-animal-handling') });
    if (name === 'insight') return res.send({ type: 4, data: handleRoll('Insight', 'val-wisdom-insight') });
    if (name === 'medicine') return res.send({ type: 4, data: handleRoll('Medicine', 'val-wisdom-medicine') });
    if (name === 'perception') return res.send({ type: 4, data: handleRoll('Perception', 'val-wisdom-perception') });
    if (name === 'survival') return res.send({ type: 4, data: handleRoll('Survival', 'val-wisdom-survival') });

    // Charisma
    if (name === 'deception') return res.send({ type: 4, data: handleRoll('Deception', 'val-charisma-deception') });
    if (name === 'intimidation')
      return res.send({ type: 4, data: handleRoll('Intimidation', 'val-charisma-intimidation') });
    if (name === 'performance')
      return res.send({ type: 4, data: handleRoll('Performance', 'val-charisma-performance') });
    if (name === 'persuasion') return res.send({ type: 4, data: handleRoll('Persuasion', 'val-charisma-persuasion') });
  }

  // We didn't match any known handlers.
  return res.status(400).send('Unknown interaction');
}
