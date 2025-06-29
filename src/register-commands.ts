import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Validate required environment variables
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error('❌ Missing environment variables: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID');
}

// Load all slash commands from /commands directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

const commandMap = new Map<string, any>();

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const commandModule = require(filePath);

  if ('data' in commandModule && commandModule.data instanceof SlashCommandBuilder) {
    const commandName = commandModule.data.name;

    if (commandMap.has(commandName)) {
      console.warn(`⚠️ Duplicate command name found: "${commandName}". Skipping ${file}.`);
      continue;
    }

    commandMap.set(commandName, commandModule.data.toJSON());
  } else {
    console.warn(`⚠️ Skipping ${file} - Missing or invalid 'data' export`);
  }
}

const commands = Array.from(commandMap.values());

// Register commands
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🚀 Registering ${commands.length} unique slash command(s)...`);
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Successfully registered ${commands.length} command(s) to guild ${GUILD_ID}.`);
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();
