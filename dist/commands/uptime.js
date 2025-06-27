"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = exports.initUptime = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
let startTime;
const initUptime = (startedAt) => {
    startTime = startedAt;
};
exports.initUptime = initUptime;
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows how long the bot has been running');
async function execute(interaction) {
    const uptimeMs = Date.now() - startTime;
    const seconds = Math.floor((uptimeMs / 1000) % 60);
    const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
    const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    await interaction.reply({
        content: `⏱ Bot uptime: ${days}d ${hours}h ${minutes}m ${seconds}s`,
        ephemeral: true,
    });
}
