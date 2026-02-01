import * as dotenv from 'dotenv';
dotenv.config();

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Helper to generate the roll option for every command
const rollOption = {
  name: 'roll',
  description: 'Actually roll the d20?',
  type: 5, // Boolean
  required: false,
};

const commands = [
  {
    name: 'roll',
    description: 'Calculate a dice roll (e.g. 2d6 + 5)',
    type: 1,
    options: [
      {
        name: 'expression',
        description: 'Formula (default: 1d20)',
        type: 3, // String
        required: false,
      },
    ],
  },
  { name: 'help', description: 'Get a link to the command guide and support page', type: 1 },

  {
    name: 'register',
    description: 'Link your Discord account to a Character Sheet',
    type: 1,
    options: [
      {
        name: 'character_id',
        description: 'The ID of your character (found in your sheet URL)',
        type: 3, // String
        required: true,
      },
    ],
  },
  { name: 'stats', description: 'Show character overview', type: 1 },
  { name: 'hp', description: 'Check current health', type: 1 },
  { name: 'inventory', description: 'List your equipment', type: 1 },

  {
    name: 'say',
    description: 'Speak as your character',
    type: 1,
    options: [
      {
        name: 'message',
        description: 'What do you want to say?',
        type: 3, // String
        required: true,
      },
    ],
  },

  {
    name: 'me',
    description: 'Perform an action as your character',
    type: 1,
    options: [
      {
        name: 'action',
        description: 'What are you doing? (e.g. lunges forward with his blade)',
        type: 3, // String
        required: true,
      },
    ],
  },

  {
    name: 'combat',
    description: 'View details or roll for a weapon',
    type: 1,
    options: [
      { name: 'name', description: 'Select a weapon (click to see list)', type: 3, required: true, autocomplete: true },
      { name: 'roll', description: 'Actually roll the attack?', type: 5, required: false },
    ],
  },

  {
    name: 'equipment',
    description: 'Look up an item in your inventory',
    type: 1,
    options: [{ name: 'name', description: 'Item name', type: 3, required: true, autocomplete: true }],
  },

  { name: 'condition', description: 'Check your current conditions and status effects', type: 1 },

  {
    name: 'remaining',
    description: 'Check how many uses of a resource you have left',
    type: 1,
    options: [
      {
        name: 'type',
        description: 'Which resource to check?',
        type: 3, // String
        required: true,
        autocomplete: true,
      },
    ],
  },

  {
    name: 'tip',
    description: 'Get a tactical breakdown of a D&D concept (AI Voice)',
    type: 1,
    options: [
      {
        name: 'topic',
        description: 'Concept to explain (click for list)',
        type: 3, // String
        required: true,
        autocomplete: true,
      },
    ],
  },

  // --- Ability Checks ---
  { name: 'str_check', description: 'Strength Check', type: 1, options: [rollOption] },
  { name: 'dex_check', description: 'Dexterity Check', type: 1, options: [rollOption] },
  { name: 'con_check', description: 'Constitution Check', type: 1, options: [rollOption] },
  { name: 'int_check', description: 'Intelligence Check', type: 1, options: [rollOption] },
  { name: 'wis_check', description: 'Wisdom Check', type: 1, options: [rollOption] },
  { name: 'cha_check', description: 'Charisma Check', type: 1, options: [rollOption] },

  // --- Saving Throws ---
  { name: 'str_save', description: 'Strength Saving Throw', type: 1, options: [rollOption] },
  { name: 'dex_save', description: 'Dexterity Saving Throw', type: 1, options: [rollOption] },
  { name: 'con_save', description: 'Constitution Saving Throw', type: 1, options: [rollOption] },
  { name: 'int_save', description: 'Intelligence Saving Throw', type: 1, options: [rollOption] },
  { name: 'wis_save', description: 'Wisdom Saving Throw', type: 1, options: [rollOption] },
  { name: 'cha_save', description: 'Charisma Saving Throw', type: 1, options: [rollOption] },

  // --- Skills ---
  { name: 'athletics', description: 'Athletics (Str) Check', type: 1, options: [rollOption] },
  { name: 'acrobatics', description: 'Acrobatics (Dex) Check', type: 1, options: [rollOption] },
  { name: 'sleight_of_hand', description: 'Sleight of Hand (Dex) Check', type: 1, options: [rollOption] },
  { name: 'stealth', description: 'Stealth (Dex) Check', type: 1, options: [rollOption] },
  { name: 'arcana', description: 'Arcana (Int) Check', type: 1, options: [rollOption] },
  { name: 'history', description: 'History (Int) Check', type: 1, options: [rollOption] },
  { name: 'investigation', description: 'Investigation (Int) Check', type: 1, options: [rollOption] },
  { name: 'nature', description: 'Nature (Int) Check', type: 1, options: [rollOption] },
  { name: 'religion', description: 'Religion (Int) Check', type: 1, options: [rollOption] },
  { name: 'animal_handling', description: 'Animal Handling (Wis) Check', type: 1, options: [rollOption] },
  { name: 'insight', description: 'Insight (Wis) Check', type: 1, options: [rollOption] },
  { name: 'medicine', description: 'Medicine (Wis) Check', type: 1, options: [rollOption] },
  { name: 'perception', description: 'Perception (Wis) Check', type: 1, options: [rollOption] },
  { name: 'survival', description: 'Survival (Wis) Check', type: 1, options: [rollOption] },
  { name: 'deception', description: 'Deception (Cha) Check', type: 1, options: [rollOption] },
  { name: 'intimidation', description: 'Intimidation (Cha) Check', type: 1, options: [rollOption] },
  { name: 'performance', description: 'Performance (Cha) Check', type: 1, options: [rollOption] },
  { name: 'persuasion', description: 'Persuasion (Cha) Check', type: 1, options: [rollOption] },
];

async function register() {
  console.log(`Attempting to register ${commands.length} commands...`);
  const response = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });

  const data = await response.json();
  if (response.ok) {
    console.log('✅ Commands Registered successfully!');
  } else {
    console.error('❌ Error registering commands:');
    console.dir(data, { depth: null });
  }
}

register();
