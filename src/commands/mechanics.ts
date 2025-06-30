import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('mechanics')
  .setDescription('📖 Mechanics — How the prize system works');

export async function execute(interaction: ChatInputCommandInteraction) {
  // 🕒 Set fallback timeout in case deferReply fails too late
  const timeout = setTimeout(() => {
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({
        content: '⏳ Loading prize system info...',
        ephemeral: true,
      }).catch(() => {});
    }
  }, 2500);

  await interaction.deferReply({ ephemeral: true }).catch(() => {}); // fallback safe

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('📖 How the Prize System Works')
    .addFields(
      {
        name: '🎯 Objective',
        value:
          'Roll daily or earn bonus spins to win prizes! Higher tiers = better rewards.',
      },
      {
        name: '⚙️ Mechanics',
        value:
          `• **Daily Roll**: 1 free roll every 24 hours\n` +
          `• **Bonus Rolls**: Earned via events, marketplace, or given by admins\n` +
          `• **Pity System**: Guaranteed reward if you don’t win after several tries\n` +
          `• **Tiers**: Tier 1 (common) → Tier 9 (jackpot)\n`,
      },
      {
        name: '📌 How to Start',
        value:
          `1. Use \`/wallet\` to bind your Solana address\n` +
          `2. Go to the designated giveaway channel\n` +
          `3. Use \`/roll\` to spin the wheel!`,
      },
      {
        name: '🔑 Tips',
        value:
          `• Check your roll history with \`/history\`\n` +
          `• Stay active for surprise bonus rolls!`,
      }
    )
    .setFooter({ text: 'Good luck, and may the odds be ever in your favor!' });

  await interaction.editReply({ embeds: [embed] }).catch(() => {});
  clearTimeout(timeout);
}
