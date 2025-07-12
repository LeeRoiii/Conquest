import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { supabase } from '../supabaseClient';

const STAMINA_COST = 20;
const MAX_STAMINA = 200;
const STAMINA_REPLENISH_MINUTES = 15;
const EXPLORE_DURATION_MINUTES = 30;

export const data = new SlashCommandBuilder()
  .setName('explore')
  .setDescription(
    `Explore for ${EXPLORE_DURATION_MINUTES} minutes. Costs ${STAMINA_COST} stamina.`
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  // Fetch player data including stamina & last explore time
  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('resources, stamina, stamina_updated_at, last_explore_time, units')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (playerErr || !player) {
    return interaction.editReply(
      '❌ You must start your conquest first with `/start`.'
    );
  }

  // --- Check if an exploration is already in progress ---
  if (player.last_explore_time) {
    const lastExplore = new Date(player.last_explore_time);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastExplore.getTime()) / 60000;

    if (diffMinutes < EXPLORE_DURATION_MINUTES) {
      const minutesRemaining = Math.ceil(EXPLORE_DURATION_MINUTES - diffMinutes);
      return interaction.editReply(
        `⏳ Your exploration is already underway! You will get the results in **${minutesRemaining} minute(s)**.`
      );
    }
  }

  // --- Recalculate stamina based on last update ---do i need to updat he 
  let staminaCurrent = player.stamina ?? MAX_STAMINA;
  if (player.stamina_updated_at) {
    const lastUpdate = new Date(player.stamina_updated_at);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);
    const gainedPoints = Math.floor(diffMinutes / STAMINA_REPLENISH_MINUTES);
    staminaCurrent = Math.min(MAX_STAMINA, staminaCurrent + gainedPoints);
  }

  if (staminaCurrent < STAMINA_COST) {
    return interaction.editReply(
      `❌ Not enough stamina to explore. You need ${STAMINA_COST}, but have ${Math.floor(staminaCurrent)}.`
    );
  }

  // --- Start the exploration ---
  const nowISOString = new Date().toISOString();
  const newStamina = staminaCurrent - STAMINA_COST;

  // Immediately deduct stamina and set the start time to prevent re-running the command.
  const { error: startUpdateErr } = await supabase
    .from('players')
    .update({
      stamina: newStamina,
      stamina_updated_at: nowISOString,
      last_explore_time: nowISOString,
    })
    .eq('user_id', userId)
    .eq('server_id', serverId);

  if (startUpdateErr) {
    console.error('Error starting exploration:', startUpdateErr);
    return interaction.editReply('❌ A database error occurred while trying to start your exploration.');
  }

  // Confirm to the user that the exploration has started.
  await interaction.editReply({
    content: `✅ Your exploration has begun! You will receive the results in your DMs in **${EXPLORE_DURATION_MINUTES} minutes**.`,
  });

  // --- Delayed action for exploration results ---
  // NOTE: This will not persist if the bot restarts. A more robust solution
  // would use a persistent job queue or cron job.
  setTimeout(async () => {
    try {
      // --- Fetch encounters ---
      const { data: encounters, error: encounterErr } = await supabase
        .from('encounters')
        .select('id, name, description, rewards, probability');

      if (encounterErr || !encounters || encounters.length === 0) {
        throw new Error('No encounters available.');
      }

      // --- Choose encounter based on weighted probability ---
      const totalProb = encounters.reduce((sum, e) => sum + Number(e.probability), 0);
      const rand = Math.random() * totalProb;
      let acc = 0;
      let chosenEncounter = encounters[0];
      for (const e of encounters) {
        acc += Number(e.probability);
        if (rand <= acc) {
          chosenEncounter = e;
          break;
        }
      }

      // --- Prepare to update resources and possibly troops ---
      // We need to fetch the player data again to avoid race conditions.
      const { data: currentPlayerState } = await supabase
        .from('players')
        .select('resources, units')
        .eq('user_id', userId)
        .eq('server_id', serverId)
        .single();
      
      if (!currentPlayerState) return; // Player might have been deleted

      const newResources = { ...currentPlayerState.resources };
      const newUnits = { ...currentPlayerState.units };
      const rewards = chosenEncounter.rewards as Record<string, any>;

      for (const [key, val] of Object.entries(rewards)) {
        if (key === 'troops') {
          if (typeof val === 'object' && val !== null) {
            for (const [unitName, count] of Object.entries(val)) {
              const lowerUnit = unitName.toLowerCase();
              newUnits[lowerUnit] = (newUnits[lowerUnit] ?? 0) + Number(count);
            }
          }
        } else {
          const currentVal = newResources[key] ?? 0;
          newResources[key] = Math.max(0, currentVal + Number(val));
        }
      }

      // --- Update player with rewards ---
      await supabase
        .from('players')
        .update({ resources: newResources, units: newUnits })
        .eq('user_id', userId)
        .eq('server_id', serverId);

      // --- Prepare and send DM ---
      let flavorText = '🌟 A fruitful exploration!';
      if (chosenEncounter.name.toLowerCase().includes('ambush')) flavorText = '⚠️ You were ambushed!';
      else if (chosenEncounter.name.toLowerCase().includes('nothing')) flavorText = '😶 Sometimes the world is quiet.';
      else if (chosenEncounter.name.toLowerCase().includes('troop')) flavorText = '🎉 You recruited new troops!';

      const rewardsText = Object.entries(rewards)
        .map(([k, v]) => {
          if (k === 'troops' && typeof v === 'object' && v !== null) {
            return Object.entries(v).map(([unit, count]) => `+${count} ${unit}`).join('\n');
          }
          return `${Number(v) >= 0 ? '+' : ''}${v} ${k}`;
        })
        .join('\n');

      const rewardValues = Object.values(rewards).flatMap(val => typeof val === 'object' ? Object.values(val) : [val]);
      const allPositive = rewardValues.every(v => Number(v) >= 0);
      const allNegative = rewardValues.every(v => Number(v) <= 0);

      let embedColor: number = Colors.Yellow;
      let embedTitle = `Mixed Outcome: ${chosenEncounter.name}`;
      if (allPositive) {
        embedColor = Colors.Green;
        embedTitle = `🌲 Successful Exploration: ${chosenEncounter.name}`;
      } else if (allNegative) {
        embedColor = Colors.Red;
        embedTitle = `🔥 Dangerous Encounter: ${chosenEncounter.name}`;
      }

      const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setDescription(chosenEncounter.description)
        .addFields(
          { name: 'Outcome', value: rewardsText || 'No change' },
          { name: 'Flavor', value: flavorText }
        )
        .setColor(embedColor);

      const user = await interaction.client.users.fetch(userId);
      await user.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error during delayed exploration execution:', error);
      try {
        const user = await interaction.client.users.fetch(userId);
        await user.send({ content: 'An unexpected error occurred with your exploration. Please contact an admin.' });
      } catch (dmError) {
        console.error('Failed to send error DM to user:', dmError);
      }
    }
  }, EXPLORE_DURATION_MINUTES * 60 * 1000);
}
