import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
  EmbedBuilder,
} from 'discord.js';
import { supabase } from '../supabaseClient';

// Define a type for our selectable items for better type-checking
type SelectableItem = {
  id: string;
  name: string;
  description: string;
  details?: string;
  bonus?: Record<string, any>;
};

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Begin your conquest');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;
  const username = interaction.user.username;

  await interaction.deferReply({ ephemeral: true });

  // ✅ Check if player already exists
  const { data: existingPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (existingPlayer) {
    return interaction.editReply({
      content: '⚠️ You have already started your conquest in this server!',
    });
  }

  // 🧙 Select Race
  const chosenRace = await createPaginatedSelector(
    interaction,
    'race',
    async () => {
      const { data: races, error } = await supabase
        .from('races')
        .select('name, trait');
      if (error || !races) {
        console.error('❌ Error fetching races:', error);
        return [];
      }
      return races.map(r => ({
        id: r.name,
        name: r.name,
        description: r.trait ?? 'No description',
      }));
    },
    '🧝 Choose Your Race',
    item => `**${item.name}**\n${item.description}`
  );

  if (!chosenRace) {
    return interaction.editReply({ content: '⏳ Race selection timed out. Please run `/start` again.', components: [] });
  }

  // 🗺️ Select Region
  const chosenRegion = await createPaginatedSelector(
    interaction,
    'region',
    async () => {
      const { data: allRegions, error: regionError } = await supabase
        .from('regions')
        .select('id, name, terrain, bonus');
      if (regionError || !allRegions) {
        console.error('❌ Failed to fetch regions:', regionError);
        return [];
      }

      const { data: takenRegions } = await supabase
        .from('players')
        .select('region_id')
        .eq('server_id', serverId);
      
      const takenSet = new Set(takenRegions?.map(p => p.region_id) ?? []);
      const available = allRegions.filter(r => !takenSet.has(r.id));
      
      return available.map(r => ({
        id: r.id,
        name: r.name,
        description: `*${r.terrain}*`,
        details: `Bonus: \`${Object.entries(r.bonus || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'}\``,
      }));
    },
    '🌍 Choose Your Starting Region',
    item => `**${item.name}** – ${item.description}\n${item.details}`
  );
  
  if (!chosenRegion) {
    return interaction.editReply({ content: '⏳ Region selection timed out. Please run `/start` again.', components: [] });
  }
  
  // 🏰 Finalize and create kingdom
  const { error: insertError } = await supabase.from('players').insert({
    user_id: userId,
    username,
    server_id: serverId,
    race: chosenRace.name,
    region_id: chosenRegion.id,
  });

  if (insertError) {
    console.error('❌ Failed to insert player:', insertError);
    // A specific check for a race condition where the region is taken after selection.
    if (insertError.code === '23505') { // Postgres unique violation
        return interaction.editReply({ content: '❌ This region was just taken by another player. Please try again.', components: []});
    }
    return interaction.editReply({ content: '❌ Failed to create your kingdom due to a database error.', components: [] });
  }

  // Use editReply on the original interaction to clear the components and show the final message
  await interaction.editReply({
    content: '',
    embeds: [
      new EmbedBuilder()
        .setTitle('🏰 Kingdom Established!')
        .setDescription(`**${username}** the **${chosenRace.name}** of **${chosenRegion.name}**.\nYour conquest begins now.`)
        .setColor('Green'),
    ],
    components: [],
  });
}

/**
 * A generic function to handle paginated selection from a list of items.
 */
async function createPaginatedSelector(
  interaction: ChatInputCommandInteraction,
  type: 'race' | 'region',
  fetchItems: () => Promise<SelectableItem[]>,
  title: string,
  formatDescription: (item: SelectableItem) => string
): Promise<SelectableItem | null> {
  const items = await fetchItems();

  if (items.length === 0) {
    await interaction.editReply({ content: `❌ No ${type}s available at the moment.` });
    return null;
  }

  let currentPage = 0;
  
  const getEmbed = (page: number) => new EmbedBuilder()
      .setTitle(title)
      .setDescription(formatDescription(items[page]))
      .setFooter({ text: `Page ${page + 1} of ${items.length}` });
  
  const getComponents = (page: number) => {
    const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${type}_prev`)
        .setLabel('⬅️ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${type}_next`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page + 1 >= items.length)
    );
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${type}_select`)
            .setLabel('✅ Select')
            .setStyle(ButtonStyle.Success)
    );
    return [navigationRow, actionRow];
  }
  
  const message = await interaction.editReply({
    embeds: [getEmbed(currentPage)],
    components: getComponents(currentPage),
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000, // 2 minutes
  });

  return new Promise((resolve) => {
    collector.on('collect', async (i: ButtonInteraction) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: "You can't use these buttons.", ephemeral: true });
        return;
      }
      
      await i.deferUpdate();

      if (i.customId === `${type}_select`) {
        collector.stop();
        resolve(items[currentPage]);
        return;
      }

      if (i.customId === `${type}_prev`) currentPage--;
      else if (i.customId === `${type}_next`) currentPage++;

      await i.editReply({
        embeds: [getEmbed(currentPage)],
        components: getComponents(currentPage),
      });
    });

    collector.on('end', (_collected, reason) => {
      if (reason === 'time') {
        resolve(null);
      }
    });
  });
}