"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
// Import commands
const bindWallet_1 = require("./commands/bindWallet");
const setGiveawayChannel_1 = require("./commands/setGiveawayChannel");
const stopBot_1 = require("./commands/stopBot");
const uptime_1 = require("./commands/uptime");
dotenv_1.default.config();
// Validate required environment variables
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    throw new Error('❌ Missing required environment variables: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID');
}
// Log partial secrets for verification
console.log('📦 Loading environment variables...');
console.log('🔑 DISCORD_TOKEN starts with:', process.env.DISCORD_TOKEN?.slice(0, 10));
console.log('🆔 CLIENT_ID:', process.env.CLIENT_ID);
console.log('🛡 GUILD_ID:', process.env.GUILD_ID);
// Prepare the slash commands
const commands = [
    bindWallet_1.data.toJSON(),
    setGiveawayChannel_1.data.toJSON(), // ✅ updated
    stopBot_1.data.toJSON(),
    uptime_1.data.toJSON(),
];
// Create REST client
const rest = new discord_js_1.REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
// Register commands with Discord API
(async () => {
    try {
        console.log('🚀 Registering commands...');
        await rest.put(discord_js_1.Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        console.log('✅ Slash commands registered.');
    }
    catch (err) {
        console.error('❌ Failed to register commands:', err);
    }
})();
