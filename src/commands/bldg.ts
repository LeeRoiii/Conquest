import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { supabase } from '../supabaseClient';

export const data = new SlashCommandBuilder()
  .setName('bldg')
  .setDescription('Show all of your buildings, levels, and their effects.');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  // Step 1: Get player
  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (playerErr || !player) {
    return interaction.editReply('❌ You must start first using `/start`.');
  }

  // Step 2: Get player's buildings
  const { data: playerBuildings } = await supabase
    .from('player_buildings')
    .select('building_name, level')
    .eq('player_id', player.id);

  if (!playerBuildings || playerBuildings.length === 0) {
    return interaction.editReply('⚠️ You have no buildings yet.');
  }

  // Step 3: Fetch metadata for those buildings
  const buildingNames = playerBuildings.map(b => b.building_name);

  const { data: allMetadata } = await supabase
    .from('buildings')
    .select('name, description, bonuses')
    .in('name', buildingNames);

  const metadataMap = new Map(
    allMetadata?.map(b => [b.name, b]) ?? []
  );

  // Step 4: Format output
  const embed = new EmbedBuilder()
    .setTitle('🏛️ Your Buildings')
    .setColor(Colors.Blue);

  for (const bldg of playerBuildings) {
    const meta = metadataMap.get(bldg.building_name);
    const bonuses = meta?.bonuses
      ? Object.entries(meta.bonuses)
          .map(([res, val]) => `+${(val as number) * bldg.level} ${res}/hr`)
          .join(', ')
      : '—';

    embed.addFields({
      name: `🏗️ ${bldg.building_name} (Lv. ${bldg.level})`,
      value: `${meta?.description ?? 'No description'}\n🎁 Bonus: ${bonuses}`,
      inline: false,
    });
  }

  return interaction.editReply({ embeds: [embed] });
}
