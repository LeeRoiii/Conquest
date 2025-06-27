"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
const bindWallet_1 = require("./commands/bindWallet");
const setGiveawayChannel_1 = require("./commands/setGiveawayChannel");
const stopBot_1 = require("./commands/stopBot");
const uptime_1 = require("./commands/uptime");
dotenv_1.default.config();
// Create the bot client
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMembers],
});
// Track bot uptime
const startTime = Date.now();
(0, uptime_1.initUptime)(startTime);
// When bot is ready
client.once(discord_js_1.Events.ClientReady, async () => {
    const username = client.user?.tag ?? 'Giveaway-bot';
    console.log(`✅ ${username} is online and ready!`);
    // Optionally send a startup message to a specific channel
    const startupChannelId = process.env.STARTUP_CHANNEL_ID;
    if (startupChannelId) {
        try {
            const channel = await client.channels.fetch(startupChannelId);
            if (channel &&
                (channel.isTextBased() &&
                    ('send' in channel && typeof channel.send === 'function'))) {
                await channel.send(`🟢 ${username} is now online!`);
            }
        }
        catch (err) {
            console.error('⚠️ Failed to send startup message:', err);
        }
    }
});
// Slash command handler
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    try {
        switch (interaction.commandName) {
            case 'bind-wallet':
                await (0, bindWallet_1.execute)(interaction);
                break;
            case 'set-giveaway-channel':
                await (0, setGiveawayChannel_1.execute)(interaction);
                break;
            case 'stop-bot':
                await (0, stopBot_1.execute)(interaction);
                break;
            case 'uptime':
                await (0, uptime_1.execute)(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❓ Unknown command.',
                    ephemeral: true,
                });
        }
    }
    catch (error) {
        console.error(`❌ Error handling /${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
                content: '❌ An error occurred while handling your command.',
            });
        }
        else {
            await interaction.reply({
                content: '❌ An error occurred while handling your command.',
                ephemeral: true,
            });
        }
    }
});
