import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Bot is online! Waiting for Discord interactions...');
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  
  // We need the raw body as a string for verification
  const rawBody = await getRawBody(req);

  const isValidRequest = verifyKey(
    rawBody,
    signature,
    timestamp,
    process.env.DISCORD_PUBLIC_KEY
  );

  if (!isValidRequest) {
    return res.status(401).send('Bad request signature');
  }

  // Now we can parse the JSON manually since we disabled the automatic bodyParser
  const interaction = JSON.parse(rawBody.toString());

  if (interaction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name } = interaction.data;

    if (name === 'roll') {
      const roll = Math.floor(Math.random() * 20) + 1;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `🎲 You rolled a **${roll}**!` },
      });
    }
  }

  return res.status(400).send('Unknown interaction');
}
