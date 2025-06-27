"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('stop-bot')
    .setDescription('Stop the Giveaway bot (admin only)');
async function execute(interaction) {
    const member = interaction.member;
    if (!member.permissions.has('Administrator')) {
        return interaction.reply({
            content: '❌ Only admins can stop the bot.',
            ephemeral: true,
        });
    }
    await interaction.reply('🛑 Bot is shutting down...');
    console.log('🛑 Bot was stopped by an admin command.');
    process.exit(0); // Gracefully exit
}
