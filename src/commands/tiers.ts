import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('tiers')
  .setDescription('📊 View all prize tiers and their drop odds');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor('Gold')
    .setTitle('📊 Prize Tiers & Drop Odds')
    .setDescription(
      `🎯 All rolls are based on the tier system below.\n` +
      `Higher tiers = rarer prizes. Pity system boosts your odds over time.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔥 **Tier 9** — 0.1%\n` +
      `🏆 **Tier 8** — 0.5%\n` +
      `✨ **Tier 7** — 1%\n` +
      `✨ **Tier 6** — 2%\n` +
      `💎 **Tier 5** — 4%\n` +
      `💎 **Tier 4** — 8%\n` +
      `🪙 **Tier 3** — 12%\n` +
      `🪙 **Tier 2** — 20%\n` +
      `🥉 **Tier 1** — 52.4%\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *Base odds only. Boosts may apply via pity or bonus rolls.*`
    );

  await interaction.editReply({ embeds: [embed] });
}
