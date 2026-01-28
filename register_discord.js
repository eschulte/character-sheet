import * as dotenv from "dotenv";
dotenv.config();

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const commands = [
  { name: "data", description: "Test command", type: 1 },
  { name: "roll", description: "Roll a d20", type: 1 },
  { name: "stats", description: "Show character overview", type: 1 },
  { name: "hp", description: "Check current health", type: 1 },
  { name: "inventory", description: "List your equipment", type: 1 },
];

async function register() {
  const response = await fetch(
    `https://discord.com/api/v10/applications/${APP_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    },
  );

  const data = await response.json();
  console.log(response.ok ? "✅ Commands Registered!" : "❌ Error:", data);
}

register();
