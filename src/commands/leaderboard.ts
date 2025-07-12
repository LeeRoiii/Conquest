import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { supabase } from '../supabaseClient';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show top players by victories, troops, and resources');

export async function execute(interaction: ChatInputCommandInteraction) {
  const serverId = interaction.guildId!;

  // Fetch players with their stats including race
  const { data: players, error } = await supabase
    .from('players')
    .select('username, victories, units, resources, race')
    .eq('server_id', serverId);

  if (error || !players || players.length === 0) {
    return interaction.reply({ content: '❌ Could not fetch leaderboard data.', ephemeral: true });
  }

  // Helper to safely sum values from an unknown object
  const sumValues = (obj: unknown): number => {
    if (typeof obj !== 'object' || obj === null) return 0;
    return Object.values(obj).reduce((sum, val) => {
      const num = typeof val === 'number' ? val : 0;
      return sum + num;
    }, 0);
  };

  // Sort players by victories descending
  const sortedPlayers = [...players].sort((a, b) => (b.victories ?? 0) - (a.victories ?? 0));

  // Limit top 10
  const topPlayers = sortedPlayers.slice(0, 10);

  // Build the embed fields
  const fields = topPlayers.map((player, idx) => {
    const totalTroops = sumValues(player.units);
    const totalResources = sumValues(player.resources);

    return {
      name: `${idx + 1}. ${player.username} (${player.race ?? 'Unknown'})`,
      value:
        `🏆 Victories: **${player.victories ?? 0}**\n` +
        `⚔️ Troops: **${totalTroops}**\n` +
        `💰 Resources: **${totalResources}**`,
      inline: false,
    };
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 Leaderboard - Top Players')
    .addFields(fields)
    .setColor('Gold');

  await interaction.reply({ embeds: [embed] });
}
