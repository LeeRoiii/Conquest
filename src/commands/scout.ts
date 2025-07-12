import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  User,
} from 'discord.js';
import { supabase } from '../supabaseClient';

const STAMINA_COST = 50;
const MAX_STAMINA = 200;
const STAMINA_REPLENISH_MINUTES = 15;
const SCOUT_COOLDOWN_MINUTES = 60;

export const data = new SlashCommandBuilder()
  .setName('scout')
  .setDescription('Scout another player and see their troop composition')
  .addUserOption(option =>
    option.setName('target')
      .setDescription('The player to scout')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const serverId = interaction.guildId!;
  const userId = interaction.user.id;
  const targetUser = interaction.options.getUser('target') as User;

  if (!targetUser || targetUser.bot) {
    return interaction.reply({ content: '❌ Invalid target user.', ephemeral: true });
  }

  if (targetUser.id === userId) {
    return interaction.reply({ content: '❌ You cannot scout yourself.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  // 🧙 Fetch the scout (current user)
  const { data: scoutPlayer, error: scoutError } = await supabase
    .from('players')
    .select('resources, units, stamina, stamina_updated_at, last_scout_time')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (scoutError || !scoutPlayer) {
    return interaction.editReply('❌ You must start your conquest first using `/start`.');
  }

  // Cooldown check
  if (scoutPlayer.last_scout_time) {
    const lastScout = new Date(scoutPlayer.last_scout_time);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastScout.getTime()) / 60000;

    if (diffMinutes < SCOUT_COOLDOWN_MINUTES) {
      const minutesLeft = Math.ceil(SCOUT_COOLDOWN_MINUTES - diffMinutes);
      return interaction.editReply(`⏳ Your scouts are still returning. Try again in **${minutesLeft} minute(s)**.`);
    }
  }

  // Recalculate stamina
  let stamina = scoutPlayer.stamina ?? MAX_STAMINA;
  if (scoutPlayer.stamina_updated_at) {
    const lastUpdate = new Date(scoutPlayer.stamina_updated_at);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);
    const gained = Math.floor(diffMinutes / STAMINA_REPLENISH_MINUTES);
    stamina = Math.min(MAX_STAMINA, stamina + gained);
  }

  if (stamina < STAMINA_COST) {
    return interaction.editReply(`❌ Not enough stamina. You need ${STAMINA_COST}, but you only have ${Math.floor(stamina)}.`);
  }

  // Fetch the target player
  const { data: targetPlayer, error: targetError } = await supabase
    .from('players')
    .select('username, units')
    .eq('user_id', targetUser.id)
    .eq('server_id', serverId)
    .single();

  if (targetError || !targetPlayer) {
    return interaction.editReply('❌ That player has not started their conquest.');
  }

  // Format troop info
  const unitEntries = Object.entries(targetPlayer.units || {});
  const unitList = unitEntries.length === 0
    ? 'No troops found.'
    : unitEntries.map(([k, v]) => `• ${k}: ${v}`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🕵️ Scout Report: ${targetPlayer.username}'s Army`)
    .setDescription(unitList)
    .setColor(Colors.DarkNavy)
    .setFooter({ text: `Scouting cost: ${STAMINA_COST} stamina | Returns in 1 hour` });

  // Update scout's stamina and cooldown
  const now = new Date();
  const nowISO = now.toISOString();
  const newStamina = stamina - STAMINA_COST;

  const { error: updateErr } = await supabase
    .from('players')
    .update({
      stamina: newStamina,
      stamina_updated_at: nowISO,
      last_scout_time: nowISO,
    })
    .eq('user_id', userId)
    .eq('server_id', serverId);

  if (updateErr) {
    console.error(updateErr);
    return interaction.editReply('❌ Something went wrong updating your scout status.');
  }

  // Try to DM the user
  try {
    await interaction.user.send({ embeds: [embed] });
    return interaction.editReply('📬 Your scout report has been sent to your DMs.');
  } catch {
    return interaction.editReply('❌ I couldn’t DM you. Please enable DMs from server members.');
  }
}
