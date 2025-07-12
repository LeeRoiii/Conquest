import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
} from 'discord.js';
import { supabase } from '../supabaseClient';

// --- Constants ---
const PREV_BUTTON_ID = 'army_prev';
const NEXT_BUTTON_ID = 'army_next';

// --- Type Definitions ---
type Units = { [key: string]: number };

type Player = {
  units: Units;
  username: string;
};

// CORRECTED: Removed the 'id' property as it's not needed for this command.
type Troop = {
  name: string;
  description: string;
  stats: {
    attack: number;
    defense: number;
  };
};

// --- Helper Functions ---

/**
 * Creates the embed for the army viewer.
 * @param page The current page of the owned troops list.
 * @param ownedTroops The filtered list of troops the player owns.
 * @param player The player object.
 * @param totalPower The calculated total power of the army.
 * @param totalUnits The total number of units.
 * @returns An EmbedBuilder instance.
 */
function getEmbed(page: number, ownedTroops: Troop[], player: Player, totalPower: number, totalUnits: number) {
  const troop = ownedTroops[page];
  const troopNameLower = troop.name.toLowerCase();
  const count = player.units[troopNameLower] || 0;

  return new EmbedBuilder()
    .setTitle(`🛡️ ${player.username}'s Army 🛡️`)
    .setDescription(`*A display of your military might.*`)
    .addFields(
      { name: 'Current Troop', value: `**${troop.name}**`, inline: false },
      { name: 'Owned', value: `**${count}**`, inline: true },
      { name: 'Attack', value: `⚔️ ${troop.stats.attack}`, inline: true },
      { name: 'Defense', value: `🛡️ ${troop.stats.defense}`, inline: true },
      { name: 'Total Units', value: `👥 ${totalUnits}`, inline: true },
      { name: 'Total Power', value: `💥 ${totalPower}`, inline: true }
    )
    .setFooter({ text: `Troop Type ${page + 1} of ${ownedTroops.length}` })
    .setColor('DarkGreen');
}

/**
 * Creates the navigation buttons for the embed.
 * @param page The current page.
 * @param pageCount The total number of pages.
 * @returns An array containing an ActionRowBuilder.
 */
function getComponents(page: number, pageCount: number) {
    return [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(PREV_BUTTON_ID)
                .setLabel('⬅️ Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(NEXT_BUTTON_ID)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= pageCount - 1)
        ),
    ];
}


// --- Slash Command ---

export const data = new SlashCommandBuilder()
  .setName('army')
  .setDescription('View your army and its total power.');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  // Fetch player data
  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('units, username')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (playerErr || !player) {
    return interaction.editReply({ content: '❌ You have no army yet. Use `/start` to begin your conquest.' });
  }
  
  // Fetch all troop definitions
  const { data: allTroops, error: troopsErr } = await supabase
    .from('troops')
    .select('name, description, stats');

  if (troopsErr || !allTroops) {
    return interaction.editReply({ content: '❌ Error fetching troop data.' });
  }

  const units: Units = player.units || {};
  const ownedTroopNames = new Set(Object.keys(units).filter(name => units[name] > 0));

  // Filter the troop list to only include troops the player owns
  const ownedTroops = allTroops.filter(troop => ownedTroopNames.has(troop.name.toLowerCase()));

  if (ownedTroops.length === 0) {
      return interaction.editReply({ content: "You have an army, but you don't own any troops yet! Use `/recruit` to build your forces." });
  }

  // Calculate total army power and total units
  const { totalPower, totalUnits } = ownedTroops.reduce((acc, troop) => {
    const count = units[troop.name.toLowerCase()] || 0;
    acc.totalPower += (troop.stats.attack + troop.stats.defense) * count;
    acc.totalUnits += count;
    return acc;
  }, { totalPower: 0, totalUnits: 0 });

  let page = 0;

  const message = await interaction.editReply({
    embeds: [getEmbed(page, ownedTroops, player as Player, totalPower, totalUnits)],
    components: getComponents(page, ownedTroops.length),
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
  });

  collector.on('collect', async (btn: ButtonInteraction) => {
    if (btn.user.id !== userId) {
      await btn.reply({ content: 'These buttons are not for you.', ephemeral: true });
      return;
    }
    await btn.deferUpdate();

    if (btn.customId === PREV_BUTTON_ID) page--;
    else if (btn.customId === NEXT_BUTTON_ID) page++;

    await btn.editReply({
      embeds: [getEmbed(page, ownedTroops, player as Player, totalPower, totalUnits)],
      components: getComponents(page, ownedTroops.length),
    });
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
