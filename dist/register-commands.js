"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
// Validate required environment variables
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
    throw new Error('❌ Missing environment variables: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID');
}
// Load all slash commands from /commands directory
const commandsPath = path_1.default.join(__dirname, 'commands');
const commandFiles = fs_1.default
    .readdirSync(commandsPath)
    .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
const commandMap = new Map();
for (const file of commandFiles) {
    const filePath = path_1.default.join(commandsPath, file);
    const commandModule = require(filePath);
    if ('data' in commandModule && commandModule.data instanceof discord_js_1.SlashCommandBuilder) {
        const commandName = commandModule.data.name;
        if (commandMap.has(commandName)) {
            console.warn(`⚠️ Duplicate command name found: "${commandName}". Skipping ${file}.`);
            continue;
        }
        commandMap.set(commandName, commandModule.data.toJSON());
    }
    else {
        console.warn(`⚠️ Skipping ${file} - Missing or invalid 'data' export`);
    }
}
const commands = Array.from(commandMap.values());
// Register commands
const rest = new discord_js_1.REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
    try {
        console.log(`🚀 Registering ${commands.length} unique slash command(s)...`);
        await rest.put(discord_js_1.Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log(`✅ Successfully registered ${commands.length} command(s) to guild ${GUILD_ID}.`);
    }
    catch (err) {
        console.error('❌ Failed to register commands:', err);
    }
})();
