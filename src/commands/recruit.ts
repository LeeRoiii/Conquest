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

// --- Constants for Button IDs ---
const PREV_BUTTON_ID = 'recruit_prev';
const NEXT_BUTTON_ID = 'recruit_next';
const RECRUIT_BUTTON_ID = 'recruit_confirm';

// --- Type Definitions for Clarity ---
type Resources = { [key: string]: number };
type Units = { [key: string]: number };
type Requirements = { base_level?: string; [key: string]: any };

type Player = {
  resources: Resources;
  units: Units;
  base_level: string;
};

type Troop = {
  id: string;
  name: string;
  description: string;
  cost: Resources;
  stats: {
    attack: number;
    defense: number;
  };
  requirements: Requirements | null; // Can be null if no requirements
  created_at: string;
};


// --- Helper Functions ---

/**
 * Checks if a player meets all requirements to recruit a troop.
 * @param troop The troop to check.
 * @param player The player.
 * @returns True if requirements are met, otherwise false.
 */
const meetsRequirements = (troop: Troop, player: Player): boolean => {
    if (!troop.requirements) {
        return true; // No requirements to meet
    }
    // Add more requirement checks here as needed
    if (troop.requirements.base_level && player.base_level !== troop.requirements.base_level) {
        return false;
    }
    return true;
};

/**
 * Creates the embed for the recruitment menu.
 */
const getEmbed = (page: number, troops: Troop[], player: Player) => {
  const troop = troops[page];
  const troopNameLower = troop.name.toLowerCase();
  const currentlyOwned = player.units[troopNameLower] || 0;
  
  const requirementMet = meetsRequirements(troop, player);

  // Creates a cost string that shows the user's current resources for comparison.
  const costText = Object.entries(troop.cost)
    .map(([resource, value]) => {
      const playerResource = player.resources[resource] || 0;
      const affordIndicator = playerResource >= (value as number) ? '✅' : '❌';
      return `${resource}: ${value} (${playerResource}) ${affordIndicator}`;
    })
    .join('\n');

  const statsText = `⚔️ Attack: ${troop.stats.attack}\n🛡️ Defense: ${troop.stats.defense}`;

  const embed = new EmbedBuilder()
    .setTitle(`Recruit: ${troop.name}`)
    .setDescription(`${troop.description}\n\n**You currently own: ${currentlyOwned}**`)
    .addFields(
      { name: 'Unit Cost (Per Unit)', value: costText, inline: true },
      { name: 'Stats', value: statsText, inline: true }
    )
    .setFooter({ text: `Unit ${page + 1} of ${troops.length}` })
    .setColor('Blue');

  // Add a field for requirements if they exist
  if (troop.requirements?.base_level) {
    const requirementValue = `Required: ${troop.requirements.base_level} (You have: ${player.base_level})`
    embed.addFields({ name: 'Requirements', value: `${requirementMet ? '✅' : '❌'} ${requirementValue}` });
  }

  return embed;
};

/**
 * Creates the action rows with buttons for navigation and recruiting.
 */
const getButtons = (page: number, troopsLength: number, canRecruit: boolean) => {
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
        .setDisabled(page + 1 >= troopsLength)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(RECRUIT_BUTTON_ID)
        .setLabel('✅ Recruit')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canRecruit) // Disable button if requirements/cost not met
    ),
  ];
};


// --- Slash Command ---

export const data = new SlashCommandBuilder()
  .setName('recruit')
  .setDescription('Recruit troops for your army')
  .addNumberOption(option =>
    option.setName('quantity')
      .setDescription('The number of units to recruit (default: 1)')
      .setMinValue(1)
      .setMaxValue(100)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  // 🧙 Fetch player, now including base_level for requirement checks
  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('resources, units, base_level')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (playerErr || !player) {
    return interaction.editReply({ content: '❌ You must start your conquest first using `/start`.' });
  }

  // ⚔️ Fetch troops
  const { data: troops, error: troopsErr } = await supabase
    .from('troops')
    .select('*');

  if (troopsErr || !troops || troops.length === 0) {
    return interaction.editReply({ content: '❌ No troops available for recruitment.' });
  }

  let page = 0;

  // Determine if the recruit button should be enabled initially
  const canAffordOne = Object.entries(troops[page].cost).every(
    ([res, val]) => (player.resources[res] || 0) >= (val as number)
  );
  const requirementsMet = meetsRequirements(troops[page], player as Player);

  const message = await interaction.editReply({
    embeds: [getEmbed(page, troops, player as Player)],
    components: getButtons(page, troops.length, canAffordOne && requirementsMet),
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
  });

  collector.on('collect', async (btn: ButtonInteraction) => {
    if (btn.user.id !== userId) {
      await btn.reply({ content: 'These buttons are not for you.', ephemeral: true });
      return;
    }
    await btn.deferUpdate();

    if (btn.customId === NEXT_BUTTON_ID) page++;
    if (btn.customId === PREV_BUTTON_ID) page--;

    if (btn.customId === RECRUIT_BUTTON_ID) {
      const quantity = interaction.options.getNumber('quantity') || 1;
      const selectedTroop = troops[page];

      // Final check for affordability for the full quantity
      const totalCost: Resources = {};
      for (const [res, val] of Object.entries(selectedTroop.cost)) {
        totalCost[res] = (val as number) * quantity;
      }
      const canAffordAll = Object.entries(totalCost).every(
        ([res, val]) => (player.resources[res] || 0) >= (val as number)
      );

      if (!canAffordAll) {
        return interaction.followUp({
          content: `❌ Not enough resources to recruit **${quantity} ${selectedTroop.name}**.`,
          ephemeral: true,
        });
      }

      // Final check on requirements, just in case
      if (!meetsRequirements(selectedTroop, player as Player)) {
         return interaction.followUp({
          content: `❌ You do not meet the requirements to recruit **${selectedTroop.name}**.`,
          ephemeral: true,
        });
      }

      const newResources: Resources = { ...player.resources };
      for (const [res, val] of Object.entries(totalCost)) {
        newResources[res] = (newResources[res] || 0) - (val as number);
      }

      const newUnits: Units = { ...player.units };
      const troopNameLower = selectedTroop.name.toLowerCase();
      newUnits[troopNameLower] = (newUnits[troopNameLower] || 0) + quantity;
      
      const { error: updateErr } = await supabase
        .from('players')
        .update({ resources: newResources, units: newUnits })
        .eq('user_id', userId)
        .eq('server_id', serverId);

      if (updateErr) {
        console.error('Supabase update error:', updateErr);
        return interaction.followUp({ content: '❌ An error occurred while updating your army.', ephemeral: true });
      }

      player.resources = newResources;
      player.units = newUnits;

      await interaction.followUp({
        content: `✅ Success! You have recruited **${quantity} ${selectedTroop.name}**.`,
        ephemeral: true,
      });
    }

    // After any button press, re-evaluate if the recruit button should be enabled for the new page
    const canAffordOneUpdate = Object.entries(troops[page].cost).every(
        ([res, val]) => (player.resources[res] || 0) >= (val as number)
    );
    const requirementsMetUpdate = meetsRequirements(troops[page], player as Player);

    await interaction.editReply({
      embeds: [getEmbed(page, troops, player as Player)],
      components: getButtons(page, troops.length, canAffordOneUpdate && requirementsMetUpdate),
    });
  });

  collector.on('end', (_collected, reason) => {
    if (reason === 'time') {
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('Recruitment Timed Out')
        .setDescription('You took too long to make a selection. Use `/recruit` again.')
        .setColor('Grey');
      interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    } else {
      interaction.editReply({ components: [] }).catch(() => {});
    }
  });
}
