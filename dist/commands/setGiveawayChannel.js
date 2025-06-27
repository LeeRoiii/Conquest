"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const supabaseClient_1 = require("../supabaseClient");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('set-giveaway-channel')
    .setDescription('Set the channel where giveaways will be sent')
    .addChannelOption(option => option
    .setName('channel')
    .setDescription('Channel to use for giveaways')
    .setRequired(true)
    .addChannelTypes(discord_js_1.ChannelType.GuildText));
async function execute(interaction) {
    // Check admin permission
    if (!interaction.memberPermissions?.has(discord_js_1.PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
            content: '❌ You must be an administrator to use this command.',
            ephemeral: true,
        });
    }
    const channel = interaction.options.getChannel('channel', true);
    // Store the channel in Supabase
    const guildId = interaction.guildId;
    const { error } = await supabaseClient_1.supabase
        .from('guild_settings')
        .upsert({ guild_id: guildId, giveaway_channel_id: channel.id });
    if (error) {
        return interaction.reply({
            content: '❌ Failed to save the giveaway channel. Try again later.',
            ephemeral: true,
        });
    }
    return interaction.reply({
        content: `✅ Giveaway messages will now be sent in <#${channel.id}>.`,
        ephemeral: true,
    });
}
