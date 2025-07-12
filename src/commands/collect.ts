import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { supabase } from '../supabaseClient';

const COLLECTION_INTERVAL_MINUTES = 60; // resources collected per hour
const MAX_OFFLINE_HOURS = 24; // max stash limit to avoid abuse

export const data = new SlashCommandBuilder()
  .setName('collect')
  .setDescription('Collect resources produced by your buildings.');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  // 1. Fetch player
  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('id, resources, last_collected_at')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (playerErr || !player) {
    return interaction.editReply('❌ You must start your kingdom first using `/start`.');
  }

  const now = new Date();
  const lastCollected = player.last_collected_at ? new Date(player.last_collected_at) : null;
  const minutesSince = lastCollected ? (now.getTime() - lastCollected.getTime()) / 60000 : MAX_OFFLINE_HOURS * 60;
  const cappedMinutes = Math.min(minutesSince, MAX_OFFLINE_HOURS * 60);

  if (cappedMinutes < COLLECTION_INTERVAL_MINUTES) {
    const waitMins = Math.ceil(COLLECTION_INTERVAL_MINUTES - cappedMinutes);
    return interaction.editReply(`🕒 You need to wait **${waitMins} more minutes** before collecting again.`);
  }

  const hoursElapsed = Math.floor(cappedMinutes / 60);

  // 2. Fetch player's buildings and building metadata
  const { data: userBuildings } = await supabase
    .from('player_buildings')
    .select('building_name, level')
    .eq('player_id', player.id);

  const { data: buildings } = await supabase.from('buildings').select('name, bonuses');

  // 3. Calculate total resource gain
  const collected: Record<string, number> = {};

  for (const pb of userBuildings ?? []) {
    const meta = buildings?.find(b => b.name === pb.building_name);
    if (!meta || !meta.bonuses) continue;

    for (const [res, perHour] of Object.entries(meta.bonuses)) {
      const amount = (perHour as number) * pb.level * hoursElapsed;
      collected[res] = (collected[res] ?? 0) + amount;
    }
  }

  // 4. Update player's resources
  const newResources = { ...player.resources };
  for (const [res, amount] of Object.entries(collected)) {
    newResources[res] = (newResources[res] ?? 0) + amount;
  }

  const { error: updateErr } = await supabase
    .from('players')
    .update({
      resources: newResources,
      last_collected_at: now.toISOString(),
    })
    .eq('id', player.id);

  if (updateErr) {
    console.error(updateErr);
    return interaction.editReply('❌ Failed to collect resources.');
  }

  // 5. Format reply
  const summary = Object.entries(collected)
    .map(([res, val]) => `+${val} ${res}`)
    .join('\n') || 'No resources gained.';

  const embed = new EmbedBuilder()
    .setTitle('📦 Resources Collected')
    .setDescription(`From your buildings over the past **${hoursElapsed} hour(s)**:`)
    .addFields({ name: 'Gains', value: summary })
    .setColor(Colors.Green);

  return interaction.editReply({ embeds: [embed] });
}
