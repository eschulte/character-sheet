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

const baseCommands = [
  { name: 'stats', description: 'Show character overview', type: 1, options: [] },
  { name: 'hp', description: 'Check current health', type: 1, options: [] },
  { name: 'inventory', description: 'List your equipment', type: 1, options: [] },
  {
    name: 'say',
    description: 'Speak as your character',
    type: 1,
    options: [{ name: 'message', description: 'What do you want to say?', type: 3, required: true }],
  },
  {
    name: 'me',
    description: 'Perform an action as your character',
    type: 1,
    options: [{ name: 'action', description: 'What are you doing?', type: 3, required: true }],
  },
  {
    name: 'combat',
    description: 'View details or roll for a weapon',
    type: 1,
    options: [
      { name: 'name', description: 'Select a weapon', type: 3, required: true, autocomplete: true },
      { name: 'roll', description: 'Actually roll the attack?', type: 5, required: false },
    ],
  },
  {
    name: 'equipment',
    description: 'Look up an item in your inventory',
    type: 1,
    options: [{ name: 'name', description: 'Item name', type: 3, required: true, autocomplete: true }],
  },
  { name: 'condition', description: 'Check your current conditions', type: 1, options: [] },
  {
    name: 'remaining',
    description: 'Check resource usage',
    type: 1,
    options: [{ name: 'type', description: 'Which resource?', type: 3, required: true, autocomplete: true }],
  },
  {
    name: 'tip',
    description: 'Get a helpful breakdown',
    type: 1,
    options: [{ name: 'topic', description: 'Concept to explain', type: 3, required: true, autocomplete: true }],
  },
  // Ability Checks & Saves
  ...['str', 'dex', 'con', 'int', 'wis', 'cha'].flatMap((stat) => [
    { name: `${stat}_check`, description: `${stat.toUpperCase()} Check`, type: 1, options: [rollOption] },
    { name: `${stat}_save`, description: `${stat.toUpperCase()} Save`, type: 1, options: [rollOption] },
  ]),
  // Skills
  { name: 'athletics', description: 'Athletics (Str)', type: 1, options: [rollOption] },
  { name: 'acrobatics', description: 'Acrobatics (Dex)', type: 1, options: [rollOption] },
  { name: 'sleight_of_hand', description: 'Sleight of Hand (Dex)', type: 1, options: [rollOption] },
  { name: 'stealth', description: 'Stealth (Dex)', type: 1, options: [rollOption] },
  { name: 'arcana', description: 'Arcana (Int)', type: 1, options: [rollOption] },
  { name: 'history', description: 'History (Int)', type: 1, options: [rollOption] },
  { name: 'investigation', description: 'Investigation (Int)', type: 1, options: [rollOption] },
  { name: 'nature', description: 'Nature (Int)', type: 1, options: [rollOption] },
  { name: 'religion', description: 'Religion (Int)', type: 1, options: [rollOption] },
  { name: 'animal_handling', description: 'Animal Handling (Wis)', type: 1, options: [rollOption] },
  { name: 'insight', description: 'Insight (Wis)', type: 1, options: [rollOption] },
  { name: 'medicine', description: 'Medicine (Wis)', type: 1, options: [rollOption] },
  { name: 'perception', description: 'Perception (Wis)', type: 1, options: [rollOption] },
  { name: 'survival', description: 'Survival (Wis)', type: 1, options: [rollOption] },
  { name: 'deception', description: 'Deception (Cha)', type: 1, options: [rollOption] },
  { name: 'intimidation', description: 'Intimidation (Cha)', type: 1, options: [rollOption] },
  { name: 'performance', description: 'Performance (Cha)', type: 1, options: [rollOption] },
  { name: 'persuasion', description: 'Persuasion (Cha)', type: 1, options: [rollOption] },
];

const targetOption = {
  name: 'target',
  description: 'Party member to target',
  type: 3, // String
  required: true,
  autocomplete: true, // Fetches from user's /party list
};

const dmCommand = {
  name: 'dm',
  description: 'DM Tools: Execute commands as another character',
  type: 1,
  options: baseCommands.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    type: 1, // Subcommand
    options: [targetOption, ...(cmd.options || [])],
  })),
};

const partyCommand = {
  name: 'party',
  description: 'Manage your DM Party list',
  type: 1,
  options: [
    {
      name: 'add',
      description: 'Add a player/character to your party list',
      type: 1, // Subcommand
      options: [
        { name: 'discord_user', description: 'Link a Discord User', type: 6, required: false },
        { name: 'character_name', description: 'Or, enter a Character Name', type: 3, required: false },
        { name: 'character_id', description: 'For characters: The Sheet ID', type: 3, required: false },
      ],
    },
    {
      name: 'remove',
      description: 'Remove a member from your party list',
      type: 1, // Subcommand
      options: [{ name: 'name', description: 'Name to remove', type: 3, required: true, autocomplete: true }],
    },
    {
      name: 'list',
      description: 'View your current party',
      type: 1, // Subcommand
    },
  ],
};

const commands = [
  ...baseCommands,
  dmCommand,
  partyCommand,
  {
    name: 'roll',
    description: 'Calculate a dice roll (e.g. 2d6 + 5)',
    type: 1,
    options: [{ name: 'expression', description: 'Formula (default: 1d20)', type: 3, required: false }],
  },
  { name: 'help', description: 'Get support link', type: 1 },
  {
    name: 'register',
    description: 'Link your Discord account',
    type: 1,
    options: [{ name: 'character_id', description: 'Character ID', type: 3, required: true }],
  },
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
