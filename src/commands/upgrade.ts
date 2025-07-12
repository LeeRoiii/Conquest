import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { supabase } from '../supabaseClient';

export const data = new SlashCommandBuilder()
  .setName('upgrade')
  .setDescription('Upgrade one of your buildings to improve resource production or defense.')
  .addStringOption(option =>
    option
      .setName('building')
      .setDescription('The building you want to upgrade')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;
  const buildingName = interaction.options.getString('building', true);

  await interaction.deferReply({ ephemeral: true });

  try {
    // 1. Get player and their buildings in one query
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('id, resources, player_buildings(building_name, level)')
      .eq('user_id', userId)
      .eq('server_id', serverId)
      .single();

    if (playerErr || !player) {
      return interaction.editReply('❌ You must start first using `/start`.');
    }

    // 2. Get building definition
    const { data: building, error: buildingErr } = await supabase
      .from('buildings')
      .select('*')
      .eq('name', buildingName)
      .single();

    if (buildingErr || !building) {
      return interaction.editReply(`❌ Building "${buildingName}" not found.`);
    }

    const bonusPerLevel = building.bonuses ?? {};
    const requirements = building.level_requirements ?? {};
    const maxLevel = building.max_level ?? 10;

    // 3. Determine current building level
    const playerBldg = player.player_buildings.find(b => b.building_name === buildingName);
    const currentLevel = playerBldg?.level ?? 0;
    const nextLevel = currentLevel + 1;

    if (nextLevel > maxLevel) {
      return interaction.editReply(`🧱 Your **${buildingName}** is already at the maximum level (${maxLevel}).`);
    }

    const cost = requirements[nextLevel.toString()];

    if (!cost) {
        return interaction.editReply(`❌ Upgrade requirements for **${buildingName}** level ${nextLevel} are not defined.`);
    }

    // 4. Resource check
    const canAfford = Object.entries(cost).every(([res, val]) => {
      return (player.resources[res] ?? 0) >= (val as number);
    });

    if (!canAfford) {
      const needed = Object.entries(cost)
        .map(([res, val]) => `- ${res}: ${val} (You have: ${player.resources[res] ?? 0})`)
        .join('\n');
      return interaction.editReply(`❌ Not enough resources to upgrade:\n${needed}`);
    }

    // 5. Deduct cost
    const updatedResources = { ...player.resources };
    for (const [res, val] of Object.entries(cost)) {
      updatedResources[res] = (updatedResources[res] ?? 0) - (val as number);
    }

    // Perform resource and building level updates in a transaction
    const { error: upgradeError } = await supabase.rpc('upgrade_building_and_deduct_resources', {
        p_player_id: player.id,
        p_building_name: buildingName,
        p_next_level: nextLevel,
        p_updated_resources: updatedResources
    });

    if (upgradeError) {
        console.error('Upgrade transaction error:', upgradeError);
        return interaction.editReply('❌ An error occurred during the upgrade. Please try again.');
    }


    // 6. Calculate bonus preview
    const formatBonus = (lvl: number) =>
      Object.entries(bonusPerLevel)
        .map(([type, value]) => `+${(value as number) * lvl} ${type}/hr`)
        .join(', ') || '—';

    const beforeBonus = formatBonus(currentLevel);
    const afterBonus = formatBonus(nextLevel);

    // 7. Return embed summary
    const embed = new EmbedBuilder()
      .setTitle(`🏗️ ${building.name} Upgraded!`)
      .setDescription(`Your **${building.name}** is now level **${nextLevel}**.`)
      .addFields(
        {
          name: '📊 Cost Spent',
          value: Object.entries(cost).map(([k, v]) => `- ${k}: ${v}`).join('\n'),
          inline: true,
        },
        { name: '📉 Before Bonus', value: beforeBonus, inline: true },
        { name: '📈 After Bonus', value: afterBonus, inline: true }
      )
      .setColor(Colors.Green)
      .setFooter({ text: `Max level: ${maxLevel}` });

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in upgrade command:', error);
    return interaction.editReply('An unexpected error occurred. Please try again later.');
  }
}

// 🔍 Autocomplete for all available buildings
export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused();
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (!player) return interaction.respond([]);

  // Fetch all possible buildings instead of just player-owned ones
  const { data: allBuildings } = await supabase
    .from('buildings')
    .select('name');

  if (!allBuildings) return interaction.respond([]);

  const buildingNames = allBuildings.map(b => b.name);

  const filtered = buildingNames
    .filter(name => name.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25);

  return interaction.respond(filtered.map(name => ({ name, value: name })));
}