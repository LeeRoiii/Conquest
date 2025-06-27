"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const supabaseClient_1 = require("../supabaseClient");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('bind-wallet')
    .setDescription('Bind your Solana wallet address')
    .addStringOption(option => option
    .setName('address')
    .setDescription('Your Solana wallet address')
    .setRequired(true));
async function execute(interaction) {
    const wallet = interaction.options.getString('address', true);
    const discordId = interaction.user.id;
    const username = interaction.user.tag;
    // ✅ Validate Solana wallet format (Base58)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
        return interaction.reply({
            content: '❌ Invalid wallet address format.',
            ephemeral: true,
        });
    }
    // ✅ Ensure command is used in a guild
    if (!interaction.inGuild() || !interaction.member) {
        return interaction.reply({
            content: '❌ This command must be used in a server.',
            ephemeral: true,
        });
    }
    // ✅ Check if member has Level 2+ role
    const member = interaction.member;
    const requiredRoleId = process.env.LEVEL_2_ROLE_ID;
    if (!member.roles.cache.has(requiredRoleId)) {
        return interaction.reply({
            content: '❌ You need the Level 2+ role to bind a wallet.',
            ephemeral: true,
        });
    }
    // ✅ Insert or update in Supabase
    const { error } = await supabaseClient_1.supabase.from('users').upsert({
        discord_id: discordId,
        username,
        wallet,
        bound_at: new Date().toISOString(),
    }, { onConflict: 'discord_id' } // conflict target
    );
    if (error) {
        console.error('❌ Supabase error:', error);
        return interaction.reply({
            content: '❌ Failed to save wallet. Please try again later.',
            ephemeral: true,
        });
    }
    return interaction.reply({
        content: `✅ Wallet \`${wallet}\` successfully bound to your account.`,
        ephemeral: true,
    });
}
