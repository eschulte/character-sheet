import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

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

const charCache = {}; // Global in-memory cache
const CACHE_TTL = 10000; // 10 seconds

const AI_COMMENTS_URL = 'https://eschulte.github.io/character-sheet/ai_comments.json';
const AI_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let aiCache = { data: null, lastFetch: 0 };

async function getAiComments() {
  const now = Date.now();
  if (!aiCache.data || now - aiCache.lastFetch > AI_CACHE_TTL) {
    console.log('🤖 Fetching fresh AI comments from web...');
    try {
      const response = await fetch(AI_COMMENTS_URL);
      aiCache.data = await response.json();
      aiCache.lastFetch = now;
    } catch (err) {
      console.error('❌ Failed to fetch AI comments:', err);
      return aiCache.data || {}; // Return stale data if fetch fails
    }
  }
  return aiCache.data;
}

const userMap = JSON.parse(readFileSync(path.resolve(process.cwd(), 'user-map.json'), 'utf8'));
let firebaseUserMap = {};
let mapLastFetch = 0;
const MAP_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function getFirebaseUserMap() {
  const now = Date.now();
  // Fetch if cache is empty OR stale
  if (Object.keys(firebaseUserMap).length === 0 || now - mapLastFetch > MAP_CACHE_TTL) {
    console.log('🗺️ Fetching Discord-to-Character map from Firebase...');
    try {
      const snapshot = await db.collection('discord_mappings').get();
      snapshot.forEach((doc) => {
        // Map: DiscordUserID -> CharacterID
        firebaseUserMap[doc.id] = doc.data().charId;
      });
      mapLastFetch = now;
      console.log(`✅ Cached ${Object.keys(firebaseUserMap).length} user mappings.`);
    } catch (err) {
      console.error('❌ Failed to fetch user map:', err);
    }
  }
  return firebaseUserMap;
}

async function getDmParty(id) {
  const doc = await db.collection('dm_parties').doc(id).get();
  return doc.exists ? doc.data().members || {} : {};
}

const itemEmojiMap = {
  armor: '🛡️',
  shield: '🛡️',
  sword: '⚔️',
  dagger: '⚔️',
  axe: '⚔️',
  mace: '⚔️',
  spear: '⚔️',
  bow: '🏹',
  crossbow: '🏹',
  potion: '🧪',
  elixir: '🧪',
  poison: '☠️',
  scroll: '📜',
  book: '📖',
  tome: '📖',
  letter: '📄',
  note: '📄',
  gold: '💰',
  silver: '💰',
  copper: '💰',
  coin: '💰',
  gem: '💎',
  food: '🍖',
  ration: '🍖',
  water: '💧',
  key: '🔑',
  tool: '🛠️',
  kit: '🛠️',
  ring: '💍',
  amulet: '📿',
  bag: '🎒',
  pack: '🎒',
  default: '🎒',
};

