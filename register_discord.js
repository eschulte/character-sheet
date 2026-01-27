const fetch = require('node-fetch');

const APP_ID = 'YOUR_DISCORD_APP_ID';
const BOT_TOKEN = 'YOUR_DISCORD_BOT_TOKEN';

const commands = [
    {
        name: 'roll',
        description: 'Roll a 20-sided die',
        type: 1,
    }
];

fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
    method: 'PUT',
    headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
}).then(res => res.json()).then(console.log);
