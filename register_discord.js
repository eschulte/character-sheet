import * as dotenv from 'dotenv';
dotenv.config();

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// --- SHARED OPTIONS ---
const rollOption = {
  name: 'roll',
  description: 'Actually roll the d20?',
  type: 5, // Boolean
  required: false,
};

const targetOption = {
  name: 'target',
  description: 'Party member to target',
  type: 3, // String
  required: true,
  autocomplete: true,
};

// --- DATA DEFINITIONS ---
const STATS = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];

const SKILLS = [
  'Athletics',
  'Acrobatics',
  'Sleight of Hand',
  'Stealth',
  'Arcana',
  'History',
  'Investigation',
  'Nature',
  'Religion',
  'Animal Handling',
  'Insight',
  'Medicine',
  'Perception',
  'Survival',
  'Deception',
  'Intimidation',
  'Performance',
  'Persuasion',
];

// --- 1. UTILITY COMMANDS (Shared between Root and DM) ---
// These are few enough to keep as distinct subcommands
const utilityCommands = [
  {
    name: 'roll',
    description: 'Calculate a dice roll',
    type: 1,
    options: [{ name: 'expression', description: 'Formula', type: 3 }],
  },
  { name: 'stats', description: 'Show character overview', type: 1 },
  { name: 'hp', description: 'Check current health', type: 1 },
  { name: 'inventory', description: 'List equipment', type: 1 },
  {
    name: 'say',
    description: 'Speak as character',
    type: 1,
    options: [{ name: 'message', description: 'Message', type: 3, required: true }],
  },
  {
    name: 'me',
    description: 'Perform action',
    type: 1,
    options: [{ name: 'action', description: 'Action', type: 3, required: true }],
  },
  {
    name: 'combat',
    description: 'Weapon attack',
    type: 1,
    options: [
      { name: 'name', description: 'Weapon', type: 3, required: true, autocomplete: true },
      { name: 'roll', description: 'Roll?', type: 5 },
    ],
  },
  {
    name: 'equipment',
    description: 'Item lookup',
    type: 1,
    options: [{ name: 'name', description: 'Item', type: 3, required: true, autocomplete: true }],
  },
  { name: 'condition', description: 'Check status', type: 1 },
  {
    name: 'remaining',
    description: 'Check resources',
    type: 1,
    options: [{ name: 'type', description: 'Resource', type: 3, required: true, autocomplete: true }],
  },
  {
    name: 'tip',
    description: 'Get AI tip',
    type: 1,
    options: [{ name: 'topic', description: 'Topic', type: 3, required: true, autocomplete: true }],
  },
];

// --- 2. DM SPECIFIC SUBCOMMANDS (Grouped) ---
const dmOptions = [
  ...utilityCommands.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    type: 1,
    options: [targetOption, ...(cmd.options || [])],
  })),
  // Grouped Check
  {
    name: 'check',
    description: 'Roll an Ability Check',
    type: 1,
    options: [
      targetOption,
      {
        name: 'stat',
        description: 'Which ability?',
        type: 3,
        required: true,
        choices: STATS.map((s) => ({ name: s, value: s.toLowerCase() })),
      },
      rollOption,
    ],
  },
  // Grouped Save
  {
    name: 'save',
    description: 'Roll a Saving Throw',
    type: 1,
    options: [
      targetOption,
      {
        name: 'stat',
        description: 'Which save?',
        type: 3,
        required: true,
        choices: STATS.map((s) => ({ name: s, value: s.toLowerCase() })),
      },
      rollOption,
    ],
  },
  // Grouped Skill
  {
    name: 'skill',
    description: 'Roll a Skill Check',
    type: 1,
    options: [
      targetOption,
      {
        name: 'name',
        description: 'Which skill?',
        type: 3,
        required: true,
        choices: SKILLS.map((s) => ({ name: s, value: s.toLowerCase().replace(/ /g, '_') })),
      },
      rollOption,
    ],
  },
];

// --- 3. ROOT COMMANDS (Individual) ---
// We keep these individual for ease of use by players (e.g., /stealth is faster than /skill name:stealth)
const rootSkillCommands = SKILLS.map((s) => ({
  name: s.toLowerCase().replace(/ /g, '_'),
  description: `${s} Check`,
  type: 1,
  options: [rollOption],
}));

const rootCheckCommands = STATS.flatMap((s) => [
  { name: `${s.toLowerCase().substring(0, 3)}_check`, description: `${s} Check`, type: 1, options: [rollOption] },
  { name: `${s.toLowerCase().substring(0, 3)}_save`, description: `${s} Save`, type: 1, options: [rollOption] },
]);

const commands = [
  { name: 'dm', description: 'DM Tools: Execute commands on targets', type: 1, options: dmOptions },
  {
    name: 'party',
    description: 'Manage DM party list',
    type: 1,
    options: [
      {
        name: 'add',
        description: 'Add member',
        type: 1,
        options: [
          { name: 'discord_user', description: 'User', type: 6 },
          { name: 'character_name', description: 'Char Name', type: 3 },
          { name: 'character_id', description: 'Sheet ID', type: 3 },
        ],
      },
      {
        name: 'remove',
        description: 'Remove member',
        type: 1,
        options: [{ name: 'name', description: 'Name', type: 3, required: true, autocomplete: true }],
      },
      { name: 'list', description: 'List party', type: 1 },
    ],
  },
  {
    name: 'register',
    description: 'Link account',
    type: 1,
    options: [{ name: 'character_id', description: 'ID', type: 3, required: true }],
  },
  { name: 'help', description: 'Get help', type: 1 },
  ...utilityCommands, // Add the utility commands as root commands too
  ...rootSkillCommands,
  ...rootCheckCommands,
];

async function register() {
  console.log(`Registering ${commands.length} commands...`);
  // Note: Root commands list is large (~60), but valid (limit is 100).
  // DM subcommands list is now ~14, valid (limit is 25).
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