function getItemEmoji(name) {
  const lower = name.toLowerCase();
  const key = Object.keys(itemEmojiMap).find((k) => lower.includes(k));
  return itemEmojiMap[key] || itemEmojiMap.default;
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

const skillMap = {
  athletics: 'val-strength-athletics',
  acrobatics: 'val-dexterity-acrobatics',
  sleight_of_hand: 'val-dexterity-sleight-of-hand',
  stealth: 'val-dexterity-stealth',
  arcana: 'val-intelligence-arcana',
  history: 'val-intelligence-history',
  investigation: 'val-intelligence-investigation',
  nature: 'val-intelligence-nature',
  religion: 'val-intelligence-religion',
  animal_handling: 'val-wisdom-animal-handling',
  insight: 'val-wisdom-insight',
  medicine: 'val-wisdom-medicine',
  perception: 'val-wisdom-perception',
  survival: 'val-wisdom-survival',
  deception: 'val-charisma-deception',
  intimidation: 'val-charisma-intimidation',
  performance: 'val-charisma-performance',
  persuasion: 'val-charisma-persuasion',
};

const statMap = {
  strength: 'strength-mod',
  dexterity: 'dexterity-mod',
  constitution: 'constitution-mod',
  intelligence: 'intelligence-mod',
  wisdom: 'wisdom-mod',
  charisma: 'charisma-mod',
};

const saveMap = {
  strength: 'save-val-strength',
  dexterity: 'save-val-dexterity',
  constitution: 'save-val-constitution',
  intelligence: 'save-val-intelligence',
  wisdom: 'save-val-wisdom',
  charisma: 'save-val-charisma',
};

function evaluateDice(expression) {
  // 1. Tokenize: Grab only numbers and valid operators. Ignore everything else.
  //    Matches: Digits, or single characters d, +, -, *, /, (, )
  const tokens = expression.match(/\d+|[d\+\-\*\/\(\)]/g);

  if (!tokens || tokens.length === 0) {
    // Default fallback if input was just text or empty
    return evaluateDice('1d20');
  }

  let cursor = 0;
  const rollsLog = [];

  // --- PARSER FUNCTIONS (Builds the Tree) ---

  function peek() {
    return tokens[cursor];
  }

  function consume(expected) {
    if (expected && peek() !== expected) return false;
    const token = tokens[cursor];
    cursor++;
    return token;
  }

  // Grammar: Expression -> Term { +|- Term }
  function parseExpression() {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseTerm();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  // Grammar: Term -> DiceExpression { *|/ DiceExpression }
  function parseTerm() {
    let left = parseDiceExpression();
    while (peek() === '*' || peek() === '/') {
      const operator = consume();
      const right = parseDiceExpression();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  // Grammar: DiceExpression -> [Factor] d Factor
  function parseDiceExpression() {
    // Check if the very first thing is 'd' (e.g. "d20")
    if (peek() === 'd') {
      consume(); // eat 'd'
      const sides = parseFactor();
      return { type: 'dice', count: { type: 'literal', value: 1 }, sides };
    }

    let left = parseFactor();

    // If we have a number/factor, check if a 'd' follows it (e.g. "2d6")
    if (peek() === 'd') {
      consume(); // eat 'd'
      const sides = parseFactor();
      return { type: 'dice', count: left, sides };
    }

    return left;
  }

  // Grammar: Factor -> Number | (Expression)
  function parseFactor() {
    const token = peek();

    if (token === '(') {
      consume('(');
      const expr = parseExpression();
      if (peek() !== ')') {
        // Be forgiving: if missing closing paren, just return what we have
        return expr;
      }
      consume(')');
      return expr;
    }

    // It should be a number
    if (/^\d+$/.test(token)) {
      consume();
      return { type: 'literal', value: parseInt(token, 10) };
    }

    // Fallback for syntax errors (e.g. "2 + * 5") -> Treat missing factor as 0
    return { type: 'literal', value: 0 };
  }

  // --- EVALUATOR (Walks the Tree) ---
  function evaluate(node) {
    if (!node) return 0;

    if (node.type === 'literal') {
      return node.value;
    }

    if (node.type === 'binary') {
      const l = evaluate(node.left);
      const r = evaluate(node.right);
      switch (node.operator) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? 0 : Math.floor(l / r); // Protect div by zero
      }
    }

    if (node.type === 'dice') {
      const count = evaluate(node.count);
      const sides = evaluate(node.sides);

      // Safety Limits
      const safeCount = Math.min(Math.max(count, 0), 100); // 0 to 100 dice
      const safeSides = Math.min(Math.max(sides, 1), 1000); // 1 to 1000 sides

      const currentRolls = [];
      let total = 0;
      for (let i = 0; i < safeCount; i++) {
        const r = Math.floor(Math.random() * safeSides) + 1;
        currentRolls.push(r);
        total += r;
      }

      // Log formatted like "2d6: [3, 4]"
      rollsLog.push(`**${safeCount}d${safeSides}**: [${currentRolls.join(', ')}]`);
      return total;
    }
    return 0;
  }

  // 2. Parse
  const parseTree = parseExpression();

  // 3. Evaluate
  const result = evaluate(parseTree);

  // Reconstruct clean math string from tokens for display
  const cleanMath = tokens.join(' ');

  return { total: result, log: rollsLog, math: cleanMath };
}

function getAvailableResourceOptions(data) {
  const options = [];

  // Spells (Check if any slots are defined)
  if (data.spellSlots && Object.keys(data.spellSlots).length > 0) {
    options.push({ name: '🔮 Spells', value: 'spells' });
  }

  // Generic Class Resource (e.g. Rage, Ki, Sorcery Points)
  if (data['class-resource-name'] && data['class-resource-name'].trim() !== '') {
    options.push({ name: `🏷️ ${data['class-resource-name']}`, value: 'class_resource' });
  }

  // Artificer Infusions
  if (data['infusions-max'] && parseInt(data['infusions-max']) > 0) {
    options.push({ name: '🛠️ Infusions', value: 'infusions' });
  }

  // Battle Master Superiority Dice
  if (data['superiority-dice-max'] && parseInt(data['superiority-dice-max']) > 0) {
    options.push({ name: '🎲 Superiority Dice', value: 'superiority_dice' });
  }

  // Paladin Lay on Hands
  if (data['lay-on-hands-max'] && parseInt(data['lay-on-hands-max']) > 0) {
    options.push({ name: '🤲 Lay on Hands', value: 'lay_on_hands' });
  }

  // Hit Dice (Always exists based on Level)
  options.push({ name: '🎲 Hit Dice', value: 'hit_dice' });

  return options;
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
  const userId = interaction.member?.user.id || interaction.user.id;
  const guildId = interaction.guild_id; // Available if in a server

  // The context ID is the Server ID if available, otherwise the User ID (for DMs)
  const contextId = guildId || userId;
  // Composite key for server-specific user registration
  const userContextKey = guildId ? `${guildId}-${userId}` : userId;

  if (interaction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    let { name, options } = interaction.data;
    const focusedOption =
      options.find((o) => o.focused === true) || options[0]?.options?.find((o) => o.focused === true); // Handle subcommands
    if (!focusedOption) return res.send({ type: 8, data: { choices: [] } });

    const query = focusedOption.value.toLowerCase();

    if (focusedOption.name === 'target' || (name === 'party' && focusedOption.name === 'name')) {
      const partyMap = await getDmParty(contextId); // Fetch Server Party List
      const choices = Object.entries(partyMap)
        .filter(([key]) => key.toLowerCase().includes(query))
        .map(([key, id]) => ({ name: key, value: key }));
      return res.send({ type: 8, data: { choices } });
    }

    // 2. Standard Autocomplete (Needs charId)
    await getFirebaseUserMap();

    // Try Server-Specific Registration first, then Global Fallback
    let charId = firebaseUserMap[userContextKey] || userMap[userId] || firebaseUserMap[userId];

    if (name === 'dm') {
      // If autocompleting arguments for a /dm command
      const targetVal = options[0].options.find((o) => o.name === 'target')?.value;
      if (targetVal) {
        // Check Server Party Map first
        const partyMap = await getDmParty(contextId);

        // Resolve Target: Party Alias -> Server Map -> Global Map -> Raw Value
        // Note: For target mapping, we check if the target is a known user in this server
        const targetUserKey = guildId ? `${guildId}-${targetVal}` : targetVal;

        charId =
          partyMap[targetVal] ||
          firebaseUserMap[targetUserKey] ||
          userMap[targetVal] ||
          firebaseUserMap[targetVal] ||
          targetVal;
      }
    }

    if (!charId) return res.send({ type: 8, data: { choices: [] } });

    // Fetch snapshot for autocomplete
    const snap = await db
      .collection('characters')
      .doc(charId)
      .collection('snapshots')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return res.send({ type: 8, data: { choices: [] } });
    const sheetData = snap.docs[0].data().sheetData;

    let choices = [];
    if (focusedOption.name === 'name' || focusedOption.name === 'weapon') {
      // Combat/Equipment
      const source = [...(sheetData.weapons || []), ...(sheetData.equipment_table || [])];
      choices = source
        .filter((i) => i.name && i.name.toLowerCase().includes(query))
        .map((i) => ({ name: i.name, value: i.name }));
    } else if (focusedOption.name === 'type') {
      // Remaining
      // ... (Use existing getAvailableResourceOptions logic) ...
      choices = [{ name: 'Hit Dice', value: 'hit_dice' }]; // Stub
    }

    return res.send({ type: 8, data: { choices: choices.slice(0, 25) } });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    let { name, options } = interaction.data;

    if (name === 'help') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: '📖 Character Sheet Bot',
              description:
                'Need help with commands? Want to see how to link your character? Visit our official support page for a full command list and troubleshooting guide.',
              color: 0x94a5ff, // Using our light blue branding
              footer: {
                text: 'Dungeon Support System',
                icon_url: 'https://www.gstatic.com/images/icons/material/system/2x/warning_amber_white_24dp.png',
              },
            },
          ],
          components: [
            {
              type: 1, // Action Row
              components: [
                {
                  type: 2, // Button
                  style: 5, // Link Style
                  label: 'Open Support Page',
                  url: 'https://eschulte.github.io/character-sheet/bot',
                },
              ],
            },
          ],
        },
      });
    }

    if (name === 'roll') {
      // Default to 1d20 if no argument provided
      const rawExpression = options?.find((o) => o.name === 'expression')?.value || '1d20';

      try {
        const result = evaluateDice(rawExpression);

        let description = `**Input:** \`${rawExpression}\`\n`;

        // Only show cleaned math if it differs significantly from input
        if (result.math.replace(/\s/g, '') !== rawExpression.replace(/\s/g, '')) {
          description += `**Parsed:** \`${result.math}\`\n`;
        }

        if (result.log.length > 0) {
          description += `**Dice:** ${result.log.join(', ')}\n`;
        }

        description += `\n# 🎲 Result: ${result.total}`;

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: 'Dice Roller',
                description: description,
                color: 0x4caf50, // Green
              },
            ],
          },
        });
      } catch (error) {
        return res.send({ type: 4, data: { content: `❌ Parser Error: ${error.message}` } });
      }
    }

    if (name === 'register') {
      const newCharId = options.find((o) => o.name === 'character_id').value;
      const userId = interaction.member?.user.id || interaction.user.id;
      const userName = interaction.member?.user.username || 'User';

      // Optional: Check if the character actually exists
      const charSnap = await db.collection('characters').doc(newCharId).get();
      if (!charSnap.exists) {
        return res.send({
          type: 4,
          data: { content: `❌ Character ID \`${newCharId}\` does not exist in the database.` },
        });
      }

      try {
        // Save using Composite Key (ServerID-UserID) if in a server, else just UserID
        const storageKey = userContextKey;

        await db
          .collection('discord_mappings')
          .doc(storageKey)
          .set({
            charId: newCharId,
            username: userName,
            guildId: guildId || 'DM',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

        // Update local cache
        firebaseUserMap[storageKey] = newCharId;

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Success!** User \`@${userName}\` is now linked to Character ID \`${newCharId}\` for this server.`,
          },
        });
      } catch (err) {
        console.error('Registration Error:', err);
        return res.send({ type: 4, data: { content: `❌ Database Error: ${err.message}` } });
      }
    }

    if (name === 'party') {
      const subCmd = options[0].name;
      const args = options[0].options || [];
      // Use contextId (Guild ID) instead of User ID
      const partyRef = db.collection('dm_parties').doc(contextId);
      const currentParty = await getDmParty(contextId);

      if (subCmd === 'add') {
        const key = args.find((o) => o.name === 'key').value;
        const charId = args.find((o) => o.name === 'char_id').value;

        currentParty[key] = charId;
        await partyRef.set({ members: currentParty });
        return res.send({
          type: 4,
          data: { content: `✅ Added **${key}** -> \`${charId}\` to the Server Party List.` },
        });
      } else if (subCmd === 'remove') {
        const keyToRemove = args.find((o) => o.name === 'name').value;
        delete currentParty[keyToRemove];
        await partyRef.set({ members: currentParty });
        return res.send({ type: 4, data: { content: `✅ Removed **${keyToRemove}** from party.` } });
      } else if (subCmd === 'list') {
        const entries = Object.entries(currentParty);
        if (entries.length === 0) return res.send({ type: 4, data: { content: 'Your party list is empty.' } });
        const tableRows = [];
        tableRows.push(`${'KEY'.padEnd(12)} | ${'ID (6)'.padEnd(8)} | ${'CHARACTER NAME'}`);
        tableRows.push(`${'-'.repeat(12)}-|- ${'-'.repeat(8)}-|-${'-'.repeat(20)}`);

        for (const [key, charId] of entries) {
          let charName = 'Unknown/Error';
          try {
            // Fetch the character data to get the name
            const snapshotQuery = await db
              .collection('characters')
              .doc(charId)
              .collection('snapshots')
              .orderBy('createdAt', 'desc')
              .limit(1)
              .get();

            if (!snapshotQuery.empty) {
              const sheetData = snapshotQuery.docs[0].data().sheetData;
              charName = sheetData.charName || 'Unnamed';
            }
          } catch (e) {
            console.error(`Error fetching name for ${charId}:`, e);
          }

          const shortId = charId.substring(0, 6);
          tableRows.push(`${key.padEnd(12)} | ${shortId.padEnd(8)} | ${charName}`);
        }

        const table = '```\n' + tableRows.join('\n') + '\n```';

        return res.send({ type: 4, data: { content: `### 👥 DM Party Shortcuts\n${table}` } });
      }
    }

    let charId = null;

    if (name === 'dm') {
      const subCmdObj = options[0];
      const subCmdOptions = subCmdObj.options;
      const targetVal = subCmdOptions.find((o) => o.name === 'target').value;
      const partyMap = await getDmParty(contextId);

      await getFirebaseUserMap();

      // Resolve Target: Party Alias -> Server Map -> Global Map -> Raw Value
      const targetUserKey = guildId ? `${guildId}-${targetVal}` : targetVal;

      charId =
        partyMap[targetVal] ||
        firebaseUserMap[targetUserKey] ||
        userMap[targetVal] ||
        firebaseUserMap[targetVal] ||
        targetVal;

      // Update reference for the rest of the handler
      name = subCmdObj.name;
      options = subCmdOptions;
      if (!charId) {
        return res.send({ type: 4, data: { content: `❌ Could not resolve target to a Character ID.` } });
      }

      console.log(`🕵️ DM Override: Running /${name} for CharID ${charId}`);
    } else {
      // Standard User Lookup
      await getFirebaseUserMap();
      // Try Server-Specific ID first, then fallback to legacy Global ID
      charId = firebaseUserMap[userContextKey] || userMap[userId] || firebaseUserMap[userId];

      if (!charId) {
        return res.send({
          type: 4,
          data: { content: '❌ You are not linked to a character sheet in this server. Use `/register`.' },
        });
      }
      console.log(`User: ${userId} is using CharId: ${charId}`);
    }

    // Fetch character data from Firebase
    // (with caching)
    const now = Date.now();
    let data = null;
    let shouldFetchFull = true;

    // 1. Check if we have valid cached data
    if (charCache[charId]) {
      const cached = charCache[charId];

      // If polled recently (within 10s), trust the cache blindly
      if (now - cached.lastPoll < CACHE_TTL) {
        console.log(`⚡ Using Hot Cache for ${charId}`);
        data = cached.data;
        shouldFetchFull = false;
      } else {
        // Cache is "stale", poll Firebase metadata only
        console.log(`🔍 Polling Metadata for ${charId}`);
        const metaSnap = await db
          .collection('characters')
          .doc(charId)
          .collection('snapshots')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .select('createdAt') // Only fetch the timestamp field
          .get();

        if (!metaSnap.empty) {
          const cloudTimestamp = metaSnap.docs[0].data().createdAt;
          if (cloudTimestamp === cached.snapshotCreatedAt) {
            console.log(`✅ Cache Valid (No changes). Updating poll timer.`);
            charCache[charId].lastPoll = now;
            data = cached.data;
            shouldFetchFull = false;
          }
        }
      }
    }

    // 2. Fetch full data if needed (Cache miss or Data changed)
    if (shouldFetchFull) {
      console.log(`☁️ Downloading FULL data for ${charId}`);
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

      const docData = snapshotQuery.docs[0].data();
      data = docData.sheetData;

      // Update Cache
      charCache[charId] = { data: data, snapshotCreatedAt: docData.createdAt, lastPoll: now };
    }

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

    if (name === 'me') {
      const action = options.find((o) => o.name === 'action').value;
      const charName = data.charName || 'The Hero';
      const portrait = data['portrait-url'] || '';

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              // Using italics for the action
              description: `***${charName} ${action}***`,
              color: 0x4f545c, // "Dark Mode" Grey for a subtle narrative feel
              thumbnail: {
                url: portrait, // This makes the picture small and placed in the corner
              },
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
          embeds: [{ title: weapon.name, description: content, color: 0x992d22, footer: { text: weapon.notes || '' } }],
        },
      });
    }

    if (name === 'equipment') {
      const itemName = options.find((o) => o.name === 'name').value;
      const item = (data.equipment_table || []).find((i) => i.name === itemName);

      if (!item) return res.send({ type: 4, data: { content: '❌ Item not found.' } });

      const emoji = getItemEmoji(item.name);

      let description = `**Qty:** ${item.qty || 1}`;
      if (item.lbs && item.lbs !== '0') description += ` | **Weight:** ${item.lbs} lbs`;

      return res.send({
        type: 4,
        data: {
          embeds: [
            {
              title: `${emoji} ${item.name}`,
              description: description,
              color: 0x2b2b2b, // Dark Grey
              footer: { text: item.notes || '' },
            },
          ],
        },
      });
    }

    if (name === 'remaining') {
      const resourceType = options.find((o) => o.name === 'type').value;
      let title = '';
      let status = '';

      switch (resourceType) {
        case 'spells':
          title = '🔮 Spell Slots';
          const levels = [];
          for (let lvl = 1; lvl <= 9; lvl++) {
            let avail = 0,
              total = 0;
            Object.keys(data.spellSlots || {}).forEach((k) => {
              if (k.startsWith(`slot-${lvl}-`)) {
                total++;
                if (data.spellSlots[k] === false) avail++; // unchecked = available
              }
            });
            if (total > 0) levels.push(`**Lvl ${lvl}:** ${avail}/${total}`);
          }
          status = levels.join('\n') || 'No slots configured.';
          break;

        case 'class_resource':
          title = `🏷️ ${data['class-resource-name']}`;
          status = `**${data['class-resource-val'] || 0}** remaining`;
          break;

        case 'infusions':
          title = '🛠️ Infusions';
          status = `**${data['infusions-curr'] || 0}** / ${data['infusions-max']}`;
          break;

        case 'superiority_dice':
          title = '🎲 Superiority Dice';
          status = `**${data['superiority-dice-curr'] || 0}** / ${data['superiority-dice-max']}`;
          break;

        case 'hit_dice':
          title = '🎲 Hit Dice';
          status = `**${data['hd-curr'] || 0}** / ${data.level}`;
          break;

        case 'lay_on_hands':
          title = '🤲 Lay on Hands';
          status = `**${data['lay-on-hands-curr'] || 0}** / ${data['lay-on-hands-max']} HP`;
          break;
      }

      return res.send({
        type: 4,
        data: {
          embeds: [
            {
              title: title,
              description: status,
              color: 0x3498db, // Blue
              thumbnail: { url: data['portrait-url'] },
              footer: { text: `Status for ${data.charName}` },
            },
          ],
        },
      });
    }

    if (name === 'condition') {
      const aiComments = await getAiComments();

      // Typical condition list in 5e sheets or boolean flags
      // We'll check for common 5e conditions
      const possibleConditions = [
        'Blinded',
        'Charmed',
        'Deafened',
        'Frightened',
        'Grappled',
        'Incapacitated',
        'Invisible',
        'Paralyzed',
        'Petrified',
        'Poisoned',
        'Prone',
        'Restrained',
        'Stunned',
        'Unconscious',
      ];

      // Filter data for active conditions (case-insensitive match)
      const active = possibleConditions.filter((cond) => {
        // Checks if data['condition-blinded'] is true, etc.
        const key = `condition-${cond.toLowerCase()}`;
        return data[key] === true;
      });

      if (active.length === 0) {
        return res.send({
          type: 4,
          data: { content: `✨ **${data.charName}** is currently free of any debilitating conditions.` },
        });
      }

      const embedFields = active.map((cond) => {
        // Try to find a snarky comment from the AI
        const comments = aiComments[cond] || [];
        const randomComment =
          comments.length > 0 ? `\n> *${comments[Math.floor(Math.random() * comments.length)]}*` : '';

        return { name: `⚠️ ${cond}`, value: `You are currently ${cond.toLowerCase()}.${randomComment}`, inline: false };
      });

      return res.send({
        type: 4,
        data: {
          embeds: [
            {
              title: `Status Report: ${data.charName}`,
              fields: embedFields,
              color: 0xffaa00, // Alert Orange
              thumbnail: { url: data['portrait-url'] },
              footer: {
                text: 'Dungeon Status Monitor',
                icon_url: 'https://www.gstatic.com/images/icons/material/system/2x/warning_amber_white_24dp.png',
              },
            },
          ],
        },
      });
    }

    if (name === 'tip') {
      const topic = options.find((o) => o.name === 'topic').value;
      const comments = await getAiComments();

      const category = comments[topic];
      if (!category || category.length === 0) {
        return res.send({ type: 4, data: { content: '❌ Topic not found in database.' } });
      }

      // Select a random tip from the array
      const randomTip = category[Math.floor(Math.random() * category.length)];

      return res.send({
        type: 4,
        data: {
          embeds: [
            {
              title: `🛠️ SYSTEM ADVISORY: ${topic}`,
              description: `*${randomTip}*`,
              color: 0xcc0000, // Dungeon Red
              footer: {
                text: 'Dungeon Metadata Service',
                icon_url: 'https://www.gstatic.com/images/icons/material/system/2x/warning_amber_white_24dp.png',
              },
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

    // --- Next three are grouped commands primarily for the DM
    if (name === 'check') {
      const stat = options.find((o) => o.name === 'stat').value; // e.g. 'strength'
      const key = statMap[stat];
      const label = stat.charAt(0).toUpperCase() + stat.slice(1) + ' Check';
      return res.send({ type: 4, data: handleRoll(label, key) });
    }

    if (name === 'save') {
      const stat = options.find((o) => o.name === 'stat').value; // e.g. 'dexterity'
      const key = saveMap[stat];
      const label = stat.charAt(0).toUpperCase() + stat.slice(1) + ' Save';
      return res.send({ type: 4, data: handleRoll(label, key) });
    }

    if (name === 'skill') {
      const skillName = options.find((o) => o.name === 'name').value; // e.g. 'sleight_of_hand'
      const key = skillMap[skillName];
      // Format label: 'sleight_of_hand' -> 'Sleight of Hand'
      const label = skillName
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return res.send({ type: 4, data: handleRoll(label, key) });
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
